import * as cdk from '@aws-cdk/core';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import * as pipelines from '@aws-cdk/pipelines';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as ecr from '@aws-cdk/aws-ecr';
import * as ecs from '@aws-cdk/aws-ecs';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';

import platform from './platform';
import { CdkPipeline } from './lib/CdkPipeline';
import { GITHUB_OWNER, GITHUB_REPO, SECRET_MANAGER_GITHUB_AUTH, RemovalPolicy } from './config';

interface DeployStageProps extends cdk.StageProps {
  ecrRepo : ecr.Repository
};

class DeployStage extends cdk.Stage {
  constructor(scope: cdk.Construct, id: string, props: DeployStageProps) {
    super(scope, id, props);

    function getAppSource(stack: cdk.Construct) {
      const repository = ecr.Repository.fromRepositoryName(stack, 'Repository', props.ecrRepo.repositoryName);
      return ecs.ContainerImage.fromEcrRepository(repository, process.env.CODEBUILD_RESOLVED_SOURCE_VERSION);
    };

    platform(this, '', getAppSource);
  }
}

interface PipelineStackProps extends cdk.StackProps {
  fargateAppSrcDir : string
};

export default class PipelineStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props as cdk.StackProps);

    const bucket = new s3.Bucket(this, 'ArtifactBucket', {
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    /*
     * setup self mutating pipeline for /cdk-app
     */
    const sourceArtifact = new codepipeline.Artifact();
    const cdkOutputArtifact = new codepipeline.Artifact();
    const pipeline = new CdkPipeline(this, 'CdkPipeline', {
      artifactBucket: bucket,
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
        environmentVariables: {
          "DEV_MODE": {value: "false"},
          "ENV_NAME": {value: "prod"}
        },
        subdirectory: 'cdk-app',
        installCommand: 'npm ci',
        buildCommand: 'npm run build',
        synthCommand: 'npm run synth'
      }),
    });

    /*
     * make an ecr repo to place the built container
     */
    const repository = new ecr.Repository(this, 'Repository', {
      removalPolicy: RemovalPolicy
    });
    const buildRole = new iam.Role(this, 'DockerBuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });
    repository.grantPullPush(buildRole);
    const { repositoryUri } = repository;

    /*
     * for each docker, make additional build stage
     */
    const dockerBuildStage = pipeline.addStage('DockerBuild');
    this.setupDockerBuildStage(props.fargateAppSrcDir, dockerBuildStage, buildRole, sourceArtifact, repositoryUri);

    /*
     * Deploy everything
     */
    const localStage = new DeployStage(this, 'prod-cdksample', {
      ecrRepo: repository
    });
    pipeline.addApplicationStage(localStage);
  }

  private setupDockerBuildStage(
    dockerFolder: string,
    stage: pipelines.CdkStage,
    buildRole: iam.Role,
    source: codepipeline.Artifact,
    repositoryUri: string)
  {
    const dockerUser = cdk.SecretValue.secretsManager('dockerhub/username');
    const dockerPwd = cdk.SecretValue.secretsManager('dockerhub/password');
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
    }))
  }
}
