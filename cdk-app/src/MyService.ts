import { Construct } from 'constructs';

import MyNetworkDataStack from './MyNetworkDataStack';
import MyComputeStack from './MyComputeStack';
import config from './config';
// import MyDevServerStack from './MyDevserverStack';
// import { EC2_KEY_PAIR } from './config';

const { ENV_NAME, COMPUTE_ENV_NAME } = config;

interface EnvProps {
  localAssetPath?: string;
  ecrRepoName?: string;
  tags?: { [key: string]: string; };
}

/*
 * Composes the reusable stacks to define an environment.
 */
export default class MyService extends Construct {
  constructor(scope: Construct, id: string, props: EnvProps) {
    super(scope, id);
    const { localAssetPath, ecrRepoName, tags } = props;

    const dataStack = new MyNetworkDataStack(scope, `${ENV_NAME}-data`, { tags });

    const computeStack = new MyComputeStack(scope, `${COMPUTE_ENV_NAME}-compute`, {
      vpc: dataStack.Vpc,
      dyTable: dataStack.DyTable,
      localAssetPath,
      ecrRepoName,
      tags
    });
    computeStack.addDependency(dataStack);

    // const devStack = new MyDevServerStack(scope, `${ENV_NAME}-user1-devserver`, {
    //   vpc: dataStack.Vpc,
    //   dyTable: dataStack.DyTable,
    //   keyPairName: EC2_KEY_PAIR,
    //   tags
    // });
    // devStack.addDependency(dataStack);
  }
}
