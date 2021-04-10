import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as ecs from '@aws-cdk/aws-ecs';
import * as ecr from '@aws-cdk/aws-ecr';
import * as apigw from '@aws-cdk/aws-apigateway';

import { AdjustmentType } from '@aws-cdk/aws-applicationautoscaling';
import { RetentionDays } from '@aws-cdk/aws-logs';

import { APIGW_API, APIGW_ROOT, DEFAULT_REGION } from './config';
import { Protocol } from '@aws-cdk/aws-elasticloadbalancingv2';
import { NetworkLoadBalancedFargateService } from './lib/network-load-balanced-fargate-service';

interface FargateStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  dyTable: dynamodb.Table;
  localAssetPath?: string;
  ecrRepoName?: string;
}

export default class MyComputeStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: FargateStackProps) {
    super(scope, id, props);
    const { vpc, dyTable, localAssetPath, ecrRepoName } = props;

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
    const fargateService = new NetworkLoadBalancedFargateService(
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
      desiredCount: 1,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      cpu: 256,
      memoryLimitMiB: 1024,
      publicLoadBalancer: false,
      circuitBreaker: { rollback: true },
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:8080/ || exit 1'],
        startPeriod: cdk.Duration.seconds(60)
      }
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