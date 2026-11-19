"use client";
import { PageHeader, Field, Toggle } from "@/components/ui";
import { SettingsSection } from "@/components/settings-form";

export default function AiSettings() {
  return (
    <>
      <PageHeader eyebrow="AI" title="AI Agent Settings" subtitle="Personality, instructions, model, token budgets, confidence-based human escalation and concurrency limits." />
      <div className="grid gap-6 xl:grid-cols-2">
        <SettingsSection section="ai" title="Personality & instructions">
          {(v, set) => (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Agent name"><input className="input" value={v.agentName} onChange={(e) => set({ agentName: e.target.value })} /></Field>
                <Field label="Reply language"><select className="input" value={v.replyLanguage} onChange={(e) => set({ replyLanguage: e.target.value as "auto" })}><option value="auto">Auto — mirror the customer</option><option value="en">English</option><option value="kn">Kannada</option></select></Field>
              </div>
              <Field label="Personality"><textarea className="input" rows={3} value={v.personality} onChange={(e) => set({ personality: e.target.value })} /></Field>
              <Field label="System instructions" hint="Hard safety rules (no invented prices/approvals, one question at a time, escalation) are always enforced in addition to these."><textarea className="input" rows={6} value={v.systemInstructions} onChange={(e) => set({ systemInstructions: e.target.value })} /></Field>
            </div>
          )}
        </SettingsSection>
        <SettingsSection section="ai" title="Model, budgets & escalation">
          {(v, set) => (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="OpenAI model" hint="Any chat model that supports JSON schema output"><input className="input" value={v.model} onChange={(e) => set({ model: e.target.value })} /></Field>
              <Field label="Temperature"><input type="number" step="0.1" min={0} max={1.5} className="input" value={v.temperature} onChange={(e) => set({ temperature: +e.target.value })} /></Field>
              <Field label="Max output tokens / reply"><input type="number" className="input" value={v.maxOutputTokens} onChange={(e) => set({ maxOutputTokens: +e.target.value })} /></Field>
              <Field label="History messages sent"><input type="number" className="input" value={v.maxHistoryMessages} onChange={(e) => set({ maxHistoryMessages: +e.target.value })} /></Field>
              <Field label="Daily token budget" hint="Falls back to the safe simulator when exceeded"><input type="number" className="input" value={v.dailyTokenBudget} onChange={(e) => set({ dailyTokenBudget: +e.target.value })} /></Field>
              <Field label="Monthly cost limit (USD)"><input type="number" className="input" value={v.monthlyCostLimitUsd} onChange={(e) => set({ monthlyCostLimitUsd: +e.target.value })} /></Field>
              <Field label="Price per 1M input tokens (USD)" hint="Estimate only — check your provider's pricing"><input type="number" step="0.01" className="input" value={v.priceInputPer1M} onChange={(e) => set({ priceInputPer1M: +e.target.value })} /></Field>
              <Field label="Price per 1M output tokens (USD)"><input type="number" step="0.01" className="input" value={v.priceOutputPer1M} onChange={(e) => set({ priceOutputPer1M: +e.target.value })} /></Field>
              <Field label={`Human escalation below confidence: ${v.confidenceThreshold}`} className="sm:col-span-2"><input type="range" min={0} max={1} step={0.05} className="w-full accent-[#b8913f]" value={v.confidenceThreshold} onChange={(e) => set({ confidenceThreshold: +e.target.value })} /></Field>
              <div className="sm:col-span-2"><Toggle checked={v.forceSimulation} onChange={(x) => set({ forceSimulation: x })} label="Force simulator (ignore OpenAI key) — useful for training & demos" /></div>
            </div>
          )}
        </SettingsSection>
        <SettingsSection section="concurrency" title="Concurrency & reliability" subtitle="Tune to your infrastructure and OpenAI rate limits. There is no unlimited concurrency.">
          {(v, set) => (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Parallel AI conversations" hint="Simultaneous LLM calls per server instance"><input type="number" min={1} className="input" value={v.maxConcurrentConversations} onChange={(e) => set({ maxConcurrentConversations: +e.target.value })} /></Field>
              <Field label="Max queue depth (backpressure)" hint="Beyond this, new work gets HTTP 429"><input type="number" className="input" value={v.maxQueueDepth} onChange={(e) => set({ maxQueueDepth: +e.target.value })} /></Field>
              <Field label="Job timeout (ms)"><input type="number" className="input" value={v.jobTimeoutMs} onChange={(e) => set({ jobTimeoutMs: +e.target.value })} /></Field>
              <Field label="Max retry attempts"><input type="number" min={1} className="input" value={v.maxAttempts} onChange={(e) => set({ maxAttempts: +e.target.value })} /></Field>
              <Field label="Stale lock recovery (ms)"><input type="number" className="input" value={v.staleLockMs} onChange={(e) => set({ staleLockMs: +e.target.value })} /></Field>
            </div>
          )}
        </SettingsSection>
        <SettingsSection section="assignment" title="Qualification & routing">
          {(v, set) => (
            <div className="space-y-3">
              <Field label={`Qualify & auto-assign at score ≥ ${v.qualifyThreshold}`}><input type="range" min={0} max={100} className="w-full accent-[#b8913f]" value={v.qualifyThreshold} onChange={(e) => set({ qualifyThreshold: +e.target.value })} /></Field>
              <Toggle checked={v.enabled} onChange={(x) => set({ enabled: x })} label="Automatic assignment enabled" />
              <p className="muted text-xs">Routing order is configured in Admin Settings → Assignment rules.</p>
            </div>
          )}
        </SettingsSection>
      </div>
    </>
  );
}
