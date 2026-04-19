const TEXT_EDITABLE_EXTENSIONS = new Set([
  ".json",
  ".txt",
  ".md",
  ".js",
  ".ts",
  ".html",
  ".css",
  ".csv",
  ".xml",
  ".yml",
  ".yaml",
]);

export function isTextEditableKey(key: string): boolean {
  const normalizedKey = key.toLowerCase();
  const extensionIndex = normalizedKey.lastIndexOf(".");

  if (extensionIndex < 0) {
    return false;
  }

  return TEXT_EDITABLE_EXTENSIONS.has(normalizedKey.slice(extensionIndex));
}
