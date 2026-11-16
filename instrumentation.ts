/**
 * Fail-fast env validation at server startup (next start / standalone
 * server.js). The build deliberately uses dummy DATABASE_URL/secret values,
 * so this only runs at runtime. In production a missing or placeholder value
 * aborts boot; in development it warns.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const problems: string[] = [];
  const secret = process.env.BETTER_AUTH_SECRET;
  const url = process.env.BETTER_AUTH_URL;

  if (!process.env.DATABASE_URL) problems.push("DATABASE_URL is not set");
  if (!secret || secret === "replace-me") {
    problems.push("BETTER_AUTH_SECRET is missing or still the placeholder");
  }
  if (!url) {
    problems.push("BETTER_AUTH_URL is not set");
  } else if (
    process.env.NODE_ENV === "production" &&
    /^(http:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/.test(url)
  ) {
    problems.push(
      `BETTER_AUTH_URL points at a loopback origin (${url}) — set it to the public origin or auth callbacks break behind TLS`,
    );
  }

  if (problems.length === 0) return;

  const message = `[keystone] environment validation failed:\n  - ${problems.join("\n  - ")}`;
  if (process.env.NODE_ENV === "production") {
    throw new Error(message);
  }
  console.warn(message);
}
