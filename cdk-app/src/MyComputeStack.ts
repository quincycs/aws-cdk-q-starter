import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import { AdjustmentType } from 'aws-cdk-lib/aws-applicationautoscaling';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { NetworkLoadBalancer, NetworkTargetGroup, Protocol } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { StringParameter } from "aws-cdk-lib/aws-ssm";

import { NetworkLoadBalancedFargateService } from './lib/network-load-balanced-fargate-service';
import { NetworkLoadBalancedTaskImageOptions } from './lib/network-load-balanced-service-base';
import config from './config';

const {
  APIGW_API,
  APIGW_ROOT,
  DEFAULT_REGION,
  R53_PRIV_ZONE_ID,
  R53_PRIV_ZONE_NAME,
  SSM_TLS_PRIV_KEY,
  SSM_ACM_CERT_ARN,
  COMPUTE_ENV_NAME
} = config;
const containerPort = 8080;
const computeDNS = `${COMPUTE_ENV_NAME}.${R53_PRIV_ZONE_NAME}`;

interface MyComputeStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  dyTable: dynamodb.Table;
  localAssetPath?: string;
  ecrRepoName?: string;
}

export default class MyComputeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MyComputeStackProps) {
    super(scope, id, props);
    const { vpc, dyTable, localAssetPath, ecrRepoName } = props;

    // container image
    let codeImage: ecs.ContainerImage;
    if (ecrRepoName && localAssetPath) {
      throw new Error('Ecr repo name or Local asset path is required, but not both');
    } else if (ecrRepoName) {
      const repository = ecr.Repository.fromRepositoryName(this, 'Repository', ecrRepoName);
      codeImage = ecs.ContainerImage.fromEcrRepository(repository, process.env.CODEBUILD_RESOLVED_SOURCE_VERSION);
    } else if (localAssetPath) {
      codeImage = ecs.ContainerImage.fromAsset(localAssetPath);
    } else {
      throw new Error('ecr repo name or local asset path required');
    }

    const fargateService = this.genFargateServiceDefinition(vpc, codeImage, dyTable);
    this.genApiGatewayDefinition(fargateService.loadBalancer);
  }

  private genApiGatewayDefinition(
    loadBalancer: NetworkLoadBalancer
  ): apigw.IRestApi {

    const gateway = apigw.RestApi.fromRestApiAttributes(this, `${this.stackName}-ApiGateway`, {
      restApiId: APIGW_API,
      rootResourceId: APIGW_ROOT
    });

    // integrations
    const vpcLink = new apigw.VpcLink(this, 'VpcLink', {
      targets: [loadBalancer],
      vpcLinkName: `${this.stackName}-VpcLink`
    });
    const integration = new apigw.Integration({
      type: apigw.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: 'ANY',
      uri: `https://${computeDNS}`,
      options: {
        connectionType: apigw.ConnectionType.VPC_LINK,
        vpcLink,
      }
    });

    // api gateway resources & methods
    const latest = gateway.root.addResource(`${this.stackName}-latest`, {
      defaultIntegration: integration,
      defaultMethodOptions: {
        apiKeyRequired: true
      }
    });
    latest.addMethod('ANY');

    return gateway;
  }

  private genFargateServiceDefinition(
    vpc: ec2.Vpc,
    codeImage: ecs.ContainerImage,
    dyTable: dynamodb.Table
  ): NetworkLoadBalancedFargateService {

    const domainZone = HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: R53_PRIV_ZONE_ID,
      zoneName: R53_PRIV_ZONE_NAME
    });
    const loadBalancerCertArnParam = StringParameter.fromStringParameterAttributes(this, 'lbCertArn', {
      parameterName: SSM_ACM_CERT_ARN,
    });

    // Create a cluster
    const cluster = new ecs.Cluster(this, 'MyCluster', { vpc });
    const taskImageOptions = this.genFargateTaskImageOptions(codeImage, dyTable);

    const fargateService = new NetworkLoadBalancedFargateService(
      this, 'MyFargateService', {
      cluster,
      taskImageOptions,
      
      // resource allocation
      cpu: 256,
      memoryLimitMiB: 1024,
      capacityProviderStrategies: [
        {
          capacityProvider: 'FARGATE_SPOT',
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
      circuitBreaker: { rollback: true },
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f -k https://localhost:8080/ || exit 1'],
        startPeriod: cdk.Duration.seconds(60)
      }
    });

    this.setFargateTargetGroup(fargateService.targetGroup);
    this.setFargateServiceAutoScaling(fargateService.service);

    // grants
    fargateService.service.connections.allowFromAnyIpv4(ec2.Port.tcp(containerPort));
    dyTable.grantFullAccess(fargateService.taskDefinition.taskRole);

    return fargateService;
  }

  private genFargateTaskImageOptions(
    codeImage: ecs.ContainerImage,
    dyTable: dynamodb.Table
  ): NetworkLoadBalancedTaskImageOptions {

    // STDOUT/STDERR application logs
    const logDriver = ecs.LogDrivers.awsLogs({
      streamPrefix: 'my-fargate',
      logRetention: RetentionDays.ONE_WEEK
    });

    // Container needs private key to decrypt self-signed TLS traffic
    const tlsPrivateKeySecret = StringParameter.fromSecureStringParameterAttributes(this, 'privateKeySecret', {
      parameterName: SSM_TLS_PRIV_KEY,
      version: 1
    });

    return {
      enableLogging: true,
      logDriver,
      image: codeImage,
      containerPort,
      environment: {
        dbTableName: dyTable.tableName,
        AWS_DEFAULT_REGION: DEFAULT_REGION
      },
      secrets: {
        tlsPrivateKey: ecs.Secret.fromSsmParameter(tlsPrivateKeySecret)
      }
    };
  }

  private setFargateTargetGroup(targetGroup: NetworkTargetGroup) {
    // "For the duration of the configured timeout, the load balancer will allow existing, in-flight requests made to an instance to complete, but it will not send any new requests to the instance." https://aws.amazon.com/blogs/aws/elb-connection-draining-remove-instances-from-service-with-care/
    targetGroup.setAttribute("deregistration_delay.timeout_seconds", "60");
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