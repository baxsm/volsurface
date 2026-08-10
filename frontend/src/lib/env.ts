import { z } from "zod";

// vite only exposes VITE_-prefixed vars to the browser, so nothing server-side
// can leak in here by accident. validated at module load: a bad value fails the
// app immediately instead of surfacing as a confusing fetch error later.
const schema = z.object({
  VITE_API_URL: z.url().default("http://localhost:3001"),
});

const parsed = schema.safeParse(import.meta.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`invalid environment:\n${issues}`);
}

export const env = parsed.data;
