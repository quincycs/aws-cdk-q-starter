import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import { AdjustmentType } from 'aws-cdk-lib/aws-applicationautoscaling';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { NetworkLoadBalancer, NetworkTargetGroup, Protocol } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { HostedZone, IHostedZone } from 'aws-cdk-lib/aws-route53';
import { StringParameter } from "aws-cdk-lib/aws-ssm";

import { NetworkLoadBalancedFargateService } from './lib/network-load-balanced-fargate-service';
import { NetworkLoadBalancedTaskImageOptions } from './lib/network-load-balanced-service-base';
import config from './config';
import { getContext } from './contextConfig';
import { genComputeDNS } from './utils';
import { BasicContainerImage } from './lib/basic-container-image';
import { ManagedPolicy, Policy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';

const {
  DEFAULT_REGION,
  SSM_R53_PRIV_ZONE_ID,
  SSM_R53_PRIV_ZONE_NAME,
  SSM_TLS_PRIV_KEY,
  SSM_ACM_CERT_ARN
} = config;
const containerPort = 8080;

interface MyComputeStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  dyTable: dynamodb.Table;
  localAssetPath?: string;
  ecrRepoUrl?: string;
}

export default class MyComputeStack extends cdk.Stack {

  public vpcLink: apigw.VpcLink;

  constructor(scope: Construct, id: string, props: MyComputeStackProps) {
    super(scope, id, props);
    const { vpc, dyTable, localAssetPath, ecrRepoUrl } = props;

    // container image
    let codeImage: ecs.ContainerImage;
    if (ecrRepoUrl && localAssetPath) {
      throw new Error('Ecr repo name or Local asset path is required, but not both');
    } else if (ecrRepoUrl) {
      codeImage = new BasicContainerImage(`${ecrRepoUrl}:${process.env.CODEBUILD_RESOLVED_SOURCE_VERSION}`);
    } else if (localAssetPath) {
      codeImage = ecs.ContainerImage.fromAsset(localAssetPath);
    } else {
      throw new Error('ecr repo name or local asset path required');
    }

    const fargateService = this.genFargateServiceDefinition(vpc, codeImage, dyTable);
    this.vpcLink = this.genApiGatewayVpcLink(fargateService.loadBalancer);
  }

  private genFargateServiceDefinition(
    vpc: ec2.Vpc,
    codeImage: ecs.ContainerImage,
    dyTable: dynamodb.Table
  ): NetworkLoadBalancedFargateService {
    const { envName } = getContext();
    const computeDNS = genComputeDNS(this);
    const domainZone = this.genDomainZone();
    const loadBalancerCertArnParam = StringParameter.fromStringParameterAttributes(this, 'lbCertArn', {
      parameterName: SSM_ACM_CERT_ARN.replace("{envName}", envName),
    });
    const tlsPrivateKeySecret = StringParameter.fromSecureStringParameterAttributes(this, 'privateKeySecret', {
      parameterName: SSM_TLS_PRIV_KEY.replace('{envName}', envName)
    });

    // Create a cluster
    const cluster = new ecs.Cluster(this, 'MyCluster', { vpc });
    const taskImageOptions = this.genFargateTaskImageOptions(codeImage, dyTable, tlsPrivateKeySecret);

    const fargateService = new NetworkLoadBalancedFargateService(
      this, 'MyFargateService', {
      cluster,
      taskImageOptions,
      
      // resource allocation
      cpu: 256,
      memoryLimitMiB: 1024,
      capacityProviderStrategies: [
        {
          capacityProvider: 'FARGATE_SPOT', // this is using 100% spot instances to save $. To balance cost / risk, use a mix of spot & ondemand.
          weight: 1
        }
      ],

      // initial scaling
      desiredCount: 2,
      minHealthyPercent: 100,
      maxHealthyPercent: 300,
      
      // load balancer / routing
      publicLoadBalancer: false,
      loadBalancerCertificates: [{certificateArn:loadBalancerCertArnParam.stringValue}],
      listenerPort: 443,
      domainZone,
      domainName: computeDNS,

      // health / recovery
      // circuitBreaker: { rollback: true },
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f -k https://localhost:8080/ || exit 1'],
        startPeriod: cdk.Duration.seconds(60)
      }
    });

    this.setFargateTargetGroup(fargateService.targetGroup);
    this.setFargateServiceAutoScaling(fargateService.service);

