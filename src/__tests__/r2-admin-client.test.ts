import { beforeEach, describe, expect, test, vi } from "vitest";

const {
  sendMock,
  S3ClientMock,
  ListObjectsV2CommandMock,
  GetObjectCommandMock,
  PutObjectCommandMock,
  DeleteObjectCommandMock,
} = vi.hoisted(() => {
  const sendMock = vi.fn();

  class S3ClientMock {
    public config: unknown;

    constructor(config: unknown) {
      this.config = config;
    }

    send = sendMock;
  }

  class ListObjectsV2CommandMock {
    constructor(public input: unknown) {}
  }

  class GetObjectCommandMock {
    constructor(public input: unknown) {}
  }

  class PutObjectCommandMock {
    constructor(public input: unknown) {}
  }

  class DeleteObjectCommandMock {
    constructor(public input: unknown) {}
  }

  return {
    sendMock,
    S3ClientMock,
    ListObjectsV2CommandMock,
    GetObjectCommandMock,
    PutObjectCommandMock,
    DeleteObjectCommandMock,
  };
});

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: S3ClientMock,
  ListObjectsV2Command: ListObjectsV2CommandMock,
  GetObjectCommand: GetObjectCommandMock,
  PutObjectCommand: PutObjectCommandMock,
  DeleteObjectCommand: DeleteObjectCommandMock,
}));

describe("r2 admin client", () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  test("loads dashboard config from env", async () => {
    const { loadDashboardConfig } = await import("../admin/r2-admin-client");

    expect(loadDashboardConfig({
      R2_ACCOUNT_ID: "acct",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET_NAME: "bucket",
      DASHBOARD_PORT: "4567",
      DASHBOARD_PREFIX: "workouts/",
    })).toEqual({
      accountId: "acct",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucketName: "bucket",
      endpoint: "https://acct.r2.cloudflarestorage.com",
      region: "auto",
      port: 4567,
      basePrefix: "workouts/",
    });
  });

  test("throws when required env is missing", async () => {
    const { loadDashboardConfig } = await import("../admin/r2-admin-client");

    expect(() => loadDashboardConfig({
      R2_ACCOUNT_ID: "acct",
      R2_ACCESS_KEY_ID: "key",
    })).toThrow("Missing required env: R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME");
  });

  test("maps list, read, write, and delete calls to S3 commands", async () => {
    sendMock
      .mockResolvedValueOnce({
        Contents: [
          { Key: "workouts/manifest.json" },
          { Key: "workouts/detail/latest.json" },
        ],
      })
      .mockResolvedValueOnce({
        Body: {
          transformToString: vi.fn().mockResolvedValue("{\"version\":\"1\"}"),
        },
        ContentType: "application/json",
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const { createR2AdminClient } = await import("../admin/r2-admin-client");
    const client = createR2AdminClient({
      accountId: "acct",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucketName: "bucket",
      endpoint: "https://acct.r2.cloudflarestorage.com",
      region: "auto",
      port: 3000,
      basePrefix: "",
    });

    await expect(client.list("workouts/")).resolves.toEqual([
      "workouts/manifest.json",
      "workouts/detail/latest.json",
    ]);
    await expect(client.get("workouts/manifest.json")).resolves.toEqual({
      body: "{\"version\":\"1\"}",
      contentType: "application/json",
    });
    await expect(client.putText("workouts/manifest.json", "{\"version\":\"2\"}", "application/json")).resolves.toBeUndefined();
    await expect(client.putObject("workouts/file.bin", new Uint8Array([1, 2, 3]), "application/octet-stream")).resolves.toBeUndefined();
    await expect(client.delete("workouts/file.bin")).resolves.toBeUndefined();

    expect(sendMock.mock.calls[0]?.[0]).toBeInstanceOf(ListObjectsV2CommandMock);
    expect(sendMock.mock.calls[0]?.[0].input).toEqual({
      Bucket: "bucket",
      Prefix: "workouts/",
    });
    expect(sendMock.mock.calls[1]?.[0]).toBeInstanceOf(GetObjectCommandMock);
    expect(sendMock.mock.calls[1]?.[0].input).toEqual({
      Bucket: "bucket",
      Key: "workouts/manifest.json",
    });
    expect(sendMock.mock.calls[2]?.[0]).toBeInstanceOf(PutObjectCommandMock);
    expect(sendMock.mock.calls[2]?.[0].input).toEqual({
      Bucket: "bucket",
      Key: "workouts/manifest.json",
      Body: "{\"version\":\"2\"}",
      ContentType: "application/json",
    });
    expect(sendMock.mock.calls[3]?.[0]).toBeInstanceOf(PutObjectCommandMock);
    expect(sendMock.mock.calls[3]?.[0].input).toEqual({
      Bucket: "bucket",
      Key: "workouts/file.bin",
      Body: new Uint8Array([1, 2, 3]),
      ContentType: "application/octet-stream",
    });
    expect(sendMock.mock.calls[4]?.[0]).toBeInstanceOf(DeleteObjectCommandMock);
    expect(sendMock.mock.calls[4]?.[0].input).toEqual({
      Bucket: "bucket",
      Key: "workouts/file.bin",
    });
  });
});
