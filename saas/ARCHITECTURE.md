# SofIA SaaS - Multi-Clinic Architecture

## System Architecture Diagram

```
                            SOFIA SaaS ARCHITECTURE
    ============================================================================

    PATIENTS                   CLINICS DASHBOARD              ADMIN
    (WhatsApp/Web)             (React/Next.js)                (Superadmin)
         |                          |                             |
         v                          v                             v
    +----------+            +---------------+             +-------------+
    | Chatwoot |            |   Supabase    |             |  Supabase   |
    | Widget / |            |   Auth (JWT)  |             |  Admin API  |
    | WhatsApp |            | clinic_id in  |             |             |
    +----+-----+            |    claims     |             +------+------+
         |                  +-------+-------+                    |
         | webhook                  |                            |
         v                          v                            v
    +----+-----+            +-------+--------+           +------+------+
    |          |  resolve   |                |           |             |
    |   n8n    +----------->|   Supabase     |<----------+  Dashboard  |
    | Workflow |  query KB  |   PostgreSQL   |  RLS      |    API      |
    |          +----------->|                |  filtered |             |
    |  (SofIA  |  log       | +-----------+  |           +-------------+
    |   Bot)   +----------->| | clinics   |  |
    |          |  create    | | kb        |  |
    |          +----------->| | appts     |  |
    +----+-----+  appt     | | metrics   |  |
         |                  | | reminders |  |
         |                  | +-----------+  |
         v                  +-------+--------+
    +----+-----+                    |
    |  Google  |                    |
    | Calendar |            +-------+--------+
    | (per     |            |   Supabase     |
    |  clinic) |            |   Edge Funcs   |
    +----------+            | (metrics API)  |
                            +----------------+

    ============================================================================
    DATA FLOW PER CONVERSATION:
    ============================================================================

    1. Patient sends message via Chatwoot
    2. Chatwoot webhook → n8n
    3. n8n: Resolve clinic_id from inbox_id (Supabase)
    4. n8n: Classify intent (OpenAI)
    5. n8n: Route by intent:
       - INFO  → Query KB from Supabase → LLM response → Chatwoot
       - CREATE_EVENT → Google Calendar → Save appointment (Supabase) → Chatwoot
       - PAYMENT/HUMAN → Escalate → Chatwoot
    6. n8n: Log conversation_metric (Supabase)
    7. Scheduled: n8n checks for 24h reminders → Chatwoot

    ============================================================================
    MULTI-TENANT ISOLATION:
    ============================================================================

    +---------+     +----------+     +----------+     +----------+
    | Clinic  |     | Clinic   |     | Clinic   |     | Clinic   |
    |   A     |     |   B      |     |   C      |     |   D      |
    +---------+     +----------+     +----------+     +----------+
         |               |               |               |
         v               v               v               v
    +----+---------------+---------------+---------------+----+
    |                     SHARED INFRA                        |
    |  n8n (single instance, routes by clinic_id)             |
    |  Supabase (single DB, RLS by clinic_id)                 |
    |  Chatwoot (per-inbox isolation)                         |
    |  Google Calendar (per-clinic calendar_id)               |
    +---------------------------------------------------------+

    Every query includes WHERE clinic_id = X.
    RLS enforces this at the database level.
    No cross-clinic data leakage is possible.
```

---

## Security Considerations

### 1. Data Isolation (CRITICAL)

| Layer | Mechanism | Enforced By |
|-------|-----------|-------------|
| Database | Row Level Security (RLS) | PostgreSQL / Supabase |
| API | JWT with `clinic_id` claim | Supabase Auth |
| n8n Backend | `service_role` key (bypasses RLS) | Trusted backend only |
| Dashboard | Authenticated sessions with clinic scope | Supabase Auth |

**Key principle:** n8n uses `service_role` (bypasses RLS) because it's a trusted backend that always includes `clinic_id` in its queries. Dashboard users go through Supabase Auth with RLS enforced.

### 2. Authentication & Authorization

```
Patient Chat:        No auth needed (Chatwoot handles identity)
n8n → Supabase:      service_role key (env var, never exposed)
Dashboard → Supabase: JWT with clinic_id claim (RLS enforced)
Admin → Supabase:    Admin JWT with superadmin role
```

### 3. Secrets Management

