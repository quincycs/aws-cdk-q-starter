import * as cdk from '@aws-cdk/core';
import * as ecs from '@aws-cdk/aws-ecs';

import PipelineStack from './PipelineStack';
import platform from './platform';
import { DEV_MODE } from './config';

const app = new cdk.App();
if (DEV_MODE) {
  platform(app, ()=>ecs.ContainerImage.fromAsset(`${__dirname}/../../nodejs-app`));
} else {
  new PipelineStack(app, 'aws-cdk-sample-pipeline-stack');
}
app.synth();
