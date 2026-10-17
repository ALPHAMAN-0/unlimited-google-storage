/**
 * Auth guard for API routes.
 *
 * Returns `{ userId }` if the caller is signed in (their JWT carries a
 * userId), otherwise returns a 401 Response. Routes call this at the top
 * before touching any DB row or Drive call.
 */
import { auth } from "@/lib/auth";

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

export function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
