import * as cdk from '@aws-cdk/core';

const DEV_MODE = process.env.DEV_MODE === 'true';
const ENV_NAME = process.env.ENV_NAME as string;
const RemovalPolicy = cdk.RemovalPolicy.DESTROY; // replace with below,
// ENV_NAME == 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

export { DEV_MODE, ENV_NAME, RemovalPolicy };