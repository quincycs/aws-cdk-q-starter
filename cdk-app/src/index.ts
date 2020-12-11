import * as cdk from '@aws-cdk/core';
import PipelineStack from './PipelineStack';
import platform from './platform';
import { DEV_MODE } from './config';

const app = new cdk.App();
if (DEV_MODE) {
  platform(app);
} else {
  new PipelineStack(app, 'pipeline-stack');
}
app.synth();