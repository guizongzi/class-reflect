import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "./config.js";

const s3 = new S3Client({
  region: config.s3.region,
  endpoint: config.s3.endpoint,
  forcePathStyle: config.s3.forcePathStyle,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey
  }
});

export function videoObjectKey({ teacherId, lessonId, videoId, fileName }) {
  const safeFileName = fileName.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
  return `teachers/${teacherId}/lessons/${lessonId}/videos/${videoId}/${safeFileName}`;
}

export async function createUploadUrl({ objectKey, mimeType }) {
  const command = new PutObjectCommand({
    Bucket: config.s3.bucket,
    Key: objectKey,
    ContentType: mimeType || "application/octet-stream"
  });
  return getSignedUrl(s3, command, { expiresIn: 900 });
}

export async function createReadUrl({ objectKey }) {
  const command = new GetObjectCommand({
    Bucket: config.s3.bucket,
    Key: objectKey
  });
  return getSignedUrl(s3, command, { expiresIn: 900 });
}

export async function assertObjectExists(objectKey) {
  await s3.send(new HeadObjectCommand({
    Bucket: config.s3.bucket,
    Key: objectKey
  }));
}

export async function downloadObjectToFile(objectKey, targetPath) {
  const response = await s3.send(new GetObjectCommand({
    Bucket: config.s3.bucket,
    Key: objectKey
  }));
  await pipeline(response.Body, createWriteStream(targetPath));
}

export async function uploadFile(objectKey, sourcePath, mimeType) {
  await s3.send(new PutObjectCommand({
    Bucket: config.s3.bucket,
    Key: objectKey,
    Body: createReadStream(sourcePath),
    ContentType: mimeType || "application/octet-stream"
  }));
}
