import { Construct } from 'constructs';

import MyNetworkDataStack from './MyNetworkDataStack';
import MyComputeStack from './MyComputeStack';
import MyApiGatewayStack from './MyApiGatewayStack';
import { setContext } from './contextConfig';
import config from './config';
// import MyDevServerStack from './MyDevserverStack';
// import { EC2_KEY_PAIR } from './config';

const { APP_NAME } = config;

interface MyServiceProps {
  envName: string;
  computeName: string;
  localAssetPath?: string;
  ecrRepoArn?: string;
  tags?: { [key: string]: string; };
}

/*
 * Composes the reusable stacks to define an environment.
 */
export default class MyService extends Construct {
  constructor(scope: Construct, id: string, props: MyServiceProps) {
    super(scope, id);
    const { envName, computeName, localAssetPath, ecrRepoArn, tags } = props;
    setContext({
      envName,
      computeName
    });

    const dataStack = new MyNetworkDataStack(this, 'data', {
      stackName: `${envName}-data`,
      description: 'Has no dependencies.',
      tags
    });

    const computeStack = new MyComputeStack(this, 'compute', {
      stackName: `${envName}-${APP_NAME}-${computeName}`,
      vpc: dataStack.Vpc,
      dyTable: dataStack.DyTable,
      localAssetPath,
      ecrRepoArn,
      tags,
      description: `Depends on stack: ${dataStack.stackName}`
    });
    computeStack.addDependency(dataStack);

    const apiStack = new MyApiGatewayStack(this, 'apigateway', {
      stackName: `${envName}-apigateway`,
      vpcLink: computeStack.vpcLink,
      description: `Depends on stack: ${computeStack.stackName}`
    });
    apiStack.addDependency(computeStack);

    // const devStack = new MyDevServerStack(this, `${envName}-${APP_NAME}-user1-devserver`, {
    //   vpc: dataStack.Vpc,
    //   dyTable: dataStack.DyTable,
    //   keyPairName: EC2_KEY_PAIR,
    //   tags
    // });
    // devStack.addDependency(dataStack);
  }
}
