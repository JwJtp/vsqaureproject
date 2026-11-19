"use client";
import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LeadProfile } from "@/components/lead-profile";

export default function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <>
      <Link href="/leads" className="btn-ghost btn-sm mb-4"><ArrowLeft className="h-3.5 w-3.5" /> All leads</Link>
      <LeadProfile id={id} admin />
    </>
  );
}
