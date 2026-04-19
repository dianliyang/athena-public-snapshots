import { isTextEditableKey } from "./file-kinds";
import { renderDashboardPage } from "./render-dashboard";
import type { R2AdminClient } from "./r2-admin-client";

function redirectToDashboard(prefix: string, key?: string, notice?: string): Response {
  const params = new URLSearchParams();
  params.set("prefix", prefix);

  if (key) {
    params.set("key", key);
  }

  if (notice) {
    params.set("notice", notice);
  }

  return new Response(null, {
    status: 303,
    headers: {
      location: `/?${params.toString()}`,
    },
  });
}

function inferTextContentType(key: string): string {
  return key.toLowerCase().endsWith(".json")
    ? "application/json; charset=utf-8"
    : "text/plain; charset=utf-8";
}

function isJsonKey(key: string): boolean {
  return key.toLowerCase().endsWith(".json");
}

function validateJson(body: string): { ok: true; formatted: string } | { ok: false; message: string } {
  try {
    return {
      ok: true,
      formatted: JSON.stringify(JSON.parse(body), null, 2),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

type WorkoutsManifestLike = {
  detailKey: string;
  titleLocaleKey?: string;
  categoryLocaleKey?: string;
  metadataLocaleKey?: string;
  wikipediaLocaleKey?: string;
};

function isWorkoutsManifestLike(value: unknown): value is WorkoutsManifestLike {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.detailKey === "string" &&
    (record.titleLocaleKey === undefined || typeof record.titleLocaleKey === "string") &&
    (record.categoryLocaleKey === undefined || typeof record.categoryLocaleKey === "string") &&
    (record.metadataLocaleKey === undefined || typeof record.metadataLocaleKey === "string") &&
    (record.wikipediaLocaleKey === undefined || typeof record.wikipediaLocaleKey === "string")
  );
}

function selectStaleWorkoutKeys(keys: string[], manifest: WorkoutsManifestLike): string[] {
  const keep = new Set([
    "workouts/manifest.json",
    manifest.detailKey,
    manifest.titleLocaleKey,
    manifest.categoryLocaleKey,
    manifest.metadataLocaleKey,
    manifest.wikipediaLocaleKey,
  ].filter((value): value is string => Boolean(value)));

  return keys.filter((key) => key.startsWith("workouts/") && !keep.has(key));
}

function renderEditorState(input: {
  prefix: string;
  keys: string[];
  key: string;
  body: string;
  contentType?: string;
  notice?: string;
  error?: string;
  jsonError?: string;
}, status = 200): Response {
  return new Response(renderDashboardPage({
    prefix: input.prefix,
    keys: input.keys,
    selectedKey: input.key,
    notice: input.notice,
    error: input.error,
    selectedObject: {
      body: input.body,
      contentType: input.contentType,
      editable: true,
      jsonError: input.jsonError,
    },
  }), {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

export function createAdminApp(input: { client: R2AdminClient; defaultPrefix?: string }) {
  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/") {
        const prefix = url.searchParams.get("prefix") ?? input.defaultPrefix ?? "";
        const keys = await input.client.list(prefix);
        const requestedKey = url.searchParams.get("key") ?? undefined;
        const selectedKey = requestedKey
          ?? (prefix === "workouts/" && keys.includes("workouts/manifest.json")
            ? "workouts/manifest.json"
            : undefined);
        const notice = url.searchParams.get("notice") ?? undefined;
        const error = url.searchParams.get("error") ?? undefined;
        const selectedObject = selectedKey
          ? isTextEditableKey(selectedKey)
            ? await input.client.get(selectedKey)
            : { body: "", contentType: undefined }
          : null;

        const html = renderDashboardPage({
          prefix,
          keys,
          selectedKey,
          notice,
          error,
          selectedObject: selectedObject
            ? {
              body: selectedObject.body,
              contentType: selectedObject.contentType,
              editable: isTextEditableKey(selectedKey ?? ""),
              jsonError: undefined,
            }
            : undefined,
        });

        return new Response(html, {
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
        });
      }

      if (request.method === "POST" && url.pathname === "/save") {
        const form = await request.formData();
        const prefix = String(form.get("prefix") ?? "");
        const key = String(form.get("key") ?? "");
        const body = String(form.get("body") ?? "");

        if (isJsonKey(key)) {
          const validation = validateJson(body);
          if (!validation.ok) {
            return renderEditorState({
              prefix,
              keys: await input.client.list(prefix),
              key,
              body,
              contentType: "application/json; charset=utf-8",
              error: "Invalid JSON. Fix the document before saving.",
              jsonError: validation.message,
            }, 400);
          }
        }

        await input.client.putText(key, body, inferTextContentType(key));

        return redirectToDashboard(prefix, key, `Saved ${key}`);
      }

      if (request.method === "POST" && url.pathname === "/format-json") {
        const form = await request.formData();
        const prefix = String(form.get("prefix") ?? "");
        const key = String(form.get("key") ?? "");
        const body = String(form.get("body") ?? "");
        const validation = validateJson(body);

        if (!validation.ok) {
          return renderEditorState({
            prefix,
            keys: await input.client.list(prefix),
            key,
            body,
            contentType: "application/json; charset=utf-8",
            error: "Invalid JSON. Fix the document before formatting.",
            jsonError: validation.message,
          }, 400);
        }

        return renderEditorState({
          prefix,
          keys: await input.client.list(prefix),
          key,
          body: validation.formatted,
          contentType: "application/json; charset=utf-8",
          notice: "Formatted JSON. Review it before saving.",
        });
      }

      if (request.method === "POST" && url.pathname === "/delete") {
        const form = await request.formData();
        const prefix = String(form.get("prefix") ?? "");
        const key = String(form.get("key") ?? "");

        await input.client.delete(key);

        return redirectToDashboard(prefix, undefined, `Deleted ${key}`);
      }

      if (request.method === "POST" && url.pathname === "/replace") {
        const form = await request.formData();
        const prefix = String(form.get("prefix") ?? "");
        const key = String(form.get("key") ?? "");
        const file = form.get("file");

        if (!(file instanceof File)) {
          return redirectToDashboard(prefix, key, "No replacement file provided");
        }

        await input.client.putObject(
          key,
          new Uint8Array(await file.arrayBuffer()),
          file.type || undefined,
        );

        return redirectToDashboard(prefix, key, `Replaced ${key}`);
      }

      if (request.method === "POST" && url.pathname === "/clear-stale") {
        const form = await request.formData();
        const prefix = String(form.get("prefix") ?? "");
        const key = String(form.get("key") ?? "");

        if (key !== "workouts/manifest.json") {
          return new Response(renderDashboardPage({
            prefix,
            keys: await input.client.list(prefix),
            selectedKey: key || undefined,
            error: "Clear stale files is only available for workouts/manifest.json.",
            selectedObject: key
              ? {
                body: (await input.client.get(key))?.body ?? "",
                contentType: (await input.client.get(key))?.contentType,
                editable: isTextEditableKey(key),
              }
              : undefined,
          }), {
            status: 400,
            headers: {
              "content-type": "text/html; charset=utf-8",
            },
          });
        }

        const manifestObject = await input.client.get("workouts/manifest.json");
        if (!manifestObject) {
          return redirectToDashboard(prefix, key, "Missing workouts/manifest.json");
        }

        let parsedManifest: unknown;
        try {
          parsedManifest = JSON.parse(manifestObject.body);
        } catch {
          return redirectToDashboard(prefix, key, "workouts/manifest.json is not valid JSON");
        }

        if (!isWorkoutsManifestLike(parsedManifest)) {
          return redirectToDashboard(prefix, key, "workouts/manifest.json is missing required manifest keys");
        }

        const staleKeys = selectStaleWorkoutKeys(
          await input.client.list("workouts/"),
          parsedManifest,
        );

        await Promise.all(staleKeys.map(async (staleKey) => {
          await input.client.delete(staleKey);
        }));

        return redirectToDashboard(prefix, key, `Removed ${staleKeys.length} stale workout files`);
      }

      return new Response("Not found", { status: 404 });
    },
  };
}
