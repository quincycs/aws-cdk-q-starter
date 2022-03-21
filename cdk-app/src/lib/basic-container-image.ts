import { ContainerDefinition, ContainerImage, ContainerImageConfig } from "aws-cdk-lib/aws-ecs";
import { Construct } from "constructs";

export class BasicContainerImage extends ContainerImage {

  /**
   * Images in Amazon ECR repositories can be specified by either using the full registry/repository:tag or
   * registry/repository@digest.
   *
   * For example, 012345678910.dkr.ecr.<region-name>.amazonaws.com/<repository-name>:latest or
   * 012345678910.dkr.ecr.<region-name>.amazonaws.com/<repository-name>@sha256:94afd1f2e64d908bc90dbca0035a5b567EXAMPLE.
   */
  public readonly imageUri: string;

  constructor(imageUri: string) {
    super();
    this.imageUri = imageUri;
  }

  bind(_scope: Construct, _containerDefinition: ContainerDefinition): ContainerImageConfig {
    return {
      imageName: this.imageUri
    }
  }
  
}