import { drizzle } from "drizzle-orm/mysql2";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

type Db = ReturnType<typeof drizzle<typeof fullSchema>>;

let instance: Db | undefined;

export function getDb(): Db {
  if (!instance) {
    instance = drizzle(env.databaseUrl, {
      mode: "planetscale",
      schema: fullSchema,
    });
  }
  return instance;
}

/** End the underlying mysql2 pool (graceful shutdown). Safe to call once. */
export async function closeDb(): Promise<void> {
  const db = instance;
  instance = undefined;
  if (!db) return;
  const client = (db as { $client?: { end?: (cb: (err?: Error) => void) => void } })
    .$client;
  if (client?.end) {
    await new Promise<void>((resolve, reject) => {
      client.end!((err?: Error) => (err ? reject(err) : resolve()));
    });
  }
}
