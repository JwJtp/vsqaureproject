# V Square Projects — AI Sales Command Center

**Developed by Nexobova HQ** for V Square Projects (Hosur / Bengaluru — plots, villas, apartments).

An AI sales operation that replies to every enquiry (website chat, WhatsApp, Facebook/Instagram, forms, CRMs), understands English, Kannada and mixed "Kanglish", qualifies buyers with an explained score, routes them to the right executive, sends WhatsApp notifications, books site visits, runs follow-ups and shows it all on one dashboard.

> **It runs straight away without any keys** in an explicit **DEMO MODE** (gold banner at the top). Demo data is fictional and lives only in memory. It never mixes with production data.

---

## 1. Quick start (local, 2 minutes)

```bash
npm install
npm run dev
```

Open http://localhost:3000. Choose **Admin** on the sign-in screen, then:

1. Go to **AI Sales Agent** and chat like a customer: `Hi, I want a plot in Hosur` → `30 to 40 lakh` → `30x40` → `own use` → `within 3 months` → `My name is Ravi` → `9845012345` → `Saturday 11 am`.
2. Watch the lead get qualified, matched to a verified project, assigned, notified and booked for a visit.
3. Click **Run 6 simultaneous chats** to see the concurrency + isolation check.
4. Use **View as:** (top bar) to switch to an executive and see their private portal.

## 2. Checks

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint
npm test            # 34 tests incl. the final acceptance test + concurrency test
npm run build       # production build
npm run check       # all of the above
```

`tests/acceptance.test.ts` is the **final acceptance test**. A customer enquires, the AI collects requirements, the lead is stored and qualified, a verified project is matched, an available executive is assigned, a WhatsApp notification is generated (marked *simulated*, never *delivered*), follow-up tasks and a site visit are created, and the dashboard counters update. It also runs **8 customers at once** and checks that no message, name or lead crosses between sessions. Finally it sends duplicate WhatsApp webhooks to confirm each one is processed only once.

---

## 3. Going live — step by step

### Step 1 · Supabase
1. Create a project at supabase.com.
2. In the SQL editor, run these files **in order**:
   `supabase/migrations/0001_init.sql` → `0002_rls.sql` → `0003_defaults.sql`.
3. Authentication → Users → **Add user** (your admin email + password).
4. Edit the email in `supabase/seed_admin.sql` and run it. This makes that user an admin.
5. For each executive: add them in the app (**Executive Management**), create their auth user with the **same email**, then run the commented executive block in `seed_admin.sql`.
6. Copy the Project URL, anon key and service-role key into your environment (see `.env.example`).

### Step 2 · Environment variables
Copy `.env.example` to `.env.local` (local) or add each value in **Vercel → Settings → Environment Variables**.
Generate secrets with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Use this for `ENCRYPTION_KEY`, `CRON_SECRET`, `LEAD_WEBHOOK_SECRET` and `WHATSAPP_VERIFY_TOKEN`.

### Step 3 · OpenAI
Set `OPENAI_API_KEY`. In **AI Agent Settings**, choose the model and set the daily token budget, monthly cost limit and price per million tokens (used for cost *estimates*; check your provider's current prices). If the key is missing, a limit is hit or the API fails, the agent falls back to the safe built-in simulator and logs it.

### Step 4 · WhatsApp Business Cloud API
1. Go to developers.facebook.com → **Create app** → type *Business* → add **WhatsApp**.
2. Add and verify V Square's business number. Copy the **Phone number ID** and **WhatsApp Business Account ID**.
3. Business Settings → **System users** → create one → generate a **permanent token** with `whatsapp_business_messaging` and `whatsapp_business_management`.
4. App → Settings → Basic → copy the **App secret** into `META_APP_SECRET` (used to verify webhook signatures; required in live mode).
5. WhatsApp → Configuration → Webhook:
   - Callback URL: `https://YOUR-DOMAIN/api/webhooks/whatsapp`
   - Verify token: your `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to **messages**.
6. WhatsApp Manager → **Message templates**. Create and get approval for these (names are editable in Admin Settings):

| Template | Used for | Body variables |
|---|---|---|
| `lead_assigned_exec` | New lead → executive | name, phone, requirement, location, budget, priority |
| `enquiry_received` | Confirmation → customer | name, executive name |
| `site_visit_confirmed` | Visit booked | name, date/time, project |
| `site_visit_reminder` | Visit reminder | name, date/time |
| `follow_up_general` | Reminders/escalations | message text |

**Rules the system follows:** free-form replies only within 24 hours of the customer's last message; approved templates otherwise. Opted-out customers (`STOP`) are never messaged. A message shows *delivered/read* only after Meta's status webhook confirms it.

### Step 5 · Facebook Lead Ads & Instagram (optional)
In the same Meta app, add **Webhooks → Page** (subscribe to `leadgen`) and Instagram messaging. Callback URL: `https://YOUR-DOMAIN/api/webhooks/meta`. Request `leads_retrieval`, `pages_manage_metadata` and `instagram_manage_messages` through App Review, then set `META_PAGE_ACCESS_TOKEN`.

