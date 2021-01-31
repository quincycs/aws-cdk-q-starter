import * as cdk from '@aws-cdk/core';
import * as ecs from '@aws-cdk/aws-ecs';

import PipelineStack from './PipelineStack';
import platform from './platform';
import { DEV_MODE, ENV_NAME } from './config';

const app = new cdk.App();
const fargateAppSrcDir = 'nodejs-app';

if (DEV_MODE) {
  platform(app, ENV_NAME, ()=>ecs.ContainerImage.fromAsset(`${__dirname}/../../${fargateAppSrcDir}`));
} else {
  new PipelineStack(app, 'prod-cdksample--pipeline-stack', {fargateAppSrcDir});
}
app.synth();
