const DEV_MODE = process.env.DEV_MODE === 'true';
const ECR_IMAGE_TAG = process.env.CODEBUILD_RESOLVED_SOURCE_VERSION 
  || process.env.DEV_MODE_ECR_IMAGE_TAG
  || 'local-1';

export { DEV_MODE };
export { ECR_IMAGE_TAG };