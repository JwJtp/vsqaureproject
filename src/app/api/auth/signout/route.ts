import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { dataMode } from "@/lib/env";
import { supabaseServer, DEMO_ROLE_COOKIE } from "@/lib/auth";

export const POST = route(async () => {
  if (dataMode() === "live") await (await supabaseServer()).auth.signOut();
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(DEMO_ROLE_COOKIE);
  return res;
});
