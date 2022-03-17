import * as cdk from 'aws-cdk-lib';

const APP_NAME = 'myapi';
const SSM_BASE = '/{envName}/api.quincymitchell.com';
const SSM_DEV_BASE = SSM_BASE.replace('{envName}', 'dev');

export default {
/**
 *  Deployment options
 */
    DEV_MODE: false,
    DEV_MODE_ENV_NAME: 'dev',
    DEV_MODE_COMPUTE_NAME: 'compute',
    API_SRC_DIR: 'nodejs-app',
    DEFAULT_REGION: 'us-west-2',
    DEFAULT_NAT_IMAGE: 'ami-088e9a766f5a47026',
    RemovalPolicy: cdk.RemovalPolicy.DESTROY,
    APP_NAME,

/**
 *  Existing AWS Resources
 */
    // per envName
    SSM_APIGW_ID: `${SSM_BASE}/api-gateway/id`,
    SSM_APIGW_ROOT: `${SSM_BASE}/api-gateway/rootResource`,
    SSM_R53_PRIV_ZONE_NAME: `${SSM_BASE}/r53/name`,
    SSM_R53_PRIV_ZONE_ID: `${SSM_BASE}/r53/id`,
    SSM_ACM_CERT_ARN: `${SSM_BASE}/acm/internal-lb-cert-arn`,
    SSM_TLS_PRIV_KEY: `${SSM_BASE}/custom/tls-private-key`,

    // devops resources
    GITHUB_OWNER: 'quincycs',
    GITHUB_REPO: 'aws-cdk-q-starter',
    GITHUB_REPO_BRANCH: 'master',
    SSM_DEV_APIGW_ENDPOINT: `${SSM_DEV_BASE}/api-gateway/endpointUrl`,
    SSM_DEV_APIGW_KEY: `${SSM_DEV_BASE}/api-gateway/apikey`,
    SECRET_GITHUB_OAUTH: `/${APP_NAME}/github/oauth`,
    SSM_DOCKER_USER: `/${APP_NAME}/dockerhub/user`,
    SECRET_DOCKER_PWD: `/${APP_NAME}/dockerhub/pwd`,
    SSM_DEVACCOUNT: `/${APP_NAME}/account/dev`,
    SSM_PRODACCOUNT: `/${APP_NAME}/account/prod`,
    SSM_ORGID: `/${APP_NAME}/account/orgId`,
    SSM_ORGUNITID: `/${APP_NAME}/account/orgUnitId`,

    // baston host option
    EC2_KEY_PAIR: 'user1-key-pair',
};
