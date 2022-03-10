import * as cdk from 'aws-cdk-lib';

import PipelineStack from './PipelineStack';
import MyService from './MyService';
import config from './config';

const { DEV_MODE, DEV_MODE_ENV_NAME, API_SRC_DIR } = config;
const tags = {
  "product": "cdk-q-starter"
};

const app = new cdk.App();

if (DEV_MODE) {
  new MyService(app, 'MyServiceApp', {
    envName: DEV_MODE_ENV_NAME,
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
