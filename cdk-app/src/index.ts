import * as cdk from '@aws-cdk/core';
import * as ecs from '@aws-cdk/aws-ecs';

import PipelineStack from './PipelineStack';
import platform from './platform';
import { DEV_MODE, ENV_NAME, API_SRC_DIR } from './config';

const app = new cdk.App();

if (DEV_MODE) {
  platform(app, ENV_NAME, ()=>ecs.ContainerImage.fromAsset(`${__dirname}/../../${API_SRC_DIR}`));
} else {
  new PipelineStack(app, 'prod-cdksample--pipeline-stack', {fargateAppSrcDir: API_SRC_DIR});
}
app.synth();