| Secret | Where Stored | Who Uses It |
|--------|-------------|-------------|
| SUPABASE_SERVICE_KEY | n8n env vars | n8n only |
| SUPABASE_ANON_KEY | Dashboard frontend | Public (safe) |
| CHATWOOT_API_TOKEN | n8n env vars | n8n only |
| OPENAI_API_KEY | n8n credentials | n8n only |
| Google Calendar OAuth | n8n credentials | n8n only |
| N8N_API_KEY | GitHub Secrets | CI/CD only |

**Rules:**
- `service_role` key NEVER exposed to frontend
- All API keys rotated every 90 days
- Environment variables, never hardcoded in workflow JSON

### 4. Input Validation

- All Supabase functions use parameterized queries (no SQL injection)
- n8n "Validar Input" node sanitizes Chatwoot webhook payload
- UUID validation on clinic_id (prevents ID guessing)
- Rate limiting on Supabase Edge Functions

### 5. Data Privacy

- Patient phone numbers stored encrypted at rest (Supabase default)
- Conversation content NOT stored in Supabase (stays in Chatwoot)
- Metrics are anonymized (no message content, only intent/outcome)
- GDPR-compatible: delete clinic → CASCADE deletes all related data

### 6. Network Security

- All traffic over HTTPS
- Supabase project in South America region (low latency)
- n8n instance behind reverse proxy
- Webhook endpoints validated by Chatwoot signature

---

## Indexing Strategy

### Query Patterns and Their Indexes

| Query Pattern | Table | Index | Type |
|--------------|-------|-------|------|
| Resolve clinic from inbox | clinics | `idx_clinics_subdomain` | B-tree (partial) |
| Fetch KB by clinic + category | knowledge_base | `idx_kb_clinic_category` | B-tree (partial) |
| Fuzzy search questions | knowledge_base | `idx_kb_question_trgm` | GIN (trigram) |
| Keyword array search | knowledge_base | `idx_kb_keywords` | GIN |
| Upcoming appointments | appointments | `idx_appointments_clinic_time` | B-tree (partial) |
| Pending reminders | appointments | `idx_appointments_reminder` | B-tree (partial) |
| Dashboard: metrics by period | conversation_metrics | `idx_metrics_clinic_created` | B-tree |
| Dashboard: intent distribution | conversation_metrics | `idx_metrics_clinic_intent` | B-tree |
| No double-booking | appointments | `no_overlap` (EXCLUDE) | GiST |

### Partial Indexes
We use `WHERE active = true` and `WHERE status IN (...)` to keep indexes small. Most queries only care about active/scheduled records.

### Estimated Sizes (per clinic, 1 year)

| Table | Rows | Index Size |
|-------|------|------------|
| clinics | 1 | negligible |
| knowledge_base | ~50 | < 1 MB |
| appointments | ~3,000 | < 5 MB |
| conversation_metrics | ~15,000 | < 10 MB |
| reminder_log | ~3,000 | < 2 MB |

Total per clinic: ~18 MB. 100 clinics: ~1.8 GB. Well within Supabase free/pro tier.

---

## Scalability Path

### Phase 1: MVP (Current)
- Single n8n instance
- Single Supabase project
- 1-10 clinics
- Shared Google Calendar credentials

### Phase 2: Growth (10-50 clinics)
- n8n queue mode with workers
- Per-clinic Google Calendar OAuth
- Supabase Pro plan
- CDN for dashboard

### Phase 3: Scale (50-500 clinics)
- n8n horizontal scaling with Redis
- Supabase connection pooling (PgBouncer)
- Read replicas for dashboard queries
- Separate databases per region if needed

### Phase 4: Enterprise (500+ clinics)
- Dedicated Supabase instances per region
- n8n Enterprise with multi-instance
- Kubernetes orchestration
- Custom SLA per clinic tier

---

## File Structure

```
saas/
├── supabase/
│   ├── 001_schema.sql           # Tables, types, constraints
│   ├── 002_rls_and_indexes.sql  # RLS policies + indexes
│   ├── 003_functions.sql        # DB functions (metrics, cancel, remind)
│   └── 004_seed.sql             # Initial clinic + knowledge base data
├── api/
│   └── endpoints.sql            # API endpoint documentation
├── n8n/
│   └── modifications.md         # Step-by-step n8n modification guide
└── ARCHITECTURE.md              # This file
```
