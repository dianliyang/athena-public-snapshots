import { get, put } from "@vercel/blob";

const DEFAULT_CONTENT_TYPE = "text/plain; charset=utf-8";
const CONFIGURED_BLOB_ACCESS =
  process.env.CAU_BLOB_ACCESS === "private" || process.env.CAU_BLOB_ACCESS === "public"
    ? process.env.CAU_BLOB_ACCESS
    : null;

function preferredBlobAccessOrder(): Array<"public" | "private"> {
  if (CONFIGURED_BLOB_ACCESS) return [CONFIGURED_BLOB_ACCESS];
  return ["public", "private"];
}

export function semesterXmlKey(semester: string): string {
  return `cau/xml/${semester}.xml`;
}

export function modulDbXmlKey(moduleCode: string): string {
  return `cau/moduldb/${moduleCode}.xml`;
}

export async function readCachedText(pathname: string): Promise<string | null> {
  for (const access of preferredBlobAccessOrder()) {
    try {
      const result = await get(pathname, { access });
      if (!result || result.statusCode !== 200 || !result.stream) continue;
      return await new Response(result.stream).text();
    } catch {
      continue;
    }
  }

  return null;
}

export async function writeCachedText(
  pathname: string,
  payload: string,
  options?: { contentType?: string },
): Promise<void> {
  let lastError: unknown = null;

  for (const access of preferredBlobAccessOrder()) {
    try {
      await put(pathname, payload, {
        access,
        addRandomSuffix: false,
        contentType: options?.contentType || DEFAULT_CONTENT_TYPE,
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  console.error(`[cau-blob-cache] Failed to write ${pathname}:`, lastError);
}
