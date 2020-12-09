import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import * as pipelines from '@aws-cdk/pipelines';

class DataStack extends cdk.Stack {

  public Vpc : ec2.Vpc;
  public DyTable : dynamodb.Table;

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    this.Vpc = new ec2.Vpc(this, 'MyVpc', { 
      maxAzs: 3,
      gatewayEndpoints: {
        dbEndpoint: {
          service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
          subnets: [
            { subnetType: ec2.SubnetType.PUBLIC },
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
  }
}

class DeployStage extends cdk.Stage {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);
    const dataStack = new DataStack(this, `user1-data-stack`);
    const devStack = new DevServerStack(this, `user1-devserver-stack`, dataStack);
    devStack.addDependency(dataStack);
  }
}

class PipelineStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const sourceArtifact = new codepipeline.Artifact();
    const cdkOutputArtifact = new codepipeline.Artifact();

    const pipeline = new pipelines.CdkPipeline(this, 'CdkPipeline', {
      pipelineName: 'cdk-cdkpipeline',
      cloudAssemblyArtifact: cdkOutputArtifact,
      sourceAction: new codepipeline_actions.GitHubSourceAction({
        actionName: 'aws-cdk-sample-pipeline',
        owner: 'quincycs',
        repo: 'aws-cdk-sample',
        oauthToken: cdk.SecretValue.secretsManager('/github.com/quincycs'),
        output: sourceArtifact,
      }),
      synthAction: pipelines.SimpleSynthAction.standardNpmSynth({
        sourceArtifact: sourceArtifact,
        cloudAssemblyArtifact: cdkOutputArtifact,
        subdirectory: 'cdk-app',
        installCommand: 'npm ci',
        buildCommand: 'npm run build',
        synthCommand: 'npm run synth'
      }),
    });
    const localStage = new DeployStage(this, 'AppDeploy');
    pipeline.addApplicationStage(localStage);
  }
}

const app = new cdk.App();
new PipelineStack(app, 'PipelineStack');
app.synth();