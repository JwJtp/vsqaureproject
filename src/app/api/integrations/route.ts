import { z } from "zod";
import { route, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { integrationStatuses, testIntegration } from "@/lib/integrations";
import { audit } from "@/lib/log";

export const GET = route(async () => {
  await requireUser(["admin", "manager"]);
  return json({ integrations: await integrationStatuses() });
});

export const POST = route(async (req) => {
  const user = await requireUser(["admin"]);
  const { id } = z.object({ id: z.string() }).parse(await req.json());
  const r = await testIntegration(id);
  await audit(user.email, "integration.test", "integrations", id, { ok: r.ok });
  return json(r);
});
