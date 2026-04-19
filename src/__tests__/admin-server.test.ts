import { describe, expect, test } from "vitest";
import { createAdminApp } from "../admin/create-admin-server";

type StoredObject = {
  body: string;
  contentType?: string;
};

class FakeAdminClient {
  public objects = new Map<string, StoredObject>();
  public deletedKeys: string[] = [];
  public binaryWrites: Array<{ key: string; body: Uint8Array; contentType?: string }> = [];

  constructor(entries: Array<[string, StoredObject]>) {
    for (const [key, value] of entries) {
      this.objects.set(key, value);
    }
  }

  async list(prefix: string): Promise<string[]> {
    return [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
  }

  async get(key: string): Promise<StoredObject | null> {
    return this.objects.get(key) ?? null;
  }

  async putText(key: string, body: string, contentType?: string): Promise<void> {
    this.objects.set(key, { body, contentType });
  }

  async putObject(key: string, body: Uint8Array, contentType?: string): Promise<void> {
    this.binaryWrites.push({ key, body, contentType });
    this.objects.set(key, {
      body: new TextDecoder().decode(body),
      contentType,
    });
  }

  async delete(key: string): Promise<void> {
    this.deletedKeys.push(key);
    this.objects.delete(key);
  }
}

describe("admin server", () => {
  test("renders the dashboard with listed keys", async () => {
    const client = new FakeAdminClient([
      ["workouts/manifest.json", { body: "{\"version\":\"1\"}", contentType: "application/json" }],
      ["workouts/detail/latest.json", { body: "{\"id\":\"demo\"}", contentType: "application/json" }],
    ]);
    const app = createAdminApp({ client });

    const response = await app.fetch(new Request("http://localhost:3000/?prefix=workouts/"));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("workouts/manifest.json");
    expect(html).toContain("workouts/detail/latest.json");
  });

  test("auto-selects workouts manifest when browsing workouts without a selected key", async () => {
    const client = new FakeAdminClient([
      ["workouts/manifest.json", { body: "{\"version\":\"1\"}", contentType: "application/json" }],
      ["workouts/detail/latest.json", { body: "{\"id\":\"demo\"}", contentType: "application/json" }],
    ]);
    const app = createAdminApp({ client });

    const response = await app.fetch(new Request("http://localhost:3000/?prefix=workouts/"));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Editing");
    expect(html).toContain("workouts/manifest.json");
    expect(html).toContain("Clear stale files");
  });

  test("shows the selected object body", async () => {
    const client = new FakeAdminClient([
      ["workouts/manifest.json", { body: "{\"version\":\"1\"}", contentType: "application/json" }],
    ]);
    const app = createAdminApp({ client });

    const response = await app.fetch(
      new Request("http://localhost:3000/?prefix=workouts/&key=workouts%2Fmanifest.json"),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("{&quot;version&quot;:&quot;1&quot;}");
    expect(html).toContain("workouts/manifest.json");
  });

  test("saves edited text objects", async () => {
    const client = new FakeAdminClient([
      ["workouts/manifest.json", { body: "{\"version\":\"1\"}", contentType: "application/json" }],
    ]);
    const app = createAdminApp({ client });
    const form = new URLSearchParams({
      prefix: "workouts/",
      key: "workouts/manifest.json",
      body: "{\"version\":\"2\"}",
    });

    const response = await app.fetch(new Request("http://localhost:3000/save", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    }));

    expect(response.status).toBe(303);
    expect(client.objects.get("workouts/manifest.json")).toEqual({
      body: "{\"version\":\"2\"}",
      contentType: "application/json; charset=utf-8",
    });
    expect(response.headers.get("location")).toBe(
      "/?prefix=workouts%2F&key=workouts%2Fmanifest.json&notice=Saved+workouts%2Fmanifest.json",
    );
  });

  test("rejects invalid json saves and preserves the unsaved body", async () => {
    const client = new FakeAdminClient([
      ["workouts/manifest.json", { body: "{\"version\":\"1\"}", contentType: "application/json" }],
    ]);
    const app = createAdminApp({ client });
    const form = new URLSearchParams({
      prefix: "workouts/",
      key: "workouts/manifest.json",
      body: "{\"version\":",
    });

    const response = await app.fetch(new Request("http://localhost:3000/save", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    }));
    const html = await response.text();

    expect(response.status).toBe(400);
    expect(client.objects.get("workouts/manifest.json")).toEqual({
      body: "{\"version\":\"1\"}",
      contentType: "application/json",
    });
    expect(html).toContain("Invalid JSON");
    expect(html).toContain("{&quot;version&quot;:");
  });

  test("deletes selected objects", async () => {
    const client = new FakeAdminClient([
      ["workouts/manifest.json", { body: "{\"version\":\"1\"}", contentType: "application/json" }],
    ]);
    const app = createAdminApp({ client });
    const form = new URLSearchParams({
      prefix: "workouts/",
      key: "workouts/manifest.json",
    });

    const response = await app.fetch(new Request("http://localhost:3000/delete", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    }));

    expect(response.status).toBe(303);
    expect(client.deletedKeys).toEqual(["workouts/manifest.json"]);
    expect(client.objects.has("workouts/manifest.json")).toBe(false);
  });

