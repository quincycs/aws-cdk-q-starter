# Overview

AWS, Clusters, LoadBalancing, AutoScaling, Containers, Infrastructure as Code, oh my!

AWS CDK brings all the various AWS services together into something managable by small teams. You can deploy a simple hello world API with the below setup.

# DEV_MODE = true

DEV_MODE=true allows you to deploy your changes from your local machine.

**Setup:**

1. Create `cdk-app/.env` file with content:

```
DEV_MODE=true
```

2. Create ec2 key pair named 'user1-key-pair'
1. `npm install`
1. `npm run deploy`

# DEV_MODE = false

Toggling to false, the PipelineStack will be deployed and handle the deploying of github commits. PipelineStack can be thought of as a tool that is deploying to the prod environment and can be a seperate AWS account than your own.

**Setup**

1. Create an ECR repo named 'aws-cdk-sample/app'
1. Create github oauth token.
1. Place ^token in aws secrets manager named '/github.com/quincycs'
1. `npm install`
1. `npm run deploy`
