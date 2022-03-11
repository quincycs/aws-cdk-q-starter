import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import { Duration } from 'aws-cdk-lib';
import * as pipelines from 'aws-cdk-lib/pipelines';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as events_targets from 'aws-cdk-lib/aws-events-targets';
import { CodePipeline } from 'aws-cdk-lib/pipelines';

import MyService from './MyService';
import config from './config';

const {
  APP_NAME,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_REPO_BRANCH,
  SECRET_MANAGER_GITHUB_AUTH,
  SECRET_MANAGER_DOCKER_USER,
  SECRET_MANAGER_DOCKER_PWD,
  SSM_DEV_APIGW_ENDPOINT,
  SSM_DEV_APIGW_KEY
} = config;

interface PipelineStackProps extends cdk.StackProps {
  fargateAppSrcDir: string
};

/*
 * Defines an CI/CD pipeline to build, deploy MyService, and self-mutate the pipeline.
 */
export default class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);
    const { tags, fargateAppSrcDir } = props;

    const ecrRepoName = `aws-cdk-q-starter/${fargateAppSrcDir}/app`;

    // self mutating pipeline for /cdk-app
    const sourceInput = pipelines.CodePipelineSource.gitHub(`${GITHUB_OWNER}/${GITHUB_REPO}`, GITHUB_REPO_BRANCH, {
      authentication: cdk.SecretValue.secretsManager(SECRET_MANAGER_GITHUB_AUTH),
    })
    const pipeline = this.genPipelineDefinition(sourceInput);

    // unit tests would be ran inside Dockerfile (during docker build).
    this.genBuildWave(fargateAppSrcDir, pipeline, sourceInput, ecrRepoName);

    // deploy dev + run integration tests.
    const devDeployStage = new DeployStage(this, `dev-${APP_NAME}`, {
      envName: 'dev',
      computeName: 'compute',
      ecrRepoName: ecrRepoName,
      tags
    });
    this.addDevStageWithValidationStep(pipeline, devDeployStage);

    // manual approval gate then deploy prod canary
    const prodCanaryDeployStage = new DeployStage(this, `prod-${APP_NAME}`, {
      envName: 'prod',
      computeName: 'CANARY',
      ecrRepoName: ecrRepoName,
      tags
    });
    pipeline.addStage(prodCanaryDeployStage, {
      pre: [
        new pipelines.ManualApprovalStep('Approval', {
          comment: "Production Canary Deploy @ 0% ?  Any existing canary will be replaced.  It is recommended to set the current canary to 0% before continuing.",
        })
      ]
    });

    // manual approval gate then deploy fully to prod and reset canary to 0%.
    const prodDeployStage = new DeployStage(this, `prod-${APP_NAME}`, {
      envName: 'prod',
      computeName: 'compute',
      ecrRepoName: ecrRepoName,
      tags
    });
    pipeline.addStage(prodDeployStage, {
      pre: [
        new pipelines.ManualApprovalStep('Approval', {
          comment: "Production Deploy @ 100% ?  Any existing canary will be set to 0%.",
        })
      ]
    });

    pipeline.buildPipeline();//needed for below
    // additionally trigger a pipeline run once a week even without code changes.
    //    this is to keep the base docker image fresh with latest underlying improvements.
    this.genPipelineScheduleRuleDefinition(pipeline);
  }

  private addDevStageWithValidationStep(
    pipeline: cdk.pipelines.CodePipeline,
    devDeployStage: DeployStage
  ) {
    const endpoint = cdk.aws_ssm.StringParameter.fromStringParameterName(
      this, 'ssmApiGWEndpoint', SSM_DEV_APIGW_ENDPOINT).stringValue;
    const apiKey = cdk.aws_ssm.StringParameter.fromSecureStringParameterAttributes(
      this, 'ssmApiGWKey', {
        parameterName: SSM_DEV_APIGW_KEY
      }
    ).stringValue;
    const stage = `dev-${APP_NAME}`;
    const resourcePath = 'item';

    pipeline.addStage(devDeployStage, {
      post: [
        new pipelines.ShellStep('Validate Endpoint', {
          commands: [`curl -X GET -H "x-api-key: ${apiKey}" -Ssf ${endpoint}/${stage}/${resourcePath}`],
        }),
      ],
    });
  }

  private genPipelineScheduleRuleDefinition(
    pipeline: pipelines.CodePipeline
  ): events.Rule {
    const rule = new events.Rule(this, 'Weekly', {
      schedule: events.Schedule.rate(Duration.days(7))
    });
    rule.addTarget(new events_targets.CodePipeline(pipeline.pipeline));
    return rule;
  }

  private genPipelineDefinition(
    sourceInput: cdk.pipelines.IFileSetProducer
  ): CodePipeline {
    return new CodePipeline(this, 'CdkPipeline', {
      crossAccountKeys: false,
      pipelineName: 'aws-cdk-q-starter',
      synth: new pipelines.ShellStep('Synth', {
        input: sourceInput,
        primaryOutputDirectory: 'cdk-app/cdk.out',
        commands: [
          'cd cdk-app',
          'npm ci',
          'npm run build',
          'npm run synth'
        ]
      })
    });
  }

  private genBuildWave(
    dockerFolder: string,
    pipeline: pipelines.CodePipeline,
    sourceInput: cdk.pipelines.IFileSetProducer,
    ecrRepoName: string
  ) {
    // create ECR to host built artifact
    const repository = new ecr.Repository(this, 'Repository', {
      repositoryName: ecrRepoName,
      removalPolicy: cdk.RemovalPolicy.RETAIN // destroy would only work if you had a mechanism for emptying it also.
    });
    const buildRole = new iam.Role(this, 'DockerBuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });
    repository.grantPullPush(buildRole);

    // create BuildSpec
    const dockerUser = cdk.SecretValue.secretsManager(SECRET_MANAGER_DOCKER_USER);
    const dockerPwd = cdk.SecretValue.secretsManager(SECRET_MANAGER_DOCKER_PWD);
    const buildSpec = codebuild.BuildSpec.fromObject({
      version: '0.2',
      phases: {
        pre_build: {
          commands: [
            `cd ${dockerFolder}`,
            'echo Logging in to Amazon ECR...',
            '$(aws ecr get-login --no-include-email --region $AWS_DEFAULT_REGION)',
            'echo Logging in to DockerHub...',
            `docker login -u ${dockerUser} -p ${dockerPwd}`
          ]
        },
        build: {
          commands: [
            'echo Build started on `date`',
            'echo Building the Docker image...',
            `docker build -t ${repository.repositoryUri}:$CODEBUILD_RESOLVED_SOURCE_VERSION .`,
          ]
        },
        post_build: {
          commands: [
            'echo Build completed on `date`',
            'echo Pushing the Docker image...',
            `docker push ${repository.repositoryUri}:$CODEBUILD_RESOLVED_SOURCE_VERSION`,
          ]
        },
      },
    });

    pipeline.addWave(`Build-@${dockerFolder}`, {
      post: [
        new pipelines.CodeBuildStep('DockerBuild', {
          input: sourceInput,
          buildEnvironment: {
            buildImage: codebuild.LinuxBuildImage.STANDARD_4_0,
            privileged: true
          },
          role: buildRole,
          partialBuildSpec: buildSpec,
          commands: [] // all contained in buildspec
        })
      ]
    });

    return repository;
  }
}

interface DeployStageProps extends cdk.StageProps {
  envName: string;
  computeName: string;
  ecrRepoName: string;
  tags?: { [key: string]: string; };
}

class DeployStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: DeployStageProps) {
    super(scope, id, props);
    const { tags, envName, computeName, ecrRepoName } = props;

    new MyService(this, 'MyServiceApp', {
      envName,
      computeName,
      ecrRepoName,
      tags
    });
  }
}
