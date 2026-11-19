import { route, json } from "@/lib/api";
import { requireUser, HttpError } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { audit } from "@/lib/log";
import { normalizePhone } from "@/lib/util";
import { ExecSchema } from "@/lib/schemas";

type P = { params: Promise<{ id: string }> };
export const PATCH = route<P>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser(["admin", "manager"]);
  const body = ExecSchema.partial().parse(await req.json());
  if (body.phone) {
    const p = normalizePhone(body.phone);
    if (!p) throw new HttpError(400, "Invalid phone number");
    body.phone = p;
  }
  const store = await getStore();
  const exec = await store.update("executives", id, body);
  await audit(user.email, "executive.update", "executives", id, { fields: Object.keys(body) });
  return json({ executive: exec });
});

/** Executives are deactivated, not deleted, so assignment history stays intact. */
export const DELETE = route<P>(async (_req, { params }) => {
  const { id } = await params;
  const user = await requireUser(["admin"]);
  const store = await getStore();
  const exec = await store.update("executives", id, { active: false, available: false });
  await audit(user.email, "executive.deactivate", "executives", id);
  return json({ executive: exec });
});
