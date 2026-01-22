import { action } from "@solidjs/router";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_PUBLIC_URL,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

const bucketName = process.env.R2_BUCKET_NAME || "microstep-vaults";

export interface PresignedUploadUrl {
  url: string;
  key: string;
}

export interface PresignedDownloadUrl {
  url: string;
  key: string;
  lastModified: Date;
}

export const generateUploadUrl = action(async (
  vaultPath: string,
  deviceId: string,
  timestamp: number
): Promise<PresignedUploadUrl> => {
  "use server";
  const key = `${vaultPath}/${timestamp}-${deviceId}.bin`;
  
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: "application/octet-stream",
  });

  const url = await generatePresignedUrl(s3Client, command, { expiresIn: 300 });

  return { url, key };
});

export const listChangesets = action(async (
  vaultPath: string,
  afterTimestamp?: number
): Promise<PresignedDownloadUrl[]> => {
  "use server";
  const command = new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: vaultPath,
  });

  const response = await s3Client.send(command);

  const objects = response.Contents || [];

  let filteredObjects = objects;
  if (afterTimestamp) {
    filteredObjects = objects.filter(obj => {
      const lastModified = obj.LastModified?.getTime() || 0;
      return lastModified > afterTimestamp;
    });
  }

  const results = await Promise.all(
    filteredObjects.map(async (obj) => {
      if (!obj.Key) return null;

      const key = obj.Key;
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      const url = await generatePresignedUrl(s3Client, command, { expiresIn: 300 });

      return {
        url,
        key,
        lastModified: obj.LastModified || new Date(),
      };
    })
  );

  return results.filter((url): url is PresignedDownloadUrl => url !== null);
});

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const generatePresignedUrl = async (
  client: S3Client,
  command: PutObjectCommand | GetObjectCommand,
  options: { expiresIn: number }
): Promise<string> => {
  return getSignedUrl(client, command, options);
};
