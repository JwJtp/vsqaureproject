// Core domain types for the V Square AI Sales Command Center.

export const LEAD_STATUSES = [
  "NEW",
  "QUALIFIED",
  "ASSIGNED",
  "CONTACTED",
  "FOLLOW_UP",
  "SITE_VISIT_SCHEDULED",
  "SITE_VISIT_COMPLETED",
  "NEGOTIATION",
  "CONVERTED",
  "LOST",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const PROPERTY_TYPES = ["plot", "villa", "apartment", "investment"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const LEAD_SOURCES = [
  "website_chat",
  "website_form",
  "whatsapp",
  "facebook_lead",
  "instagram",
  "webhook",
  "manual",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export type Role = "admin" | "manager" | "executive";
export type Priority = "hot" | "warm" | "cold";

export interface Lead {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: LeadSource;
  source_detail: string | null;
  status: LeadStatus;
  property_type: PropertyType | null;
  preferred_location: string | null;
  budget_min: number | null; // INR
  budget_max: number | null; // INR
  budget_text: string | null;
  configuration: string | null; // e.g. 30x40 plot, 3 BHK
  purpose: "investment" | "personal" | null;
  timeline: string | null;
  site_visit_preference: string | null;
  language: "en" | "kn" | "mixed" | null;
  score: number;
  score_reasons: string[];
  priority: Priority;
  matched_project_ids: string[];
  assigned_executive_id: string | null;
  consent_whatsapp: boolean;
  opted_out: boolean;
  duplicate_of: string | null;
  deal_value: number | null;
  lost_reason: string | null;
  is_demo: boolean;
  first_response_at: string | null;
  last_interaction_at: string | null;
  qualified_at: string | null;
  assigned_at: string | null;
  contacted_at: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  lead_id: string;
  channel: LeadSource;
  external_id: string; // WhatsApp phone / web session id
  status: "active" | "waiting" | "closed";
  handler: "ai" | "human";
  ai_paused: boolean;
  escalated: boolean;
  escalation_reason: string | null;
  processing: boolean;
  last_customer_message_at: string | null;
  last_message_at: string | null;
  last_asked_field: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export type DeliveryStatus = "received" | "queued" | "sent" | "delivered" | "read" | "failed" | "simulated";

export interface Message {
  id: string;
  conversation_id: string;
  lead_id: string;
  direction: "in" | "out" | "internal";
  sender: "customer" | "ai" | "executive" | "system";
  sender_name: string | null;
  body: string;
  provider_message_id: string | null;
  delivery_status: DeliveryStatus;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface Executive {
  id: string;
  user_id: string | null;
  name: string;
  phone: string;
  email: string;
  project_ids: string[];
  expertise: PropertyType[];
  locations: string[];
  available: boolean;
  active: boolean;
  daily_capacity: number;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  location: string;
  property_type: PropertyType;
  configurations: string | null;
  plot_dimensions: string | null;
  price_range: string | null;
  inventory: string | null;
  amenities: string[];
  specifications: string | null;
  approvals: string | null;
  faqs: { q: string; a: string }[];
  sales_contact: string | null;
  instructions: string | null;
  verified: boolean; // only verified data can be used by the AI
  verified_by: string | null;
  version: number;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Assignment {
  id: string;
  lead_id: string;
  executive_id: string | null;
  previous_executive_id: string | null;
  method: AssignmentMethod;
  reason: string;
  assigned_by: string;
  created_at: string;
}
export type AssignmentMethod =
  | "round_robin"
  | "project"
  | "location"
  | "expertise"
  | "workload"
  | "manual"
  | "unassigned";

export interface Activity {
  id: string;
  lead_id: string | null;
  type: string;
  description: string;
  actor: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface SiteVisit {
  id: string;
  lead_id: string;
  project_id: string | null;
  executive_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: "requested" | "confirmed" | "completed" | "cancelled" | "no_show";
  notes: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface FollowUpRule {
  id: string;
  key: string;
  name: string;
  description: string;
  delay_minutes: number;
  escalate_after_minutes: number | null;
  channel: "whatsapp_customer" | "whatsapp_executive" | "internal";
  template: string;
  respect_working_hours: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FollowUpTask {
  id: string;
  lead_id: string;
  executive_id: string | null;
  rule_key: string;
  title: string;
  due_at: string;
  status: "pending" | "sent" | "done" | "skipped" | "escalated" | "cancelled";
  result: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeDocument {
  id: string;
  project_id: string | null;
  title: string;
  filename: string | null;
  content: string;
  version: number;
  parent_id: string | null; // first version id
  status: "draft" | "approved" | "superseded";
  approved_by: string | null;
  chunk_count: number;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeChunk {
  id: string;
  document_id: string;
  project_id: string | null;
  idx: number;
  text: string;
  created_at: string;
}

export interface Notification {
  id: string;
  lead_id: string | null;
  recipient_type: "executive" | "customer" | "admin";
  recipient: string;
  channel: "whatsapp" | "email" | "in_app";
  template: string | null;
  body: string;
  status: DeliveryStatus;
  provider_message_id: string | null;
  error: string | null;
  simulated: boolean;
  created_at: string;
  updated_at: string;
}

export interface UsageLog {
  id: string;
  conversation_id: string | null;
  provider: "openai" | "simulator";
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  latency_ms: number;
  ok: boolean;
  error: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entity_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface SystemLog {
  id: string;
  level: "info" | "warn" | "error";
  source: string;
  message: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface Job {
  id: string;
  type: string;
  key: string; // ordering key, e.g. conversation id
  payload: Record<string, unknown>;
  status: "queued" | "running" | "done" | "failed" | "dead";
  attempts: number;
  max_attempts: number;
  run_at: string;
  locked_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProcessedEvent {
  id: string; // idempotency key
  source: string;
  created_at: string;
}

export interface Consent {
  id: string;
  lead_id: string;
  channel: string;
  granted: boolean;
  source: string;
  text: string;
  created_at: string;
}

export interface Note {
  id: string;
  lead_id: string;
  author: string;
  body: string;
  created_at: string;
}

export interface IntegrationRecord {
  id: string; // integration key
  config_encrypted: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  last_webhook_at: string | null;
  updated_at: string;
  created_at: string;
}

export interface SettingRow {
  id: string; // setting key
  value: unknown;
  updated_at: string;
  created_at: string;
}

export interface Profile {
  id: string; // auth.users.id
  email: string;
  name: string;
  role: Role;
  executive_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tables {
  leads: Lead;
  conversations: Conversation;
  messages: Message;
  executives: Executive;
  projects: Project;
  assignments: Assignment;
  activities: Activity;
  site_visits: SiteVisit;
  follow_up_rules: FollowUpRule;
  follow_up_tasks: FollowUpTask;
  documents: KnowledgeDocument;
  document_chunks: KnowledgeChunk;
  notifications: Notification;
  usage_logs: UsageLog;
  audit_logs: AuditLog;
  system_logs: SystemLog;
  jobs: Job;
  processed_events: ProcessedEvent;
  consents: Consent;
  notes: Note;
  integrations: IntegrationRecord;
  settings: SettingRow;
  profiles: Profile;
}
export type TableName = keyof Tables;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  executiveId: string | null;
  demo: boolean;
}
