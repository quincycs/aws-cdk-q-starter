import * as cdk from 'aws-cdk-lib';

import PipelineStack from './PipelineStack';
import MyService from './MyService';
import config from './config';

const { DEV_MODE, DEV_MODE_ENV_NAME, DEV_MODE_COMPUTE_NAME, API_SRC_DIR, DEFAULT_REGION } = config;
const tags = {
  "product": "cdk-q-starter"
};

const app = new cdk.App();

if (DEV_MODE) {
  new MyService(app, 'MyServiceApp', {
    envName: DEV_MODE_ENV_NAME,
    computeName: DEV_MODE_COMPUTE_NAME,
    localAssetPath: `${__dirname}/../../${API_SRC_DIR}`,
    tags
  });
} else {
  new PipelineStack(app, 'deployment-code-pipeline', {
    fargateAppSrcDir: API_SRC_DIR,
    tags,
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: DEFAULT_REGION
    }
  });
}
app.synth();
