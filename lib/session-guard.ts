import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * Resolves the authenticated user's id from the incoming request's session,
 * or null when the caller is not authenticated (or there is no request
 * context — e.g. a background pipeline or a direct test invocation).
 */
export async function getSessionUserId(): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Server Action / Server Component guard. Throws ("Unauthorized") unless a
 * valid Better Auth session exists. Returns the session user's id so callers
 * never have to trust a client-supplied userId.
 */
export async function requireUserId(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error("Unauthorized");
  return userId;
}
