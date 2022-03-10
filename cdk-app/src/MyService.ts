import { Construct } from 'constructs';

import MyNetworkDataStack from './MyNetworkDataStack';
import MyComputeStack from './MyComputeStack';
import config from './config';
import MyApiGatewayStack from './MyApiGatewayStack';
import { setContext } from './contextConfig';
// import MyDevServerStack from './MyDevserverStack';
// import { EC2_KEY_PAIR } from './config';

const { APP_NAME, COMPUTE_NAME, R53_PRIV_ZONE_NAME } = config;

interface MyServiceProps {
  envName: string;
  localAssetPath?: string;
  ecrRepoName?: string;
  tags?: { [key: string]: string; };
}

/*
 * Composes the reusable stacks to define an environment.
 */
export default class MyService extends Construct {
  constructor(scope: Construct, id: string, props: MyServiceProps) {
    super(scope, id);
    const { envName, localAssetPath, ecrRepoName, tags } = props;
    setContext({
      envName,
      computeDNS: `${envName}-${APP_NAME}-${COMPUTE_NAME}.${R53_PRIV_ZONE_NAME}`
    });

    const dataStack = new MyNetworkDataStack(scope, `${envName}-data`, {
      stackName: `${envName}-data`,
      tags
    });

    const computeStack = new MyComputeStack(scope, `${envName}-${APP_NAME}-${COMPUTE_NAME}`, {
      stackName: `${envName}-${APP_NAME}-${COMPUTE_NAME}`,
      vpc: dataStack.Vpc,
      dyTable: dataStack.DyTable,
      localAssetPath,
      ecrRepoName,
      tags,
      description: 'Depends on data stack'
    });
    computeStack.addDependency(dataStack);

    const apiStack = new MyApiGatewayStack(scope, `${envName}-apigateway`, {
      stackName: `${envName}-apigateway`,
      vpcLink: computeStack.vpcLink,
      description: `Depends on ${COMPUTE_NAME} stack`
    });
    apiStack.addDependency(computeStack);

    // const devStack = new MyDevServerStack(scope, `${envName}-${APP_NAME}-user1-devserver`, {
    //   vpc: dataStack.Vpc,
    //   dyTable: dataStack.DyTable,
    //   keyPairName: EC2_KEY_PAIR,
    //   tags
    // });
    // devStack.addDependency(dataStack);
  }
}
