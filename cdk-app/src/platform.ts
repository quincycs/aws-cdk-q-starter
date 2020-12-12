import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as ecr from '@aws-cdk/aws-ecr'
import * as ecs from '@aws-cdk/aws-ecs';
import * as ecs_patterns from '@aws-cdk/aws-ecs-patterns';

import { AdjustmentType } from '@aws-cdk/aws-applicationautoscaling';
import { RetentionDays } from '@aws-cdk/aws-logs';

import { DEV_MODE, ECR_IMAGE_TAG } from './config';

const DEFAULT_REGION = 'us-west-2';

class DataStack extends cdk.Stack {

  public Vpc: ec2.Vpc;
  public DyTable: dynamodb.Table;

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    this.Vpc = new ec2.Vpc(this, 'MyVpc', {
      maxAzs: 2,
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
      // The default removal policy is RETAIN, which means that cdk destroy will not attempt to delete
      // the new table, and it will remain in your account until manually deleted. By setting the policy to 
      // DESTROY, cdk destroy will delete the table (even if it has data in it)
      removalPolicy: cdk.RemovalPolicy.DESTROY, // NOT recommended for production code
    });
    new cdk.CfnOutput(this, 'DynamoDB-TableName', { value: this.DyTable.tableName });
  }
}

class DevServerStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, data: DataStack, props?: cdk.StackProps) {
    super(scope, id, props);
    const vpc = data.Vpc;
    const devserver = new ec2.Instance(this, 'Instance', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3A, ec2.InstanceSize.MEDIUM),
      machineImage: new ec2.AmazonLinuxImage({ generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2 }),
      keyName: 'user1-key-pair', // Existing resource outside of CDK deployment
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
    data.DyTable.grantFullAccess(devserver);
  }
}

class FargateStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, data: DataStack, props?: cdk.StackProps) {
    super(scope, id, props);
    const vpc = data.Vpc;
    const table = data.DyTable;

    // Create a cluster
    const cluster = new ecs.Cluster(this, 'MyCluster', { vpc });

    // STDOUT/STDERR application logs
    const logDriver = ecs.LogDrivers.awsLogs({
      streamPrefix: 'my-fargate',
      logRetention: RetentionDays.ONE_WEEK
    });

    const repository = ecr.Repository.fromRepositoryName(this, 'Repository', 'aws-cdk-sample/app');

    // Create Fargate Service
    const fargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(
      this, 'MyFargateService', {
      cluster,
      taskImageOptions: {
        enableLogging: true,
        logDriver,
        image: ecs.ContainerImage.fromEcrRepository(repository, ECR_IMAGE_TAG),
        containerPort: 8080,
        environment: {
          dbTableName: table.tableName,
          AWS_DEFAULT_REGION: DEFAULT_REGION
        }
      },
      desiredCount: 1, //TODO battle test. need to be set as currently scaled out? (so a deployment doesn't lose availability)
      minHealthyPercent: 100, //TODO battle test. load test deployment while current instances serving constant load. ( any errs with 1 instance at 40% load? 2 at 40%?)
      maxHealthyPercent: 200,
      cpu: 256,
      memoryLimitMiB: 1024,
      publicLoadBalancer: true,
    });

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
      enabled: true,
      path: '/',
    })

    data.DyTable.grantFullAccess(fargateService.taskDefinition.taskRole);

    new cdk.CfnOutput(this, 'LoadBalancerDNS', { value: fargateService.loadBalancer.loadBalancerDnsName });
  }
}

export default function platform(scope: cdk.Construct) {
  const dataStack = new DataStack(scope, `base-stack`);
  const fargateStack = new FargateStack(scope, 'fargate-stack', dataStack);
  fargateStack.addDependency(dataStack);

  if (DEV_MODE) {
    const devStack = new DevServerStack(scope, `user1-devserver-stack`, dataStack);
    devStack.addDependency(dataStack);
  }
}
