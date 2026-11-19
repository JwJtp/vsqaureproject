import "server-only";
// Registers all background job handlers. Import this from any route that runs the worker.
import "@/lib/ai/agent";
import { registerJobHandler } from "@/lib/queue";
import { runDueFollowUps } from "@/lib/followups";

registerJobHandler("followups_tick", async () => {
  await runDueFollowUps();
});

export {};
