export type ManifestSnapshot = {
  version: string;
  generatedAt: string;
  detailKey: string;
  titleLocaleKey?: string;
  categoryLocaleKey?: string;
  metadataLocaleKey?: string;
  wikipediaLocaleKey?: string;
  itemCount: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isManifestSnapshot(value: unknown): value is ManifestSnapshot {
  return (
    isObject(value) &&
    typeof value.version === "string" &&
    typeof value.generatedAt === "string" &&
    typeof value.detailKey === "string" &&
    (value.titleLocaleKey === undefined || typeof value.titleLocaleKey === "string") &&
    (value.categoryLocaleKey === undefined || typeof value.categoryLocaleKey === "string") &&
    (value.metadataLocaleKey === undefined || typeof value.metadataLocaleKey === "string") &&
    (value.wikipediaLocaleKey === undefined || typeof value.wikipediaLocaleKey === "string") &&
    typeof value.itemCount === "number"
  );
}
