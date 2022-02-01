import { Construct } from 'constructs';

import MyNetworkDataStack from './MyNetworkDataStack';
import MyComputeStack from './MyComputeStack';
// import MyDevServerStack from './MyDevserverStack';
// import { EC2_KEY_PAIR } from './config';

interface EnvProps {
  isProd: boolean;
  stackPrefix: string;
  computeStackPrefix: string;
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
    const { stackPrefix, localAssetPath, ecrRepoName, computeStackPrefix, tags } = props;

    const dataStack = new MyNetworkDataStack(scope, `${stackPrefix}-base`, { tags });

    const computeStack = new MyComputeStack(scope, `${stackPrefix}-${computeStackPrefix}-fargate`, {
      vpc: dataStack.Vpc,
      dyTable: dataStack.DyTable,
      localAssetPath,
      ecrRepoName,
      tags
    });
    computeStack.addDependency(dataStack);

    // const devStack = new MyDevServerStack(scope, `${stackPrefix}-user1-devserver-stack`, {
    //   vpc: dataStack.Vpc,
    //   dyTable: dataStack.DyTable,
    //   keyPairName: EC2_KEY_PAIR,
    //   tags
    // });
    // devStack.addDependency(dataStack);
  }
}
