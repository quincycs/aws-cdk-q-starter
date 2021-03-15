import * as cdk from '@aws-cdk/core';

import PipelineStack from './PipelineStack';
import MyService from './MyService';
import { DEV_MODE, ENV_NAME, COMPUTE_ENV_NAME, API_SRC_DIR } from './config';

const app = new cdk.App();

if (DEV_MODE) {
  new MyService(app, 'MyServiceApp', {
    isProd: false,
    stackPrefix: ENV_NAME,
    computeStackPrefix: COMPUTE_ENV_NAME,
    localAssetPath: `${__dirname}/../../${API_SRC_DIR}`,
    ecrRepoName: ''
  });
} else {
  new PipelineStack(app, 'prod-cdksample--pipeline-stack', {fargateAppSrcDir: API_SRC_DIR});
}
app.synth();
