/**
 * Centralised, validated environment-variable access.
 *
 * Throwing at request time on a missing or malformed var is much friendlier
 * than a confusing startup error. We parse `process.env` lazily on first
 * access, so modules that *import* `env` but never *read* it (e.g., during
 * Next.js's build-time page-data collection) don't crash.
 */
import { z } from "zod";

const Schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  NEXTAUTH_SECRET: z.string().min(16, "NEXTAUTH_SECRET must be at least 16 chars"),
  NEXTAUTH_URL: z.string().url().default("http://localhost:3000"),
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine(
      (v) => {
        try {
          return Buffer.from(v, "base64").length === 32;
        } catch {
          return false;
        }
      },
      { message: "TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64)" }
    ),
  MAX_UPLOAD_BYTES: z
    .string()
    .default("5368709120")
    .transform((v) => BigInt(v))
    .pipe(z.bigint().positive()),
  CRON_SECRET: z.string().optional(),
});

let cached: Readonly<z.infer<typeof Schema>> | null = null;

function load(): Readonly<z.infer<typeof Schema>> {
  if (cached) return cached;

  // In test mode we provide relaxed defaults so unit tests don't need a full
  // .env file. The Schema is still applied for any var the caller sets.
  const isTest = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
  if (isTest) {
    const set = (k: string, v: string) => {
      if (!process.env[k]) process.env[k] = v;
    };
    set("NODE_ENV", "test");
    set("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    set("NEXTAUTH_SECRET", "a-very-secret-test-key-32-bytes-long");
    set("NEXTAUTH_URL", "http://localhost:3000");
    set("GOOGLE_CLIENT_ID", "test-client-id");
    set("GOOGLE_CLIENT_SECRET", "test-client-secret");
    set("TOKEN_ENCRYPTION_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="); // 32 bytes base64
  }

  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    // eslint-disable-next-line no-console
    console.error(`Invalid environment configuration:\n${issues}`);
    throw new Error("Invalid environment configuration");
  }
  cached = Object.freeze(parsed.data);
  return cached;
}

/**
 * Proxy that lazily resolves and validates on first property access.
 * Reads stay typed as the underlying schema; writes are forbidden.
 */
export const env = new Proxy({} as Readonly<z.infer<typeof Schema>>, {
  get(_t, prop: string) {
    const data = load();
    return (data as Record<string, unknown>)[prop];
  },
}) as Readonly<z.infer<typeof Schema>>;

export type Env = typeof env;
