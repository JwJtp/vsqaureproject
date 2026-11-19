import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import { dataMode } from "@/lib/env";
import { DEMO_ROLE_COOKIE, HttpError } from "@/lib/auth";

/** DEMO MODE only: switch between the admin view and an executive's portal. */
export const POST = route(async (req) => {
  if (dataMode() !== "demo") throw new HttpError(403, "Only available in DEMO MODE");
  const { role } = z.object({ role: z.string().regex(/^(admin|exec:[\w-]+)$/) }).parse(await req.json());
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DEMO_ROLE_COOKIE, role, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  return res;
});
