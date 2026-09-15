import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fromInstanceMetadata } from "@smithy/credential-provider-imds";

export const S3_BUCKET_NAME = process.env.AWS_S3_STORAGE_BUCKET || "codeup-storage-687374520011";
export const AWS_REGION = process.env.AWS_REGION || "eu-north-1";

// Credential resolution.
//
// The SDK's default chain reads ~/.aws/config before the EC2 instance role. On
// this box that file carries a human `aws login` session, so once it expires
// every S3 call fails with "Your session has expired" even though the instance
// role is valid — the login provider aborts the chain instead of falling
// through. Explicit static keys (AWS_ACCESS_KEY_ID) still win for local dev;
// otherwise go straight to the instance role and never consult the ini file.
const credentials = process.env.AWS_ACCESS_KEY_ID
  ? undefined
  : fromInstanceMetadata({ timeout: 2000, maxRetries: 3 });

export const s3Client = new S3Client({
  region: AWS_REGION,
  credentials,
});

/**
 * Upload a Buffer or Stream directly to S3
 */
export async function uploadToS3(params: {
  key: string;
  body: Buffer | Uint8Array | Blob | string;
  contentType?: string;
  metadata?: Record<string, string>;
}): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: params.key,
    Body: params.body as any,
    ContentType: params.contentType,
    Metadata: params.metadata,
  });

  await s3Client.send(command);
  return `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${params.key}`;
}

/**
 * Generate a pre-signed download URL for private files (e.g. homework)
 */
export async function getPresignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Generate a pre-signed upload URL for browser-to-S3 direct uploads
 */
export async function getPresignedUploadUrl(key: string, contentType: string, expiresInSeconds = 900): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Delete an object from S3
 */
export async function deleteFromS3(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}
