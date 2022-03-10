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
  COMPUTE_NAME,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_REPO_BRANCH,
  SECRET_MANAGER_GITHUB_AUTH,
  SECRET_MANAGER_DOCKER_USER,
  SECRET_MANAGER_DOCKER_PWD
} = config;
const ecrRepoName = `aws-cdk-q-starter/${COMPUTE_NAME}/app`;

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

    // self mutating pipeline for /cdk-app
    const sourceInput = pipelines.CodePipelineSource.gitHub(`${GITHUB_OWNER}/${GITHUB_REPO}`, GITHUB_REPO_BRANCH, {
      authentication: cdk.SecretValue.secretsManager(SECRET_MANAGER_GITHUB_AUTH),
    })
    const pipeline = this.genPipelineDefinition(sourceInput);

    // TODO Unit Tests would be ran inside Dockerfile (during docker build).
    this.genBuildWave(fargateAppSrcDir, pipeline, sourceInput);

    const devDeployStage = new DeployStage(this, `dev-${APP_NAME}`, {
      envName: 'dev',
      ecrRepoName: ecrRepoName,
      tags
    });
    pipeline.addStage(devDeployStage);

    // TODO Run automated integration tests against dev environment

    const prodDeployStage = new DeployStage(this, `prod-${APP_NAME}`, {
      envName: 'prod',
      ecrRepoName: ecrRepoName,
      tags
    });
    pipeline.addStage(prodDeployStage, {
      pre: [
        // TODO manual approval stage ( Action1 OR Action2 OR Action3 )
        new pipelines.ManualApprovalStep('Approval', {
          comment: "Go fully to prod?"
        })
      ]
    });

    // TODO Action1: Deploy to "Prod" environment with x% canary ... then loop back to manual approval stage.

    // TODO Action2: Deploy to "Prod" environment with 100%...delete old stack... complete pipeline.

    // TODO Action3: Deploy to "Prod" environment with full rollback ... deleting new stack ... deploying old stack with 100% canary.

    // TODO after any action completes... run automated integration tests against prod.

    pipeline.buildPipeline();//needed for below
    // additionally trigger a pipeline run once a week even without code changes.
    //    this is to keep the base docker image fresh with latest underlying improvements.
    this.genPipelineScheduleRuleDefinition(pipeline);
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
    sourceInput: cdk.pipelines.IFileSetProducer
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

    pipeline.addWave(`Build-/${dockerFolder}`, {
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
  ecrRepoName: string;
  tags?: { [key: string]: string; };
}

class DeployStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: DeployStageProps) {
    super(scope, id, props);
    const { tags, envName, ecrRepoName } = props;

    new MyService(this, 'MyServiceApp', {
      envName,
      ecrRepoName,
      tags
    });
  }
}
