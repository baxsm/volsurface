import { z } from "zod";

// vite only exposes VITE_-prefixed vars to the browser, so nothing server-side
// can leak in here by accident. validated at module load: a bad value fails the
// app immediately instead of surfacing as a confusing fetch error later.
//
// empty means same-origin: the browser calls /api/... and the host rewrites it
// to the api. that keeps the session cookie first-party, which is the only
// arrangement safari's tracking prevention leaves working when the two services
// deploy separately. an absolute url is the cross-origin fallback and then the
// api has to send sameSite=none, so it is allowed but not the default.
const schema = z.object({
  VITE_API_URL: z
    .union([z.literal(""), z.url()])
    .default("")
    .transform((value) => value.replace(/\/$/, "")),
});

const parsed = schema.safeParse(import.meta.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`invalid environment:\n${issues}`);
}

export const env = parsed.data;
