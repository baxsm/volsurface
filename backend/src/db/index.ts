import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

// lazy so importing anything that touches the db does not open a socket at
// module load - migrations and tests import the schema without a live server.
let client: ReturnType<typeof postgres> | null = null;
let instance: ReturnType<typeof drizzle<typeof schema>> | null = null;

const connect = () => {
  if (instance === null || client === null) {
    client = postgres(env.DATABASE_URL, { max: 10, onnotice: () => {} });
    instance = drizzle(client, { schema });
  }
  return { client, instance };
};

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get: (_target, prop) => Reflect.get(connect().instance, prop),
});

export const closeDb = async (): Promise<void> => {
  if (client !== null) {
    await client.end();
    client = null;
    instance = null;
  }
};

export { schema };
