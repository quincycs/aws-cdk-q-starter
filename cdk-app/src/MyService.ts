import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as ecs from '@aws-cdk/aws-ecs';
import * as ecr from '@aws-cdk/aws-ecr';
import * as ecs_patterns from '@aws-cdk/aws-ecs-patterns';
import * as apigw from '@aws-cdk/aws-apigateway';

import { AdjustmentType } from '@aws-cdk/aws-applicationautoscaling';
import { RetentionDays } from '@aws-cdk/aws-logs';

import { EC2_KEY_PAIR, APIGW_API, APIGW_ROOT, DEFAULT_REGION, DEFAULT_NAT_IMAGE, RemovalPolicy } from './config';
import { Protocol } from '@aws-cdk/aws-elasticloadbalancingv2';
import { BaseStack } from './BaseStack';

class DataStack extends BaseStack {

  public Vpc: ec2.Vpc;
  public DyTable: dynamodb.Table;

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    this.Vpc = new ec2.Vpc(this, 'MyVpc', {
      maxAzs: 2,
      natGateways: 1,
      natGatewayProvider: ec2.NatProvider.instance({
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3A, ec2.InstanceSize.NANO),
        machineImage: new ec2.GenericLinuxImage({
          DEFAULT_REGION: DEFAULT_NAT_IMAGE
        }),
        keyName: EC2_KEY_PAIR,
      }),
      cidr: '10.10.0.0/22',
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          name: 'Private', 
          subnetType: ec2.SubnetType.PRIVATE
        },
      ],
      gatewayEndpoints: {
        dbEndpoint: {
          service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
          subnets: [
            { subnetType: ec2.SubnetType.PRIVATE }
          ]
        }
      },
    });
    this.DyTable = new dynamodb.Table(this, 'Table', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy
    });
    new cdk.CfnOutput(this, 'DynamoDB-TableName', { value: this.DyTable.tableName });
  }
}

interface DevServerStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  dyTable: dynamodb.Table;
  keyPairName: string;
}

class DevServerStack extends BaseStack {
  constructor(scope: cdk.Construct, id: string, props: DevServerStackProps) {
    super(scope, id, props);
    const vpc = props.vpc;
    const devserver = new ec2.Instance(this, 'Instance', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3A, ec2.InstanceSize.MEDIUM),
      machineImage: new ec2.AmazonLinuxImage({ generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2 }),
      keyName: props.keyPairName,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      }
    });
    const ip = new ec2.CfnEIP(this, 'EIP', {
      domain: "vpc"
    });
    new ec2.CfnEIPAssociation(this, 'EIPAssoc', {
      instanceId: devserver.instanceId,
      allocationId: ip.attrAllocationId,
    });
    devserver.connections.allowFromAnyIpv4(ec2.Port.tcp(22));
    devserver.connections.allowToAnyIpv4(ec2.Port.allTraffic());
    devserver.addUserData(
      'yum update -y',
      'yum install git -y',
      //docker 
      'amazon-linux-extras install docker -y',
      'service docker start',
      'usermod -a -G docker ec2-user',
      'chkconfig docker on',
      //node
      'su ec2-user -c "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash"',
      'su ec2-user -c ". ~/.nvm/nvm.sh && nvm install 14.15.1"',
    );
    props.dyTable.grantFullAccess(devserver);
  }
}

