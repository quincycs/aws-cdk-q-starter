# Overview

AWS, Clusters, LoadBalancing, AutoScaling, Containers, Infrastructure as Code, Blue/Green Deployments, Partial Roll Out Deployments, oh my!

AWS CDK brings all the various AWS services together into something managable by small & large teams. This project is a quick example of how you can use the CDK to build a simple hello world API.

This project is a quick example of how you can use the CDK to build a API to query DyDB.  

![diagram](https://user-images.githubusercontent.com/2924643/107100595-bd7b6480-67c9-11eb-898b-a0c1e07a73c5.png)

**Setup:**

1. Edit `cdk-app/config.ts` file with your existing aws resource info:
    - DEV_MODE 'true' allows you to deploy your changes from your local machine.
    - DEV_MODE 'false' only deploys a Code Pipeline (which in turn fetches code from the configured repo and builds it).  After the first time deployment, the pipeline code can self-mutate -- allowing you to change the pipeline infrastructure too.  PipelineStack can be thought of as a tool that is deploying to the prod environment and can be a seperate AWS account than your own.
    - EC2 key pair, so you can connect to a baston host inside the VPC.
    - Api Gateway (REST), so you can have more release management control.
    - ENV_NAME allows you to deploy different versions of infrastructure and test changes in your own environment.  Continuing to use the same ENV_NAME will update the environment.
    - API_SRC_DIR lets you configure which codebase will be deployed in fargate.
    - GITHUB_* is the github info that would be used for CI/CD of DEV_MODE 'true'
    - RemovalPolicy is whether a data resource should be deleted as well when the cloudformation stack is deleted.
1. `npm install`
1. `npm run diff`  (shows you what the deploy will do)
1. `npm run deploy`


