import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { shellData } from "@/lib/shell-data";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const d = await shellData();
  if (!d.user) redirect("/login");
  return <Shell portal user={d.user} mode={d.mode} ai={d.ai} whatsapp={d.whatsapp} executives={d.executives}>{children}</Shell>;
}