  test("replaces a selected object with uploaded content", async () => {
    const client = new FakeAdminClient([
      ["workouts/manifest.json", { body: "{\"version\":\"1\"}", contentType: "application/json" }],
    ]);
    const app = createAdminApp({ client });
    const form = new FormData();
    form.set("prefix", "workouts/");
    form.set("key", "workouts/manifest.json");
    form.set("file", new File(["{\"version\":\"3\"}"], "manifest.json", {
      type: "application/json",
    }));

    const response = await app.fetch(new Request("http://localhost:3000/replace", {
      method: "POST",
      body: form,
    }));

    expect(response.status).toBe(303);
    expect(client.binaryWrites).toHaveLength(1);
    expect(client.binaryWrites[0]?.key).toBe("workouts/manifest.json");
    expect(new TextDecoder().decode(client.binaryWrites[0]?.body)).toBe("{\"version\":\"3\"}");
    expect(client.binaryWrites[0]?.contentType).toBe("application/json");
  });

  test("formats valid json without saving it", async () => {
    const client = new FakeAdminClient([
      ["workouts/manifest.json", { body: "{\"version\":\"1\"}", contentType: "application/json" }],
    ]);
    const app = createAdminApp({ client });
    const form = new URLSearchParams({
      prefix: "workouts/",
      key: "workouts/manifest.json",
      body: "{\"version\":\"2\",\"items\":[1,2]}",
    });

    const response = await app.fetch(new Request("http://localhost:3000/format-json", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    }));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(client.objects.get("workouts/manifest.json")).toEqual({
      body: "{\"version\":\"1\"}",
      contentType: "application/json",
    });
    expect(html).toContain("&quot;items&quot;: [");
    expect(html).toContain("Formatted JSON");
  });

  test("clears stale workout files not referenced by workouts manifest", async () => {
    const client = new FakeAdminClient([
      ["workouts/manifest.json", {
        body: JSON.stringify({
          version: "2026-03-24T12-00-00Z",
          generatedAt: "2026-03-24T12-00-00Z",
          detailKey: "workouts/detail/2026-03-24T12-00-00Z.json",
          titleLocaleKey: "workouts/locales/title/2026-03-24T12-00-00Z.json",
          categoryLocaleKey: "workouts/locales/category/2026-03-24T12-00-00Z.json",
          metadataLocaleKey: "workouts/locales/metadata/2026-03-24T12-00-00Z.json",
          wikipediaLocaleKey: "workouts/locales/wikipedia/2026-03-24T12-00-00Z.json",
          itemCount: 1,
        }),
        contentType: "application/json",
      }],
      ["workouts/detail/2026-03-24T12-00-00Z.json", { body: "{}", contentType: "application/json" }],
      ["workouts/detail/2026-03-23T12-00-00Z.json", { body: "{}", contentType: "application/json" }],
      ["workouts/locales/title/2026-03-24T12-00-00Z.json", { body: "{}", contentType: "application/json" }],
      ["workouts/locales/title/2026-03-23T12-00-00Z.json", { body: "{}", contentType: "application/json" }],
      ["workouts/locales/category/2026-03-24T12-00-00Z.json", { body: "{}", contentType: "application/json" }],
      ["workouts/locales/metadata/2026-03-24T12-00-00Z.json", { body: "{}", contentType: "application/json" }],
      ["workouts/locales/wikipedia/2026-03-24T12-00-00Z.json", { body: "{}", contentType: "application/json" }],
      ["workouts/debug.txt", { body: "stale", contentType: "text/plain" }],
    ]);
    const app = createAdminApp({ client });
    const form = new URLSearchParams({
      prefix: "workouts/",
      key: "workouts/manifest.json",
    });

    const response = await app.fetch(new Request("http://localhost:3000/clear-stale", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    }));

    expect(response.status).toBe(303);
    expect(client.deletedKeys.sort()).toEqual([
      "workouts/debug.txt",
      "workouts/detail/2026-03-23T12-00-00Z.json",
      "workouts/locales/title/2026-03-23T12-00-00Z.json",
    ]);
    expect(response.headers.get("location")).toContain("Removed+3+stale+workout+files");
  });

  test("refuses stale cleanup when selected file is not workouts manifest", async () => {
    const client = new FakeAdminClient([
      ["workouts/detail/2026-03-24T12-00-00Z.json", { body: "{}", contentType: "application/json" }],
    ]);
    const app = createAdminApp({ client });
    const form = new URLSearchParams({
      prefix: "workouts/",
      key: "workouts/detail/2026-03-24T12-00-00Z.json",
    });

    const response = await app.fetch(new Request("http://localhost:3000/clear-stale", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    }));
    const html = await response.text();

    expect(response.status).toBe(400);
    expect(client.deletedKeys).toEqual([]);
    expect(html).toContain("Clear stale files is only available");
  });
});
