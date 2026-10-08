import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

// Next's development workers can start before root credentials are added.
// Load the monorepo env in the server worker too, not only in next.config.
// Assign to Next's process.env object; native loadEnvFile can update a different
// environment backing store after Next replaces that object in development.
export function loadServerEnv() {
  const root = resolve(process.cwd(), "../../.env.local");
  const local = resolve(process.cwd(), ".env.local");
  for (const path of [local, root]) {
    if (!existsSync(path)) continue;
    const values = parseEnv(readFileSync(path, "utf8"));
    for (const [name, value] of Object.entries(values)) {
      if (!process.env[name]) process.env[name] = value;
    }
  }
}
