import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

import config from './config';
import { InterfaceVpcEndpointAwsService } from 'aws-cdk-lib/aws-ec2';
const { DEFAULT_REGION, DEFAULT_NAT_IMAGE, RemovalPolicy } = config;

/*
 * Defines the networking and data storage componentns
 */
export default class MyNetworkDataStack extends cdk.Stack {

  public Vpc: ec2.Vpc;
  public DyTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpceSubnetSelection = { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS };

    this.Vpc = new ec2.Vpc(this, 'MyVpc', {
      maxAzs: 2,
      natGateways: 1, // for full availability, increase to match maxAZs.
      natGatewayProvider: this.getNatInstanceProvider(), // for full availability , use default option.  NAT instance used to save $.
      cidr: '10.10.0.0/22',
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
        },
      ],
      gatewayEndpoints: {
        dbEndpoint: {
          service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
          subnets: [vpceSubnetSelection]
        }
      },
    });
    this.DyTable = this.genDyTableDefinition();

    // https://aws.amazon.com/premiumsupport/knowledge-center/ecs-unable-to-pull-secrets/
    // "Check your Amazon VPC endpoints"
    this.Vpc.addInterfaceEndpoint('SSM_VPCE', {
      service: InterfaceVpcEndpointAwsService.SSM,
      subnets: vpceSubnetSelection
    });

    this.Vpc.addInterfaceEndpoint('ECR_VPCE', {
      service: InterfaceVpcEndpointAwsService.ECR,
      subnets: vpceSubnetSelection
    });

    this.Vpc.addInterfaceEndpoint('ECRDK_VPCE', {
      service: InterfaceVpcEndpointAwsService.ECR_DOCKER,
      subnets: vpceSubnetSelection
    });

    this.Vpc.addInterfaceEndpoint('CloudWatch_VPCE', {
      service: InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      subnets: vpceSubnetSelection
    });

    this.Vpc.addInterfaceEndpoint('S3_VPCE', {
      service: InterfaceVpcEndpointAwsService.S3,
      subnets: vpceSubnetSelection
    });

    new cdk.CfnOutput(this, 'DynamoDB-TableName', { value: this.DyTable.tableName });
  }

  private getNatInstanceProvider(): ec2.NatProvider {
    const natImage: { [region: string]: string } = {};
    natImage[DEFAULT_REGION] = DEFAULT_NAT_IMAGE;

    return ec2.NatProvider.instance({
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3A, ec2.InstanceSize.NANO),
      machineImage: new ec2.GenericLinuxImage(natImage)
    })
  }

  private genDyTableDefinition(): dynamodb.Table {
    return new dynamodb.Table(this, 'Table', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy
    });
  }
}