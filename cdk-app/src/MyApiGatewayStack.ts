import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigateway';

import config from './config';
import { getContext } from './contextConfig';

const {
  SSM_APIGW_ID,
  SSM_APIGW_ROOT,
  APP_NAME
} = config;

interface MyApiGatewayStackProps extends cdk.StackProps {
  vpcLink: apigw.VpcLink
}

export default class MyApiGatewayStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MyApiGatewayStackProps) {
    super(scope, id, props);
    const { vpcLink } = props;

    const api = this.genApiGatewayDefinition();
    const methods = this.genApiGatewayMethods(api, vpcLink);
    this.genApiGatewayDeploy(api, methods, vpcLink);
  }

  private genApiGatewayMethods(
    api: apigw.IRestApi,
    vpcLink: apigw.VpcLink
  ): apigw.Method[] {
    const { computeDNS } = getContext();
    const allMethods: apigw.Method[] = [];
    
    /*
     * default integration options
     */
    const integrationType = apigw.IntegrationType.HTTP_PROXY;
    const integrationMethod = 'ANY';
    const integrationOptions = {
      connectionType: apigw.ConnectionType.VPC_LINK,
      vpcLink,
    };
    const integrationMethodOptions = {
      apiKeyRequired: true
    };

    const item = api.root.addResource('item', {
      defaultIntegration: new apigw.Integration({
        type: integrationType,
        integrationHttpMethod: integrationMethod,
        uri: `https://${computeDNS}`,
        options: integrationOptions
      }),
      defaultMethodOptions: integrationMethodOptions
    });
    allMethods.push(item.addMethod('ANY'));

    return allMethods;
  }

  private genApiGatewayDeploy(
    api: apigw.IRestApi,
    methods: apigw.Method[],
    vpcLink: apigw.VpcLink
  ) {
    const { envName } = getContext();

    const deployment = new apigw.Deployment(this, `Dep-${new Date().toISOString()}`, {
      api,
      description: `Using VPCLink: ${vpcLink.vpcLinkId}`
    });
    deployment.node.addDependency(...methods);
    
    // clean deployment.  stage deployment == canary deployment
    new apigw.CfnStage(this, 'Stage', {
      deploymentId: deployment.deploymentId,// stage deployment
      restApiId: api.restApiId,
      stageName: `${envName}-${APP_NAME}`,
      canarySetting: {
        deploymentId: deployment.deploymentId, // canary deployment
        percentTraffic: 100
      }
    });

    // canary deployment. stage deployment not provided. canary deployment updated.
    // new apigw.CfnStage(this, 'Stage', {
    //   restApiId: api.restApiId,
    //   stageName: `${ENV_NAME}-${APP_NAME}`,
    //   canarySetting: {
    //     deploymentId: deployment.deploymentId, // canary deployment
    //     percentTraffic: 50
    //   }
    // });

  }

  private genApiGatewayDefinition(): apigw.IRestApi {
    const { envName } = getContext();
    const envSSM_APIGW_ID = SSM_APIGW_ID.replace('{envName}',envName);
    const envSSM_APIGW_ROOT = SSM_APIGW_ROOT.replace('{envName}',envName);

    const apiId = cdk.aws_ssm.StringParameter.fromStringParameterName(this, 'ssmApiId', envSSM_APIGW_ID);
    const apiRoot = cdk.aws_ssm.StringParameter.fromStringParameterName(this, 'ssmApiRoot', envSSM_APIGW_ROOT);

    return apigw.RestApi.fromRestApiAttributes(this, `${this.stackName}-ApiGateway`, {
      restApiId: apiId.stringValue,
      rootResourceId: apiRoot.stringValue
    });
  }
}
