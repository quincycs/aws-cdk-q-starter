# Config File

cdk-app/.env

```
DEV_MODE=true
```

## DEV_MODE

DEV_MODE=true allows you to deploy your changes from your local machine. Toggling to false, the PipelineStack will be deployed and handle the deploying of github commits. PipelineStack should be thought of as a tool that is deploying to the prod environment and can be a seperate AWS account than your own.

# Prereq / Setup

1. Create `cdk-app/.env` file.
2. Create ec2 key pair named 'user1-key-pair'
3. Create an ECR repo named 'aws-cdk-sample/app'

