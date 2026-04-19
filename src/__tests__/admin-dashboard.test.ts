import { describe, expect, test } from "vitest";
import { isTextEditableKey } from "../admin/file-kinds";
import { renderDashboardPage } from "../admin/render-dashboard";

describe("admin dashboard rendering", () => {
  test("renders object keys and selected file details", () => {
    const html = renderDashboardPage({
      prefix: "workouts/",
      keys: [
        "workouts/manifest.json",
        "workouts/detail/2026-03-24T10-00-00Z.json",
      ],
      selectedKey: "workouts/manifest.json",
      selectedObject: {
        body: "{\"version\":\"2026-03-24\"}",
        contentType: "application/json",
        editable: true,
      },
      notice: "Saved workouts/manifest.json",
    });

    expect(html).toContain("workouts/manifest.json");
    expect(html).toContain("workouts/detail/2026-03-24T10-00-00Z.json");
    expect(html).toContain("Saved workouts/manifest.json");
    expect(html).toContain("class=\"shell\"");
    expect(html).toContain("class=\"sidebar\"");
    expect(html).toContain("class=\"editor\"");
    expect(html).toContain("class=\"editor-toolbar\"");
    expect(html).toContain("<textarea");
    expect(html).toContain("Content type");
    expect(html).toContain("Cmd/Ctrl+S");
    expect(html).toContain("data-editor-form");
    expect(html).toContain("data-editor-textarea");
    expect(html).toContain("data-line-numbers");
    expect(html).toContain("data-file-filter");
    expect(html).toContain("Filter files");
    expect(html).toContain("font-family: \"SFMono-Regular\"");
    expect(html).toContain("Replace selected");
    expect(html).toContain("{&quot;version&quot;:&quot;2026-03-24&quot;}");
  });

  test("treats json and text files as editable text", () => {
    expect(isTextEditableKey("workouts/manifest.json")).toBe(true);
    expect(isTextEditableKey("notes/readme.md")).toBe(true);
  });

  test("treats image and archive files as non-editable", () => {
    expect(isTextEditableKey("images/logo.png")).toBe(false);
    expect(isTextEditableKey("exports/archive.zip")).toBe(false);
  });

  test("renders replacement controls for non-editable files", () => {
    const html = renderDashboardPage({
      prefix: "images/",
      keys: ["images/logo.png"],
      selectedKey: "images/logo.png",
      selectedObject: {
        body: "",
        contentType: "image/png",
        editable: false,
      },
    });

    expect(html).toContain("Binary file. Replace it with an upload.");
    expect(html).toContain("action=\"/replace\"");
    expect(html).toContain("action=\"/delete\"");
    expect(html).toContain("Binary file");
  });
});
