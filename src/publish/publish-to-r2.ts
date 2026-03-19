import type { ManifestSnapshot } from "../schema";

export type R2BucketLike = {
  put(key: string, value: string): Promise<void>;
  list?(options?: { prefix?: string; cursor?: string }): Promise<{
    objects: Array<{ key: string }>;
    truncated?: boolean;
    cursor?: string;
  }>;
  delete?(keys: string | string[]): Promise<void>;
};

const SNAPSHOT_RETENTION_COUNT = 3;

async function listAllKeys(bucket: R2BucketLike, prefix: string): Promise<string[]> {
  if (!bucket.list) return [];

  const keys: string[] = [];
  let cursor: string | undefined;

  do {
    const result = await bucket.list({ prefix, cursor });
    keys.push(...result.objects.map((object) => object.key));
    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);

  return keys;
}

function selectKeysToDelete(keys: string[], keepCount: number): string[] {
  return [...keys]
    .sort((a, b) => b.localeCompare(a))
    .slice(keepCount);
}

async function pruneOldSnapshots(
  bucket: R2BucketLike,
  prefixes: string[],
  keepCount: number,
): Promise<void> {
  if (!bucket.list || !bucket.delete) return;

  for (const prefix of prefixes) {
    const keys = await listAllKeys(bucket, prefix);
    const keysToDelete = selectKeysToDelete(keys, keepCount);
    if (keysToDelete.length > 0) {
      await bucket.delete(keysToDelete);
    }
  }
}

export async function publishSnapshotSet(
  bucket: R2BucketLike,
  input: {
    baseKey: string;
    manifest: ManifestSnapshot;
    browse: unknown;
    detail: unknown;
  },
): Promise<void> {
  await bucket.put(input.manifest.browseKey, JSON.stringify(input.browse, null, 2));
  await bucket.put(input.manifest.detailKey, JSON.stringify(input.detail, null, 2));
  await bucket.put(`${input.baseKey}/manifest.json`, JSON.stringify(input.manifest, null, 2));

  if (input.baseKey === "workouts") {
    await pruneOldSnapshots(
      bucket,
      [
        `${input.baseKey}/browse/`,
        `${input.baseKey}/detail/`,
        `${input.baseKey}/locales/title/`,
        `${input.baseKey}/locales/category/`,
      ],
      SNAPSHOT_RETENTION_COUNT,
    );
  }
}
