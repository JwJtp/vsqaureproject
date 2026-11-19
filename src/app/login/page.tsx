import { dataMode, env } from "@/lib/env";
import { getStore } from "@/lib/db";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const mode = dataMode();
  const execs = mode === "demo" ? (await (await getStore()).list("executives", { where: { active: true }, order: { column: "name" } })).map((e) => ({ id: e.id, name: e.name })) : [];
  return <LoginForm mode={mode} executives={execs} supabaseUrl={env.SUPABASE_URL ?? ""} anonKey={env.SUPABASE_ANON_KEY ?? ""} />;
}
