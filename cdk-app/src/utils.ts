import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

import config from './config';
import { getContext } from './contextConfig';
const { APP_NAME, SSM_R53_PRIV_ZONE_NAME } = config;

export function genComputeDNS(scope: Construct) {
  const { envName, computeName } = getContext();  
  const privateZoneNameParam = StringParameter.fromStringParameterAttributes(scope, 'privateZoneName-computeDNS', {
    parameterName: SSM_R53_PRIV_ZONE_NAME.replace('{envName}', envName),
  });
  const privateZoneName = privateZoneNameParam.stringValue;

  return `${envName}-${APP_NAME}-${computeName}.${privateZoneName}`;
}
