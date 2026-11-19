import { route, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { queueStats } from "@/lib/queue";
import { getStore } from "@/lib/db";
import { conversationLock, aiMode } from "@/lib/ai/agent";

/** Live agent processing status for the AI Sales Agent screen. */
export const GET = route(async () => {
  await requireUser(["admin", "manager"]);
  const store = await getStore();
  const since = new Date(Date.now() - 30 * 60000).toISOString();
  const [queue, active, processing, usage] = await Promise.all([
    queueStats(),
    store.count("conversations", { where: { status: "active" }, gte: { last_message_at: since } }),
    store.list("conversations", { where: { processing: true } }),
    store.list("usage_logs", { gte: { created_at: new Date(Date.now() - 86400000).toISOString() } }),
  ]);
  const ok = usage.filter((u) => u.ok);
  return json({
    ai: await aiMode(),
    queue,
    activeConversations: active,
    processingNow: processing.map((c) => ({ id: c.id, channel: c.channel })),
    lockedConversations: conversationLock.activeKeys,
    last24h: {
      turns: usage.length,
      errors: usage.filter((u) => !u.ok).length,
      avgLatencyMs: ok.length ? Math.round(ok.reduce((a, u) => a + u.latency_ms, 0) / ok.length) : null,
      tokens: usage.reduce((a, u) => a + u.prompt_tokens + u.completion_tokens, 0),
      costUsd: +usage.reduce((a, u) => a + Number(u.cost_usd), 0).toFixed(4),
    },
  });
});
