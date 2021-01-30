import * as cdk from '@aws-cdk/core';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import * as pipelines from '@aws-cdk/pipelines';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as ecr from '@aws-cdk/aws-ecr';
import * as ecs from '@aws-cdk/aws-ecs';
import * as iam from '@aws-cdk/aws-iam';

import platform from './platform';

const ecrRepoName = 'aws-cdk-sample/app';

class DeployStage extends cdk.Stage {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StageProps) {
    super(scope, id, props);

    function getAppSource(stack: cdk.Construct) {
      const repository = ecr.Repository.fromRepositoryName(stack, 'Repository', ecrRepoName);
      return ecs.ContainerImage.fromEcrRepository(repository, process.env.CODEBUILD_RESOLVED_SOURCE_VERSION);
    };

    platform(this, getAppSource);
  }
}

interface PipelineStackProps extends cdk.StackProps {
  fargateAppSrcDir : string
};

export default class PipelineStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props as cdk.StackProps);

    /*
     * setup self mutating pipeline for /cdk-app
     */
    const sourceArtifact = new codepipeline.Artifact();
    const cdkOutputArtifact = new codepipeline.Artifact();
    const pipeline = new pipelines.CdkPipeline(this, 'CdkPipeline', {
      crossAccountKeys: false,
      pipelineName: 'aws-cdk-q-starter',
      cloudAssemblyArtifact: cdkOutputArtifact,
      sourceAction: new codepipeline_actions.GitHubSourceAction({
        actionName: 'aws-cdk-q-starter-src-download',
        owner: 'quincycs',
        repo: 'aws-cdk-q-starter',
        oauthToken: cdk.SecretValue.secretsManager('/github.com/quincycs'),
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
    // here's how to create a repo
    // const repository = new ecr.Repository(this, 'Repository', {
    //   repositoryName: 'aws-cdk-sample/app',
    // });
    const repository = ecr.Repository.fromRepositoryName(this, 'Repository', ecrRepoName);
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
    const localStage = new DeployStage(this, 'prod-aws-cdk-sample.');
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
