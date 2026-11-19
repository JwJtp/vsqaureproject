import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env, dataMode } from "@/lib/env";
import { getStore } from "@/lib/db";
import type { Lead, Role, SessionUser } from "@/lib/types";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const DEMO_ROLE_COOKIE = "vs_demo_role";

export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          /* called from a Server Component — middleware refreshes the session */
        }
      },
    },
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  if (dataMode() === "demo") {
    const jar = await cookies();
    const v = jar.get(DEMO_ROLE_COOKIE)?.value ?? "admin";
    if (v.startsWith("exec:")) {
      const store = await getStore();
      const e = await store.get("executives", v.slice(5));
      if (e) return { id: `demo-user-${e.id}`, name: e.name, email: e.email, role: "executive", executiveId: e.id, demo: true };
    }
    return { id: "demo-admin", name: "Demo Admin", email: "admin@demo.local", role: "admin", executiveId: null, demo: true };
  }
  if (!env.SUPABASE_ANON_KEY) return null;
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  const store = await getStore();
  const profile = await store.get("profiles", data.user.id);
  if (!profile) return null;
  return { id: profile.id, name: profile.name || profile.email, email: profile.email, role: profile.role, executiveId: profile.executive_id, demo: false };
}

export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new HttpError(401, "Not signed in");
  if (roles && !roles.includes(u.role)) throw new HttpError(403, "You do not have permission for this action");
  return u;
}

export const isStaffAdmin = (u: SessionUser) => u.role === "admin" || u.role === "manager";

/** Executives may only touch leads assigned to them. */
export function assertLeadAccess(u: SessionUser, lead: Pick<Lead, "assigned_executive_id">) {
  if (isStaffAdmin(u)) return;
  if (u.role === "executive" && u.executiveId && lead.assigned_executive_id === u.executiveId) return;
  throw new HttpError(403, "This lead is not assigned to you");
}
