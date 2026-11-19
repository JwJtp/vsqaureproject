import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { shellData } from "@/lib/shell-data";

export const dynamic = "force-dynamic";

/** Admin/manager area. Executives are redirected to their own portal; unauthenticated users to login. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const d = await shellData();
  if (!d.user) redirect("/login");
  if (d.user.role === "executive") redirect("/portal");
  return <Shell user={d.user} mode={d.mode} ai={d.ai} whatsapp={d.whatsapp} executives={d.executives}>{children}</Shell>;
}
