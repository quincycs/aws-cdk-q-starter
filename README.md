# Overview

AWS, Clusters, LoadBalancing, AutoScaling, Containers, Infrastructure as Code, oh my!

AWS CDK brings all the various AWS services together into something managable by small teams. This project is a quick example of how you can use the CDK to build a API to query DyDB.  Without changes, the API is using the nodejs-app/ codebase hosted in fargate and exposed publically via an API gateway.  You can use the java-app/ codebase instead with only needing to change the folder path reference in 'cdk-app/src/index.ts'.

![diagram](https://user-images.githubusercontent.com/2924643/107100595-bd7b6480-67c9-11eb-898b-a0c1e07a73c5.png)

# DEV_MODE = true

DEV_MODE=true allows you to deploy your changes from your local machine.  It also deploys a bastion host inside your VPC.  The purpose of dev mode is to let you change anything about your infrastructure on your own defined environment.  This gives you confidence that your changes will deploy correctly in produdction because you're able to deploy /master in your own environment, then deploy your changes without issue.

**Setup:**

1. Create `cdk-app/.env` file with content:

```
DEV_MODE=true
ENV_NAME=dev
```

2. Create ec2 key pair named 'user1-key-pair'
1. `npm install`
1. `npm run deploy`

# DEV_MODE = false

Toggling to false, the PipelineStack will be deployed and handle deployment of github commits.  It will even self-mutate the PipelineStack!  PipelineStack can be thought of as a tool that is deploying to the prod environment and can be a seperate AWS account than your own.

**Setup**

1. Create an ECR repo named 'aws-cdk-sample/app'
1. Create github oauth token.
1. Place ^token in aws secrets manager named '/github.com/quincycs'
1. `npm install`
1. `npm run deploy`
