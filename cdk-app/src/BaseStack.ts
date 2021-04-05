import * as cdk from '@aws-cdk/core';
import { CDK_DEFAULT_ACCOUNT, DEFAULT_REGION } from './config';

export class BaseStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        const env = {
            account: CDK_DEFAULT_ACCOUNT,
            region: DEFAULT_REGION
        };
        super(scope, id, {
            ...props,
            env,
        });
    }
}  