import { route, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { audit } from "@/lib/log";
import { ExecSchema } from "@/lib/schemas";
import { normalizePhone } from "@/lib/util";
import { executiveLoads } from "@/lib/assignment";


export const GET = route(async () => {
  await requireUser(["admin", "manager"]);
  const store = await getStore();
  const [execs, leads, loads] = await Promise.all([store.list("executives", { order: { column: "name" } }), store.list("leads"), executiveLoads()]);
  return json({
    executives: execs.map((e) => {
      const mine = leads.filter((l) => l.assigned_executive_id === e.id);
      return {
        ...e,
        openLeads: loads.get(e.id)?.openLeads ?? 0,
        assignedToday: loads.get(e.id)?.assignedToday ?? 0,
        totalLeads: mine.length,
        converted: mine.filter((l) => l.status === "CONVERTED").length,
        lost: mine.filter((l) => l.status === "LOST").length,
        conversionRate: mine.length ? Math.round((mine.filter((l) => l.status === "CONVERTED").length / mine.length) * 100) : 0,
      };
    }),
  });
});

export const POST = route(async (req) => {
  const user = await requireUser(["admin", "manager"]);
  const body = ExecSchema.parse(await req.json());
  const phone = normalizePhone(body.phone);
  if (!phone) return json({ error: "Invalid phone number" }, 400);
  const store = await getStore();
  const exec = await store.insert("executives", { ...body, phone, user_id: null, is_demo: store.kind === "memory" });
  await audit(user.email, "executive.create", "executives", exec.id);
  return json({ executive: exec }, 201);
});
