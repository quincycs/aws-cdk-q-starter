import * as cdk from '@aws-cdk/core';
import PipelineStack from './PipelineStack';
import platform from './platform';

const DEV_MODE = process.env.DEV_MODE === 'true';

const app = new cdk.App();
if(DEV_MODE) {
  platform(app);
} else {
  new PipelineStack(app, 'pipeline-stack');
}
app.synth();