/**
 * Auth guard for API routes.
 *
 * Returns `{ userId }` if the caller is signed in (their JWT carries a
 * userId), otherwise returns a 401 Response. Routes call this at the top
 * before touching any DB row or Drive call.
 *
 * `requireUserForMutation` additionally enforces CSRF protection (origin
 * check + double-submit token). Every state-changing route should use it.
 */
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { assertCsrf, CSRF_COOKIE } from "@/lib/csrf";

export interface AuthedUser {
  userId: string;
  email: string;
}

export type AuthResult = { ok: true; user: AuthedUser } | { ok: false; response: Response };

export async function requireUser(): Promise<AuthResult> {
  const session = await auth();
  if (!session?.user) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  const id = (session.user as { id?: string }).id;
  if (!id) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "session missing userId" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  return { ok: true, user: { userId: id, email: session.user.email ?? "" } };
}

/**
 * Auth + CSRF guard for state-changing requests.
 *
 * The CSRF failure is reported as 403 with a generic body. We deliberately
 * do not echo *why* the check failed back to the client beyond a coarse
 * reason, and we never leak the expected token value.
 */
export async function requireUserForMutation(req: Request): Promise<AuthResult> {
  const authResult = await requireUser();
  if (!authResult.ok) return authResult;

  const store = await cookies();
  const cookieToken = store.get(CSRF_COOKIE)?.value;
  const csrf = assertCsrf(req, cookieToken);
  if (!csrf.ok) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }

  return authResult;
}

export function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