interface FargateStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  dyTable: dynamodb.Table;
  localAssetPath?: string;
  ecrRepoName?: string;
}
class FargateStack extends BaseStack {
  constructor(scope: cdk.Construct, id: string, props: FargateStackProps) {
    super(scope, id, props);
    const {vpc, dyTable, localAssetPath, ecrRepoName} = props;

    // Create a cluster
    const cluster = new ecs.Cluster(this, 'MyCluster', { vpc });

    // STDOUT/STDERR application logs
    const logDriver = ecs.LogDrivers.awsLogs({
      streamPrefix: 'my-fargate',
      logRetention: RetentionDays.ONE_WEEK
    });

    // container image
    let codeImage: ecs.ContainerImage;
    if (ecrRepoName) {
      const repository = ecr.Repository.fromRepositoryName(this, 'Repository', ecrRepoName);
      codeImage = ecs.ContainerImage.fromEcrRepository(repository, process.env.CODEBUILD_RESOLVED_SOURCE_VERSION);
    } else if (localAssetPath) {
      codeImage = ecs.ContainerImage.fromAsset(localAssetPath);
    } else {
      throw new Error('ecr repo name or local asset path required');
    }

    const containerPort = 8080;
    // Create Fargate Service
    const fargateService = new ecs_patterns.NetworkLoadBalancedFargateService(
      this, 'MyFargateService', {
      cluster,
      taskImageOptions: {
        enableLogging: true,
        logDriver,
        image: codeImage,
        containerPort,
        environment: {
          dbTableName: dyTable.tableName,
          AWS_DEFAULT_REGION: DEFAULT_REGION
        }
      },
      desiredCount: 1, //TODO battle test. need to be set as currently scaled out? (so a deployment doesn't lose availability)
      minHealthyPercent: 100, //TODO battle test. load test deployment while current instances serving constant load. ( any errs with 1 instance at 40% load? 2 at 40%?)
      maxHealthyPercent: 200,
      cpu: 256,
      memoryLimitMiB: 1024,
      publicLoadBalancer: false,
    });
    fargateService.service.connections.allowFromAnyIpv4(ec2.Port.tcp(containerPort));

    const scaling = fargateService.service.autoScaleTaskCount({ maxCapacity: 2 });
    /*
        Scaling         -1          (no change)          +1       +3
                    │        │                       │        │        │
                    ├────────┼───────────────────────┼────────┼────────┤
                    │        │                       │        │        │
        Worker use  0%      10%                     50%      70%      100%
    */
    scaling.scaleOnMetric('CpuScaling', {
      cooldown: cdk.Duration.seconds(60),
      metric: fargateService.service.metricCpuUtilization(),
      scalingSteps: [
        { upper: 10, change: -1 },
        { lower: 50, change: +1 },
        { lower: 70, change: +3 },
      ],
      // Change this to AdjustmentType.PERCENT_CHANGE_IN_CAPACITY to interpret the
      // 'change' numbers before as percentages instead of capacity counts.
      adjustmentType: AdjustmentType.CHANGE_IN_CAPACITY
    });
    fargateService.targetGroup.setAttribute("deregistration_delay.timeout_seconds", "600");
    fargateService.targetGroup.configureHealthCheck({
      protocol: Protocol.TCP,
      enabled: true
    });

    dyTable.grantFullAccess(fargateService.taskDefinition.taskRole);

    const vpcLink = new apigw.VpcLink(this, 'VpcLink', {
      targets: [fargateService.loadBalancer],
      vpcLinkName: `${this.stackName}-VpcLink`
    });
    const integration = new apigw.Integration({
      type: apigw.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: 'ANY',
      options: {
        connectionType: apigw.ConnectionType.VPC_LINK,
        vpcLink,
      }
    });
    const gateway = apigw.RestApi.fromRestApiAttributes(this, `${this.stackName}-ApiGateway`, {
      restApiId: APIGW_API,
      rootResourceId: APIGW_ROOT
    });
    const latest = gateway.root.addResource(`${this.stackName}-latest`, {
      defaultIntegration: integration,
      defaultMethodOptions: {
        apiKeyRequired: true
      }
    });
    latest.addMethod('ANY');
  }
}

interface EnvProps {
  isProd: boolean;
  stackPrefix: string;
  computeStackPrefix: string;
  localAssetPath?: string;
  ecrRepoName?: string;
  tags?: { [key: string]: string; };
}

export default class MyService extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: EnvProps) {
    super(scope, id);
    const { isProd, stackPrefix, localAssetPath, ecrRepoName, computeStackPrefix, tags } = props;

    const dataStack = new DataStack(scope, `${stackPrefix}-base`, {tags});

    const fargateStack = new FargateStack(scope, `${stackPrefix}-${computeStackPrefix}-fargate`, {
      vpc: dataStack.Vpc,
      dyTable: dataStack.DyTable,
      localAssetPath,
      ecrRepoName,
      tags
    });
    fargateStack.addDependency(dataStack);

    if (!isProd) {
      const devStack = new DevServerStack(scope, `${stackPrefix}-user1-devserver-stack`, {
        vpc: dataStack.Vpc,
        dyTable: dataStack.DyTable,
        keyPairName: EC2_KEY_PAIR,
        tags
      });
      devStack.addDependency(dataStack);
    }
  }
}
