import { Construct } from 'constructs';

import MyNetworkDataStack from './MyNetworkDataStack';
import MyComputeStack from './MyComputeStack';
import config from './config';
import MyApiGatewayStack from './MyApiGatewayStack';
import { setContext } from './contextConfig';
// import MyDevServerStack from './MyDevserverStack';
// import { EC2_KEY_PAIR } from './config';

const { APP_NAME, COMPUTE_NAME, R53_PRIV_ZONE_NAME, DEV_MODE, DEV_MODE_ENV_NAME } = config;

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

    // when locally deploying, stacks should include envName
    // when pipeline deploys, the stage name will automatically be included.
    const stackPrefix = DEV_MODE ? DEV_MODE_ENV_NAME : '';

    const dataStack = new MyNetworkDataStack(scope, `${stackPrefix}-data`, { tags });

    const computeStack = new MyComputeStack(scope, `${stackPrefix}-${APP_NAME}-${COMPUTE_NAME}`, {
      vpc: dataStack.Vpc,
      dyTable: dataStack.DyTable,
      localAssetPath,
      ecrRepoName,
      tags
    });
    computeStack.addDependency(dataStack);

    const apiStack = new MyApiGatewayStack(scope, `${stackPrefix}-${APP_NAME}-apigateway`, {
      vpcLink: computeStack.vpcLink
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