    // grants
    fargateService.service.connections.allowFromAnyIpv4(ec2.Port.tcp(containerPort));
    const execRole = fargateService.taskDefinition.obtainExecutionRole();
    execRole.attachInlinePolicy(new Policy(this, 'allowECR', {
      statements: [new PolicyStatement({
        sid: 'allowECR',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: [
          'ecr:GetAuthorizationToken',
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage'
        ],
        resources: ['*']
      })]
    }));
    // tlsPrivateKeySecret.grantRead(execRole); // already done for every secret by ecs-patterns.
    const taskRole = fargateService.taskDefinition.taskRole;
    dyTable.grantFullAccess(taskRole);

    return fargateService;
  }

  private genDomainZone() : IHostedZone {
    const { envName } = getContext();

    const privateZoneIdParam = StringParameter.fromStringParameterAttributes(this, 'privateZoneIdParam', {
      parameterName: SSM_R53_PRIV_ZONE_ID.replace('{envName}', envName),
    });
    const privateZoneNameParam = StringParameter.fromStringParameterAttributes(this, 'privateZoneNameParam', {
      parameterName: SSM_R53_PRIV_ZONE_NAME.replace('{envName}', envName),
    });
    return HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: privateZoneIdParam.stringValue,
      zoneName: privateZoneNameParam.stringValue
    });
  }

  private genFargateTaskImageOptions(
    codeImage: ecs.ContainerImage,
    dyTable: dynamodb.Table,
    tlsPrivateKeySecret: cdk.aws_ssm.IStringParameter
  ): NetworkLoadBalancedTaskImageOptions {
    // STDOUT/STDERR application logs
    const logDriver = ecs.LogDrivers.awsLogs({
      streamPrefix: 'my-fargate',
      logRetention: RetentionDays.ONE_WEEK
    });

    // const ecsExecRole = new Role(this, 'FargateTaskExecutionServiceRole', {
    //   assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
    //   managedPolicies: [
    //     ManagedPolicy.fromAwsManagedPolicyName('AmazonECSTaskExecutionRolePolicy')
    //   ]
    // });

    return {
      enableLogging: true,
      logDriver,
      image: codeImage,
      containerPort,
      // executionRole: ecsExecRole,
      environment: {
        dbTableName: dyTable.tableName,
        AWS_DEFAULT_REGION: DEFAULT_REGION
      },
      secrets: {
        // Container needs private key to decrypt self-signed TLS traffic
        tlsPrivateKey: ecs.Secret.fromSsmParameter(tlsPrivateKeySecret)
      }
    };
  }

  private genApiGatewayVpcLink(
    loadBalancer: NetworkLoadBalancer
  ) {
    return new apigw.VpcLink(this, 'VpcLink', {
      targets: [loadBalancer],
      vpcLinkName: `${this.stackName}-VpcLink`
    });
  }

  private setFargateTargetGroup(targetGroup: NetworkTargetGroup) {
    // "For the duration of the configured timeout, the load balancer will allow existing, in-flight requests made to an instance to complete, but it will not send any new requests to the instance." https://aws.amazon.com/blogs/aws/elb-connection-draining-remove-instances-from-service-with-care/
    targetGroup.setAttribute("deregistration_delay.timeout_seconds", "10");
    targetGroup.configureHealthCheck({
      protocol: Protocol.TCP,
      enabled: true
    });
  }

  private setFargateServiceAutoScaling(service: ecs.FargateService) {
    const scaling = service.autoScaleTaskCount({
      minCapacity: 2,
      maxCapacity: 6
    });
    /*
        Scaling         -1          (no change)          +1       +3
                    │        │                       │        │        │
                    ├────────┼───────────────────────┼────────┼────────┤
                    │        │                       │        │        │
        Worker use  0%      10%                     50%      70%      100%
    */
    scaling.scaleOnMetric('CpuScaling', {
      cooldown: cdk.Duration.seconds(60),
      metric: service.metricCpuUtilization(),
      scalingSteps: [
        { upper: 10, change: -1 },
        { lower: 50, change: +1 },
        { lower: 70, change: +3 },
      ],
      // Change this to AdjustmentType.PERCENT_CHANGE_IN_CAPACITY to interpret the
      // 'change' numbers before as percentages instead of capacity counts.
      adjustmentType: AdjustmentType.CHANGE_IN_CAPACITY
    });
  }
}