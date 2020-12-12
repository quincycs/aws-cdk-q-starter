# Config File

cdk-app/.env

```
DEV_MODE=true
DEV_MODE_ECR_IMAGE_TAG=local-1
```

## DEV_MODE

CICD pipeline should be thought of as deploying to the prod environment that is in a seperate AWS account than your own. You can bypass the CICD pipeline and test changes by deploying to your own environment on your AWS account. Set this to true to do this bypass.

## DEV_MODE_ECR_IMAGE_TAG

The CDK needs a different tag name to detect you want to deploy changes. It won't detect that you've created a new image on the same tag name. I recommend fliping between 'local-1' and 'local-2'.

# Prereq / Setup

1. Create `cdk-app/.env` file.
2. Create ec2 key pair with name 'user1-key-pair' to connect to the devserver.
3. Create an ECR repo. After that, run the below to upload a docker image.

```
aws configure

aws ecr get-login-password --region {REGION} \
  | docker login --username AWS --password-stdin {AWS_ACCOUNT_ID}.dkr.ecr.{REGION}.amazonaws.com

docker build -t {AWS_ACCOUNT_ID}.dkr.ecr.{REGION}.amazonaws.com/aws-cdk-sample/app:local-1 .

docker push {AWS_ACCOUNT_ID}.dkr.ecr.us-west-2.amazonaws.com/aws-cdk-sample/app:local-1
```

# Known issues

1. 'Drift' between fresh environment deployed by CDK code and 'cdk diff' doesn't always find it.
2. 'cdk diff' could even show no changes, but a deploy would change the environment.
