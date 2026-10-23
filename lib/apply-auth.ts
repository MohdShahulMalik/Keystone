import { getSessionUserId } from "@/lib/session-guard";

/**
 * Resolves which user's pipeline an `/api/apply/*` endpoint operates on.
 *
 * These routes serve two callers with different credentials:
 *
 * 1. The headless apply agent (curl/OpenCode, no browser session) must send
 *    `Authorization: Bearer <APPLY_AGENT_TOKEN>` (value from the server's
 *    .env) and explicitly name the pipeline owner it acts for via `userId`.
 *    A matching wrong token never degrades to another path — unknown
 *    credentials are rejected outright.
 * 2. A normal browser request falls through to the Better Auth session user,
 *    like every other authenticated surface.
 *
 * Returns the target userId, or null when the caller is not authorized
 * (callers respond 401 themselves).
 */
export async function resolveApplyTargetUserId(
  req: Request,
  explicitUserId: string | null,
): Promise<string | null> {
  const expectedToken = process.env.APPLY_AGENT_TOKEN;
  if (expectedToken) {
    const authHeader = req.headers.get("authorization") ?? "";
    if (authHeader === `Bearer ${expectedToken}`) {
      return explicitUserId ? explicitUserId : null;
    }
    if (authHeader) {
      // Token was supplied but doesn't match — reject, never fall back.
      return null;
    }
  }

  return await getSessionUserId();
}
