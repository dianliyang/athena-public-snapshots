import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export type AdminObject = {
  body: string;
  contentType?: string;
};

export type DashboardConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
  region: string;
  port: number;
  basePrefix: string;
};

export type R2AdminClient = {
  list(prefix: string): Promise<string[]>;
  get(key: string): Promise<AdminObject | null>;
  putText(key: string, body: string, contentType?: string): Promise<void>;
  putObject(key: string, body: Uint8Array, contentType?: string): Promise<void>;
  delete(key: string): Promise<void>;
};

type DashboardEnv = Partial<Record<string, string | undefined>>;

export function loadDashboardConfig(env: DashboardEnv = process.env): DashboardConfig {
  const requiredKeys = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
  ] as const;
  const missing = requiredKeys.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }

  const accountId = String(env.R2_ACCOUNT_ID);

  return {
    accountId,
    accessKeyId: String(env.R2_ACCESS_KEY_ID),
    secretAccessKey: String(env.R2_SECRET_ACCESS_KEY),
    bucketName: String(env.R2_BUCKET_NAME),
    endpoint: String(env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`),
    region: String(env.R2_REGION || "auto"),
    port: Number(env.DASHBOARD_PORT || 3000),
    basePrefix: String(env.DASHBOARD_PREFIX || ""),
  };
}

export function createR2AdminClient(config: DashboardConfig): R2AdminClient {
  const s3 = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    async list(prefix: string): Promise<string[]> {
      const response = await s3.send(new ListObjectsV2Command({
        Bucket: config.bucketName,
        Prefix: prefix,
      }));

      return response.Contents?.flatMap((entry) => entry.Key ? [entry.Key] : []) ?? [];
    },
    async get(key: string): Promise<AdminObject | null> {
      try {
        const response = await s3.send(new GetObjectCommand({
          Bucket: config.bucketName,
          Key: key,
        }));

        if (!response.Body) {
          return null;
        }

        return {
          body: await response.Body.transformToString(),
          contentType: response.ContentType,
        };
      } catch (error) {
        if (error instanceof Error && error.name === "NoSuchKey") {
          return null;
        }

        throw error;
      }
    },
    async putText(key: string, body: string, contentType?: string): Promise<void> {
      await s3.send(new PutObjectCommand({
        Bucket: config.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
      }));
    },
    async putObject(key: string, body: Uint8Array, contentType?: string): Promise<void> {
      await s3.send(new PutObjectCommand({
        Bucket: config.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
      }));
    },
    async delete(key: string): Promise<void> {
      await s3.send(new DeleteObjectCommand({
        Bucket: config.bucketName,
        Key: key,
      }));
    },
  };
}
