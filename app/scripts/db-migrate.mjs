// db-migrate.mjs — apply committed versioned migrations (db/migrations) to the
// database named by DATABASE_URL. Safe to run on fresh AND existing databases:
// drizzle's migrator records applied migrations in its journal table and
// no-ops when everything is already applied. Never truncates/drops data.
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { fileURLToPath } from "node:url";
import path from "node:path";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[db-migrate] DATABASE_URL is required");
  process.exit(1);
}

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../db/migrations",
);

const pool = mysql.createPool(databaseUrl);
const db = drizzle(pool);

try {
  await migrate(db, { migrationsFolder });
  console.log(`[db-migrate] migrations applied from ${migrationsFolder}`);
} catch (err) {
  console.error("[db-migrate] migration failed:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
