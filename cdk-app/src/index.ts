import * as cdk from 'aws-cdk-lib';

import PipelineStack from './PipelineStack';
import MyService from './MyService';
import { DEV_MODE, ENV_NAME, COMPUTE_ENV_NAME, API_SRC_DIR } from './config';

const app = new cdk.App();

const tags = {
  "product": "cdk-q-starter"
};

if (DEV_MODE) {
  new MyService(app, 'MyServiceApp', {
    isProd: false,
    stackPrefix: ENV_NAME,
    computeStackPrefix: COMPUTE_ENV_NAME,
    localAssetPath: `${__dirname}/../../${API_SRC_DIR}`,
    tags
  });
} else {
  new PipelineStack(app, 'pipeline-stack', {
    fargateAppSrcDir: API_SRC_DIR,
    tags
  });
}
app.synth();
