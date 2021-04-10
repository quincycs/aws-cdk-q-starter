import * as cdk from '@aws-cdk/core';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import * as pipelines from '@aws-cdk/pipelines';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as ecr from '@aws-cdk/aws-ecr';
import * as iam from '@aws-cdk/aws-iam';
import { CdkPipeline } from '@aws-cdk/pipelines';

import MyService from './MyService';
import {
  ENV_NAME,
  COMPUTE_ENV_NAME,
  APP_NAME, GITHUB_OWNER,
  GITHUB_REPO,
  SECRET_MANAGER_GITHUB_AUTH,
  SECRET_MANAGER_DOCKER_USER,
  SECRET_MANAGER_DOCKER_PWD
} from './config';

const ecrRepoName = `aws-cdk-q-starter/${ENV_NAME}/${COMPUTE_ENV_NAME}/app`;

interface PipelineStackProps extends cdk.StackProps {
  fargateAppSrcDir: string
};

export default class PipelineStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);
    const { tags, fargateAppSrcDir } = props;

    // self mutating pipeline for /cdk-app
    const sourceArtifact = new codepipeline.Artifact();
    const pipeline = this.getPipelineDefinition(sourceArtifact);

    const repository = new ecr.Repository(this, 'Repository', {
      repositoryName: ecrRepoName,
      removalPolicy: cdk.RemovalPolicy.RETAIN // destroy would only work if you had a mechanism for emptying it also.
    });
    const buildRole = new iam.Role(this, 'DockerBuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });
    repository.grantPullPush(buildRole);

    const dockerBuildStage = pipeline.addStage('docker-build-stage');
    this.setupDockerBuildStage(fargateAppSrcDir, dockerBuildStage, buildRole, sourceArtifact, repository.repositoryUri);

    const deployStage = new DeployStage(this, APP_NAME, { tags });
    pipeline.addApplicationStage(deployStage);
  }

  private getPipelineDefinition(
    sourceArtifact: codepipeline.Artifact
  ): CdkPipeline {
    const cdkOutputArtifact = new codepipeline.Artifact();
    return new CdkPipeline(this, 'CdkPipeline', {
      crossAccountKeys: false,
      pipelineName: 'aws-cdk-q-starter',
      cloudAssemblyArtifact: cdkOutputArtifact,
      sourceAction: new codepipeline_actions.GitHubSourceAction({
        actionName: 'aws-cdk-q-starter-src-download',
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        oauthToken: cdk.SecretValue.secretsManager(SECRET_MANAGER_GITHUB_AUTH),
        output: sourceArtifact,
      }),
      synthAction: pipelines.SimpleSynthAction.standardNpmSynth({
        sourceArtifact: sourceArtifact,
        cloudAssemblyArtifact: cdkOutputArtifact,
        subdirectory: 'cdk-app',
        installCommand: 'npm ci',
        buildCommand: 'npm run build',
        synthCommand: 'npm run synth'
      }),
    });
  }

  private setupDockerBuildStage(
    dockerFolder: string,
    stage: pipelines.CdkStage,
    buildRole: iam.Role,
    source: codepipeline.Artifact,
    repositoryUri: string
  ) {
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
            `docker build -t ${repositoryUri}:$CODEBUILD_RESOLVED_SOURCE_VERSION .`,
          ]
        },
        post_build: {
          commands: [
            'echo Build completed on `date`',
            'echo Pushing the Docker image...',
            `docker push ${repositoryUri}:$CODEBUILD_RESOLVED_SOURCE_VERSION`,
          ]
        },
      },
    });

    stage.addActions(new codepipeline_actions.CodeBuildAction({
      actionName: 'DockerBuild',
      input: source,
      project: new codebuild.Project(this, 'DockerBuild', {
        role: buildRole,
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_4_0,
          privileged: true
        },
        buildSpec
      })
    }));
  }
}

interface DeployStageProps extends cdk.StageProps {
  tags?: { [key: string]: string; };
}

class DeployStage extends cdk.Stage {
  constructor(scope: cdk.Construct, id: string, props: DeployStageProps) {
    super(scope, id, props);
    const { tags } = props;

    new MyService(this, 'MyServiceApp', {
      isProd: true,
      stackPrefix: ENV_NAME,
      computeStackPrefix: COMPUTE_ENV_NAME,
      ecrRepoName: ecrRepoName,
      tags
    });
  }
}
