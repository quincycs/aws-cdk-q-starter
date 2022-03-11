import * as cdk from 'aws-cdk-lib';

const APP_NAME = 'myapi';

export default {
/**
 *  Deployment options
 */
    DEV_MODE: false,
    DEV_MODE_ENV_NAME: 'devlocal',
    API_SRC_DIR: 'nodejs-app',
    DEFAULT_REGION: 'us-west-2',
    DEFAULT_NAT_IMAGE: 'ami-088e9a766f5a47026',
    RemovalPolicy: cdk.RemovalPolicy.DESTROY,
    APP_NAME,
    COMPUTE_NAME: 'compute',

/**
 *  Existing AWS Resources
 */
    EC2_KEY_PAIR: 'user1-key-pair',
    SSM_APIGW_ID: '/{envName}/api.quincymitchell.com/api-gateway/id',
    SSM_APIGW_ROOT: '/{envName}/api.quincymitchell.com/api-gateway/rootResource',
    R53_PRIV_ZONE_NAME: 'internal.quincymitchell.com',
    R53_PRIV_ZONE_ID: 'Z03960221LYC8XACEL1Y5',
    SSM_ACM_CERT_ARN: `/${APP_NAME}/acm-cert-arn`,
    SSM_TLS_PRIV_KEY: `/${APP_NAME}/tls-private-key`,

    // devops resources
    GITHUB_OWNER: 'quincycs',
    GITHUB_REPO: 'aws-cdk-q-starter',
    GITHUB_REPO_BRANCH: 'master',
    SECRET_MANAGER_GITHUB_AUTH: '/github.com/quincycs',
    SECRET_MANAGER_DOCKER_USER: 'dockerhub/username',
    SECRET_MANAGER_DOCKER_PWD: 'dockerhub/password',
};
