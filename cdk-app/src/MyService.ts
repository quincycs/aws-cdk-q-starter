import * as cdk from '@aws-cdk/core';

import { EC2_KEY_PAIR } from './config';
import MyNetworkDataStack from './MyNetworkDataStack';
import MyComputeStack from './MyComputeStack';
import MyDevServerStack from './MyDevserverStack';

interface EnvProps {
  isProd: boolean;
  stackPrefix: string;
  computeStackPrefix: string;
  localAssetPath?: string;
  ecrRepoName?: string;
  tags?: { [key: string]: string; };
}

export default class MyService extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: EnvProps) {
    super(scope, id);
    const { isProd, stackPrefix, localAssetPath, ecrRepoName, computeStackPrefix, tags } = props;

    const dataStack = new MyNetworkDataStack(scope, `${stackPrefix}-base`, { tags });

    const computeStack = new MyComputeStack(scope, `${stackPrefix}-${computeStackPrefix}-fargate`, {
      vpc: dataStack.Vpc,
      dyTable: dataStack.DyTable,
      localAssetPath,
      ecrRepoName,
      tags
    });
    computeStack.addDependency(dataStack);

    if (!isProd) {
      const devStack = new MyDevServerStack(scope, `${stackPrefix}-user1-devserver-stack`, {
        vpc: dataStack.Vpc,
        dyTable: dataStack.DyTable,
        keyPairName: EC2_KEY_PAIR,
        tags
      });
      devStack.addDependency(dataStack);
    }
  }
}
