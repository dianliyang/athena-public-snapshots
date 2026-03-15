import type { ManifestSnapshot } from "../schema";

export type R2BucketLike = {
  put(key: string, value: string): Promise<void>;
};

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
}