### Step 6 · Website
- **Chat widget:** add `<script src="https://YOUR-DOMAIN/widget.js" async></script>` to vsquareprojects.in.
- **Contact form:** `POST https://YOUR-DOMAIN/api/public/enquiry` with JSON `{ name, phone, email, message, property_type?, preferred_location?, budget_text?, consent: true }`. It is rate-limited and has a honeypot field `website`. Add your domain to `ALLOWED_ORIGINS`.
- **CRMs / ad tools (server-to-server):** `POST /api/webhooks/lead` with header `X-Signature: sha256=<HMAC-SHA256(body, LEAD_WEBHOOK_SECRET)>` and optional `Idempotency-Key`.

### Step 7 · Deploy to Vercel
1. Push this folder to GitHub → **Import** in Vercel (framework: Next.js).
2. Add all environment variables, including `NEXT_PUBLIC_APP_URL=https://YOUR-DOMAIN`.
3. Deploy. `vercel.json` registers a cron for `/api/jobs/run` every minute. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set.
   *Per-minute crons need a Vercel Pro plan.* On Hobby, use Supabase `pg_cron` or any external cron (e.g. cron-job.org) to call `GET https://YOUR-DOMAIN/api/jobs/run` with that header every minute.
4. Open **Integrations** and press **Test connection** for OpenAI, WhatsApp and Supabase.

### Step 8 · Real project data
The public website lists plots, villas and apartments but **no project-level prices, inventory or approval numbers**. The system will not invent them. Before launch:
1. Delete the four `DEMO ·` projects (they exist only in demo mode anyway).
2. Add each real project in **Project Management**, with RERA/approval numbers exactly as issued, and tick **verified**.
3. Upload brochures and price sheets in **Knowledge Base** and press **Approve**. Draft documents are never used by the AI.
4. The document *"Website marketing claims — PENDING VERIFICATION"* lists the website's claims (RERA-approved, 11+ years, 250+ plots…) for management to confirm.

---

## 4. How it works

```
Website chat ─┐                       ┌─ per-conversation lock (strict order per customer)
WhatsApp  ────┤→ webhook (verify sig, │
Instagram ────┤  dedupe event id) ──→ jobs table ──→ worker ──→ AI semaphore (N parallel)
FB Lead Ads ──┤                       └─ retries + backoff + timeout + dead-letter
Forms / CRM ──┘→ unified ingestion (validate, dedupe phone/email, consent record)
                    │
   AI turn: extract (EN/KN/Kanglish) → approved-knowledge retrieval (BM25, sources)
            → OpenAI JSON-schema reply  (or simulator) → guardrail blocks unverified
              prices/approvals/promises → score with reasons → match VERIFIED projects
            → qualify → assignment engine → WhatsApp template to executive
            → site-visit booking (slot capacity + no executive double-booking)
            → follow-up tasks (working hours, escalation) → dashboard
```

| Requirement | Where |
|---|---|
| Separate session per customer, never mixed | `conversations` unique on (channel, external_id); every query is scoped by `conversation_id`/`lead_id`; tested in `acceptance.test.ts` |
| Async webhooks, queue, retries, timeouts, backpressure | `src/lib/queue/*`, `jobs` table, `claim_jobs()` (`FOR UPDATE SKIP LOCKED`, one running job per customer) |
| Idempotency / duplicate webhooks | `processed_events` table + `claimEvent()` |
| Configurable concurrency (no "unlimited") | AI Agent Settings → *Concurrency & reliability* |
| Confidence-based escalation, human takeover, pause/resume | `src/lib/ai/agent.ts`, Live Conversations |
| Never fabricate | `src/lib/ai/guard.ts` + only approved/verified knowledge reaches the model |
| Assignment methods | `src/lib/assignment/engine.ts` (project, location, expertise, workload, round-robin, manual) |
| Security | Server-only secrets, Supabase RLS, role checks on every API, HMAC/Meta signature checks, rate limiting, AES-256-GCM, audit logs, CSV-injection protection, data deletion |

### Folder map
```
src/app/(app)/*      15 admin screens        src/app/portal     executive portal
src/app/api/*        all server endpoints    src/app/chat       public chat (widget iframe)
src/lib/ai/*         agent, extractor, scoring, guardrail, OpenAI, simulator
src/lib/queue/*      job queue, locks, semaphore
src/lib/db/*         storage (memory = demo, Supabase = live)
supabase/migrations  schema, indexes, RLS, defaults
tests/*              unit, concurrency, security, acceptance
```

## 5. Limits and notes
- **Demo mode** uses memory that resets when the server restarts. On Vercel each server instance has its own demo data. Use Supabase for anything real.
- The in-app rate limiter and AI semaphore are per server instance. Per-customer ordering and queue claiming are enforced in Postgres, so they hold across instances. For strict global rate limits across regions, put Upstash Redis behind `rateLimit()`.
- Knowledge retrieval is lexical (BM25), which suits brochures and FAQs and needs no extra service. For large document libraries, add pgvector embeddings to `document_chunks`.
- Scanned (image-only) PDFs need OCR before upload.
- WhatsApp templates, Meta App Review and the business-number verification are approvals only V Square can obtain from Meta.

---
© V Square Projects · Built by **Nexobova HQ**
