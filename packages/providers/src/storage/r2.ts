import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { loadAppConfig } from "@class-reflect/config";

export type CreateR2UploadUrlInput = {
  objectKey: string;
  contentType: string;
  expiresInSeconds?: number;
};

export type R2UploadUrlResult = {
  bucket: string;
  objectKey: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresInSeconds: number;
};

let r2Client: S3Client | null = null;

export function createLessonVideoObjectKey(input: { lessonId: string; videoId: string; fileName: string }) {
  return `lessons/${input.lessonId}/videos/${input.videoId}/${sanitizeFileName(input.fileName)}`;
}

export function createLessonAudioObjectKey(input: { lessonId: string; videoId: string }) {
  return `lessons/${input.lessonId}/audio/${input.videoId}/audio.wav`;
}

export async function createR2UploadUrl(input: CreateR2UploadUrlInput): Promise<R2UploadUrlResult> {
  const config = loadAppConfig();
  assertR2Config(config);
  const expiresInSeconds = input.expiresInSeconds || 900;
  const command = new PutObjectCommand({
    Bucket: config.r2Bucket,
    Key: input.objectKey,
    ContentType: input.contentType
  });

  return {
    bucket: config.r2Bucket,
    objectKey: input.objectKey,
    uploadUrl: await getSignedUrl(getR2Client(), command, { expiresIn: expiresInSeconds }),
    method: "PUT",
    headers: { "Content-Type": input.contentType },
    expiresInSeconds
  };
}

export async function createR2ReadUrl(input: { objectKey: string; expiresInSeconds?: number }) {
  const config = loadAppConfig();
  assertR2Config(config);
  return getSignedUrl(getR2Client(), new GetObjectCommand({
    Bucket: config.r2Bucket,
    Key: input.objectKey
  }), { expiresIn: input.expiresInSeconds || 3600 });
}

export async function assertR2ObjectExists(objectKey: string) {
  const config = loadAppConfig();
  assertR2Config(config);
  await getR2Client().send(new HeadObjectCommand({
    Bucket: config.r2Bucket,
    Key: objectKey
  }));
}

function getR2Client() {
  if (r2Client) return r2Client;
  const config = loadAppConfig();
  assertR2Config(config);
  r2Client = new S3Client({
    region: config.r2Region,
    endpoint: config.r2Endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey
    }
  });
  return r2Client;
}

function assertR2Config(config: ReturnType<typeof loadAppConfig>): asserts config is ReturnType<typeof loadAppConfig> & {
  r2Endpoint: string;
  r2Bucket: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
} {
  const missing = [
    ["R2_ENDPOINT", config.r2Endpoint],
    ["R2_BUCKET", config.r2Bucket],
    ["R2_ACCESS_KEY_ID", config.r2AccessKeyId],
    ["R2_SECRET_ACCESS_KEY", config.r2SecretAccessKey]
  ].filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) throw new Error(`Missing required R2 configuration: ${missing.join(", ")}`);
}

function sanitizeFileName(fileName: string) {
  return fileName
    .trim()
    .replace(/[^\w.\-\u4e00-\u9fa5]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120) || "classroom-video.mp4";
}
