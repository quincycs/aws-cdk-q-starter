# Overview

AWS, Clusters, LoadBalancing, AutoScaling, Containers, Infrastructure as Code, Devops CI/CD, Blue/Green Deployments, Partial Roll Out Deployments, End to End Encryption, oh my!

AWS CDK brings all the various AWS services together into something managable by small & large teams. This project is a quick example of how you can use the CDK to build a API to query DyDB. Read more background on this project with my blog on ["Transitioning Your Infrastructure to Architecture as Code"](https://blogs.perficient.com/2021/04/09/transitioning-your-infrastructure-to-architecture-as-code/).

![diagram](https://user-images.githubusercontent.com/2924643/107100595-bd7b6480-67c9-11eb-898b-a0c1e07a73c5.png)

**Quick Setup: ( DEV_MODE = true )**

The quick way to explore this project & deploy on your own account is to use the "DEV_MODE" configuration.
The configuration is meant for locally deploying from your own machine to your own AWS account. This is great for rapidly testing changes and trying new things out. When you want the full setup that includes devops components, then follow the full setup instructions in the next section.

1. Edit `cdk-app/config.ts` :

   - DEV_MODE set true.
   - DEV_MODE_ENV_NAME allows you to deploy different sets of infrastructure with various configrations. It's a prefix name for the all cloudformation stacks.
   - DEV_MODE_COMPUTE_NAME allows you to deploy different set of compute stacks within the same environment. It's a prefix name for the compute cloudformation stack.
   - APP_NAME is used in all your cloudformation stack names.
   - API_SRC_DIR lets you configure which codebase will be deployed for compute.
   - DEFAULT_REGION lets you set the AWS region where you want to deploy.
   - DEFAULT_NAT_IMAGE is the EC2 image used for the NAT gateway. (NAT is used for compute instances to call out to the internet. It doesn't allow traffic in from the internet.)
   - RemovalPolicy is whether a data resource should be deleted as well when the cloudformation stack is deleted.

1. Create Perimeter AWS resources.

   - Create Api Gateway ( REST / Edge Optimized )
     - note api ID
     - note root resource ID
     - note endpoint url
     - create API key & usage plan from web console. once everything is deployed later on remember to associate usage plan to the created stage.
     - note API key.
     - create the SSM parameters. Tip: can use the aws cli
     - `aws ssm put-parameter --name "...configKey..." --value "...." --type String --profile dev --region us-west-2`
   - Create Private Hosted Zone
     - Creation will require a VPC. Initially give the default VPC of your desired region.
     - note the name & ID. recommended name like: 'devinternal.quincymitchell.com'
     - create the SSM parameters.
   - Create Public Hosted Zone (Route 53)
     - Transfer or create your public domain, setting name servers.
   - Create Public ACM certificate
     - In us-east-1 , request public cert that will be used for ApiGateway's custom domain association to your public hosted zone.
     - ApiGateway edge optimized domains will need a cert inside us-east-1
   - Create ApiGateway Custom Domain
     - Edge optimized
     - Use the above certificate
   - Associate R53 with ApiGateway Custom Domain
     - Add alias record on public hosted zone. The value entered should be "API Gateway domain name" shown in the custom domain portal.
     - Congrats! You now have R53 + ApiGateway + Certificate + Custom domain all setup!
     - To test you can deploy a simple mock response in Api gateway and perform a curl.
     - eg `curl https://api.quincymitchell.com`
   - Create Internal ACM certificate
     - Request public cert that will be only used for internal load balancer between ApiGateway and ECS.
     - This will attach validation records onto your public hosted zone, but it won't expose any internal services.
     - Use a wildcard in front of the requested "Fully qualified domain name". eg: "\*.devinternal.quincymitchell.com"

1. `npm install`
1. `npm run deploy`

**Full Setup: ( DEV_MODE = false )**

This deploys a codepipeline that does a lot!

1. Triggered by a github change to the master branch.
1. Fetch the github source code branch
1. Builds the cdk application code
1. Updates itself! (the codepipeline)
1. Builds application code
1. Deploys to dev
1. Run integration test
1. Waits for a manual approval gate
1. Deploys 0% canary release to production
1. Waits for a manual approval gate
1. Deploys 100% to production

Create Perimeter Resources

1. AWS Organizations / AWS SSO / Multiple Accounts
1. Route53 private hosted zone. Dev & Prod accounts.
1. Route53 public hosted zone. Shared account.

Once deployed & setup, it looks like below. Though code-as-infrastructure is great, I still recommend some pieces to be manually created in the console UI. It makes the code simplier and some of these items aren't supported by cloudformation.

Shared Account

- SSM Parameter Store ( manually setup )
- Secrets Manager ( manually setup )
- deployment-code-pipeline ( stack )
  - CodePipeline
  - CodeBuild
  - ECR

Dev Account

- SSM Parameter Store ( manually setup )
- Private Hosted Zone - Route 53 ( manually setup )
- Certificate Manager ( manually setup )
- apigateway ( manually setup )
- dev-apigateway ( stack )
  - apigateway resources & apigateway deployments
- dev-myapi-compute ( stack )
  - apigateway vpclink
  - ECS
- dev-data ( stack )
  - vpc
  - nat gateway
  - DynamoDB

Prod Account

- SSM Parameter Store ( manually setup )
- Private Hosted Zone - Route 53 ( manually setup )
- Certificate Manager ( manually setup )
- apigateway ( manually setup )
- prod-apigateway ( stack )
  - apigateway resources & apigateway deployments
- prod-myapi-compute ( stack )
  - apigateway vpclink
  - ECS
- prod-myapi-CANARY ( stack )
  - apigateway vpclink
  - ECS
- prod-data ( stack )
  - vpc
  - nat gateway
  - DynamoDB

Known Wrinkles

- For full setup, you'll need to comment out the canary apigateway deployment code on first run. First deployment can not be a canary because we need an existing deployment first.
