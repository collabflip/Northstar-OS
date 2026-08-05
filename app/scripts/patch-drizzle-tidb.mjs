/**
 * TiDB compatibility patch for drizzle-kit push introspection.
 *
 * drizzle-kit reads PK metadata with:
 *   SELECT table_name, column_name, ordinal_position FROM information_schema...
 * and then expects UPPERCASE row keys ("TABLE_NAME"). Real MySQL returns the
 * original uppercase information_schema column names; TiDB returns the aliases
 * exactly as written (lowercase), so drizzle-kit thinks no PK exists and tries
 * ALTER TABLE ... ADD PRIMARY KEY -> ER_MULTIPLE_PRI_KEY.
 *
 * This script makes the row-key reads case-tolerant. Idempotent. Dev-tool only.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "node_modules", "drizzle-kit", "bin.cjs");
if (!existsSync(target)) {
  console.log("[patch-drizzle-tidb] drizzle-kit not installed; skipping");
  process.exit(0);
}
let src = readFileSync(target, "utf8");
const replacements = [
  ['tableToPkRow["TABLE_NAME"]', '(tableToPkRow["TABLE_NAME"] ?? tableToPkRow["table_name"])'],
  ['tableToPkRow["COLUMN_NAME"]', '(tableToPkRow["COLUMN_NAME"] ?? tableToPkRow["column_name"])'],
  ['tableToPkRow["ordinal_position"]', '(tableToPkRow["ordinal_position"] ?? tableToPkRow["ORDINAL_POSITION"])'],
];
let changed = 0;
for (const [from, to] of replacements) {
  if (src.includes(to)) continue;
  if (src.includes(from)) {
    src = src.split(from).join(to);
    changed++;
  }
}
if (changed > 0) {
  writeFileSync(target, src);
  console.log(`[patch-drizzle-tidb] applied ${changed} patch(es)`);
} else {
  console.log("[patch-drizzle-tidb] already patched or nothing to do");
}
