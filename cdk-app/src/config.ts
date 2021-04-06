import * as cdk from '@aws-cdk/core';

// deployment options
const DEV_MODE = false;
const ENV_NAME = 'prod';
const COMPUTE_ENV_NAME = 'blue';
const APP_NAME = 'my-api';
const API_SRC_DIR = 'nodejs-app';
const DEFAULT_REGION = 'us-west-2';
const DEFAULT_NAT_IMAGE = 'ami-088e9a766f5a47026';
const RemovalPolicy = cdk.RemovalPolicy.DESTROY; // replace with below,
// DEV_MODE ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN;

// existing aws resources
const EC2_KEY_PAIR = 'user1-key-pair';
const APIGW_API = 'epeasxb1ue';
const APIGW_ROOT = 's9nh9eauli';
const GITHUB_OWNER = 'quincycs';
const GITHUB_REPO = 'aws-cdk-q-starter';
const SECRET_MANAGER_GITHUB_AUTH = '/github.com/quincycs';
const SECRET_MANAGER_DOCKER_USER = 'dockerhub/username';
const SECRET_MANAGER_DOCKER_PWD = 'dockerhub/password';

export {
    DEV_MODE,
    ENV_NAME,
    COMPUTE_ENV_NAME,
    APP_NAME,
    API_SRC_DIR,
    EC2_KEY_PAIR,
    APIGW_API,
    APIGW_ROOT,
    GITHUB_OWNER,
    GITHUB_REPO,
    SECRET_MANAGER_GITHUB_AUTH,
    SECRET_MANAGER_DOCKER_USER,
    SECRET_MANAGER_DOCKER_PWD,
    DEFAULT_REGION,
    DEFAULT_NAT_IMAGE,
    RemovalPolicy
};
