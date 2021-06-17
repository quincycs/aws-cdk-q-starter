import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as dynamodb from '@aws-cdk/aws-dynamodb';

interface MyDevServerStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  dyTable: dynamodb.Table;
  keyPairName: string;
}

/*
 * Defines an ec2 instance inside the VPC that can be ssh'ed into
 *  therefore allowing access to develop inside the VPC.
 */
export default class MyDevServerStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: MyDevServerStackProps) {
    super(scope, id, props);
    const { vpc, keyPairName } = props;

    const devserver = this.genDevserverDefinition(vpc, keyPairName);

    // grants
    devserver.connections.allowFromAnyIpv4(ec2.Port.tcp(22));
    devserver.connections.allowToAnyIpv4(ec2.Port.allTraffic());
    props.dyTable.grantFullAccess(devserver);

    // integrations
    const ip = new ec2.CfnEIP(this, 'EIP', {
      domain: "vpc"
    });
    new ec2.CfnEIPAssociation(this, 'EIPAssoc', {
      instanceId: devserver.instanceId,
      allocationId: ip.attrAllocationId,
    });
  }

  private genDevserverDefinition(vpc: ec2.Vpc, keyName: string) {
    const instance = new ec2.Instance(this, 'Instance', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.LARGE),
      machineImage: new ec2.AmazonLinuxImage({ generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2 }),
      keyName,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      }
    });

    instance.addUserData(
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

    return instance;
  }
}
