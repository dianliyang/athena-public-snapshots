import * as fs from "fs";
import * as path from "path";

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const exportPrefix = trimmed.startsWith("export ") ? "export " : "";
  const assignment = trimmed.slice(exportPrefix.length);
  const separatorIndex = assignment.indexOf("=");
  if (separatorIndex <= 0) return null;

  const key = assignment.slice(0, separatorIndex).trim();
  if (!key) return null;

  let value = assignment.slice(separatorIndex + 1).trim();
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

export function loadLocalEnv(envPath = path.join(process.cwd(), ".env")): void {
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const entry = parseEnvLine(line);
    if (!entry) continue;

    const [key, value] = entry;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export { parseEnvLine };
