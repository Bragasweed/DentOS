# HuDent AI — PRD & Status

_Last updated: 2026-02-20_

## Problem statement (original, verbatim summary)
SaaS mobile-first, PWA-ready, italiano, per studi dentistici. Un "sistema operativo" che:
- recupera preventivi non accettati
- riduce i no-show
- monitora pagamenti e rate
- dà alla segreteria una dashboard operativa con priorità del giorno

## Architecture
- **Backend**: FastAPI + Motor (MongoDB). All routes under `/api`. JWT (HS256) auth with Bearer-token precedence over cookie fallback. Multi-tenant via `studio_id` scoping on every query. Brute-force protection: 5 failed logins per `(ip,email)` → 15 min lockout (429).
- **Frontend**: React + Tailwind + shadcn/ui. Manrope (heading) + IBM Plex Sans (body). Italian UI. Token in `localStorage['df_access_token']`. Axios interceptor adds `Authorization: Bearer`.
- **DB collections**: `users`, `studios`, `patients`, `appointments`, `estimates`, `payments`, `installments`, `call_logs`, `tasks`, `login_attempts`.

## User personas
- Titolare studio (admin_studio) — dashboard, team, tutto
- Segreteria — operativa quotidiana (richiami, appuntamenti, pagamenti)
- Dentista — agenda e storico clinico paziente
- Amministrazione — pagamenti, rate, crediti

## Roles & permissions
- `admin_studio`: tutto incluso invito membri e delete paziente
- `segreteria`, `dentista`, `amministrazione`: read+write sui propri moduli; no invito team

## Implemented (MVP — 2026-02-20 · Phase 2 — 2026-02-22 · Phase 3 — 2026-02-23)
### Backend (43/43 tests ✅)
- Auth + brute-force, Pazienti, Preventivi, Appuntamenti, Pagamenti, Call logs, Tasks, Dashboard, Search (Phase 1)
- Follow-up Center: queue with score, send reminder, A/B stats, conversion tracking (Phase 2)
- **Phase 3 · Revenue Recovery Automation**:
  - `GET /api/revenue/overview?date_from&date_to&staff_member&template&channel` — full analytics: KPIs (recovered count/revenue, sent_reminders, reply/appt/acceptance rates, best_template, best_contact_delay, best_contact_time_range, top_staff), funnel, weekly_recovered (8 weeks), templates_performance, top_open_estimates (10), lost_by_reason, month_compare
  - `GET /api/revenue/radar` — at-risk estimates with `lost_risk_score` (0-100), `recovery_probability` (8-100%), `suggested_template`, `suggested_action` (call_now / send_wa_a / send_wa_b / send_email / offer_financing / archive_or_manual)
  - `GET /api/revenue/radar/report` — Monday email payload (title, summary, total_at_risk, recoverable_estimate, top 5, CTA)
  - `automation_rules` collection + CRUD (`/api/automations/rules`)
  - `automation_runs` collection + GET (`/api/automations/runs?status=`)
  - `POST /api/automations/simulate` — runs `scheduler_tick()` on demand
  - `scheduler_tick()` engine — for each active rule + open estimate, creates a `run` (scheduled or executed). Executed runs auto-create reminders (with template substitution) or tasks
  - Seed: 5 default rules (Day 3/7/14/21/30 — wa_a, wa_b, task, email, task), ~25 executed runs, 2 failed, ~3 scheduled. Rejection reasons populated for `lost_by_reason` chart.

### Frontend (E2E 100% ✅ all phases)
- All Phase 1 + 2 modules unchanged
- **Phase 3**:
  - `/revenue` — RevenueDashboard.jsx: hero with recuperati €/MoM delta, 8 KPI cards, 5 filters (date_from, date_to, staff, template, channel) + reset, recharts BarChart (weekly), conversion funnel, templates performance, top-10 open, lost-by-reason, MoM compare
  - `/revenue/radar` — RevenueRadar.jsx: red hero with at-risk + recoverable, Monday email preview card, top 5 prominent + rest, score badge + recovery% + suggested action pill
  - `/automations` — Automations.jsx: 5 sequenze attive hero, "Simula scheduler" + "Nuova regola" CTAs, 4 tabs (Regole/In arrivo/Eseguiti/Falliti), inline Attiva toggle + delete, RuleForm dialog with channel-aware template selector
- Sidebar: added Revenue, Revenue Radar, Automazioni links
- BottomNav: added Revenue (replaced Preventivi to keep 5 items; Preventivi accessible via sidebar/dashboard)
### Backend (33/33 tests ✅)
- Auth: register (crea studio+owner), login, logout (idempotente), /me, invite team
- Brute-force: lockout per (IP+email), reset al primo successo
- Pazienti: CRUD + search + filter + detail bundle
- Preventivi: CRUD + follow-up today + summary per stato
- Appuntamenti: CRUD + range filter + no-show auto-flag su paziente
- Pagamenti: CRUD + installments auto-generate (mensili) + toggle rata pagata + overdue
- Call logs, Tasks CRUD
- Dashboard aggregata (KPI + today's lists)
- Global search (pazienti)
- **Phase 2 · Follow-up Center**:
  - `/api/followup-center/templates` — 2 WA + email + manual
  - `/api/followup-center/queue` — prioritized list with conversion score 0-100 + recommended_action (call_now, send_wa_a, send_wa_b, send_email, archive_or_manual)
  - `/api/reminders` (POST/GET) + `/api/reminders/{id}/status` (PUT) — create + conversion tracking (sent, delivered, read, replied, appt_booked, accepted, rejected, no_response). Accepted/rejected auto-syncs to linked estimate status.
  - `/api/followup-center/ab-stats` — bucketed A/B comparison with reply/booking/acceptance rates + avg_hours_to_conversion + winner determination (min 5 sent each)
- Seed demo: 20 pazienti, 22 preventivi, 40 appuntamenti, 8 piani pagamento, 4 task, **30 reminders (A=12, B=10, Email=8) con outcome mixati per A/B dashboard**

### Frontend (E2E 100% Phase 2 ✅)
- Login + Register wizard (2 step onboarding studio)
- Layout con Sidebar desktop + BottomNav mobile + TopBar con global search
- Dashboard (banner "cose da fare oggi", 4 KPI card, 4 panel operativi, CTA verso Centro recupero)
- Pazienti list con filtri chip + search
- Patient detail con tab Timeline/Preventivi/Appuntamenti/Pagamenti + log chiamata + edit
- Preventivi list con summary card + filter + dialog crea/modifica + follow-up
- Appuntamenti con toggle Today/Week/List + date nav + status select inline
- Pagamenti con overdue banner rosso + progress bar piano + toggle rata pagata
- Impostazioni con profilo studio + team + invito collaboratore
- **Phase 2 · Follow-up Center `/recupero`**:
  - Tab "Priorità di oggi" — queue ordinata per score, con badge numerico, recommended_action pill colorato, CTA Chiama + Invia reminder
  - Send reminder dialog con 4 template selezionabili, variable substitution (nome paziente / studio / importo), messaggio editabile
  - "Ultimi reminder inviati" feed con inline status update
  - Tab "A/B testing messaggi" — winner banner + 3 template card con metriche + barre di confronto per reply/booking/acceptance rate
- Sonner toasts, empty states, loading states, `data-testid` ovunque

## Auth model (explained simply)
1. Frontend POSTs `{email,password}` to `/api/auth/login`
2. Backend returns `{user, access_token}` and ALSO sets an http-only cookie (fallback for non-SPA clients)
3. Frontend stores `access_token` in localStorage as `df_access_token`
4. Every subsequent request has `Authorization: Bearer <token>` via axios interceptor
5. `get_current_user` **reads Bearer header first, cookie only if no Bearer present** — so the SPA auth is entirely Bearer-based and never depends on cookies
6. Logout does not require auth (idempotent); frontend deletes localStorage token and calls `/api/auth/logout` to clear the fallback cookie
7. 5 failed logins per (ip,email) trigger a 15-min lockout; a successful login resets the counter

## Open issues / deferred
- P2 — Testid naming aliases requested by external testing review (e.g., `patients-filter-*` vs `filter-*`). Functionality intact; cosmetic.
- P2 — Per-item `data-testid` on each search dropdown row (currently only the container has one).
- P2 — List endpoints (`/patients`, `/estimates`, `/appointments`, `/payments`) do N+1 lookups. Fine under 5k rows; optimize with `$lookup` at scale.
- P2 — No WhatsApp/email/SMS outbound yet (Phase 2).
- P2 — No AI insights yet (Phase 2).

## Phase 2 proposal (not implemented)
1. **Automazioni richiami**: scheduled reminders via WhatsApp Business API / Twilio + Resend email. Template di sollecito preventivi, conferma appuntamenti, sollecito rata scaduta.
2. **AI insights**: claude/gpt summarizer on patient timeline, suggerimento "prossimo step commerciale", priorità automatica task giornalieri.
3. **Calendar improvements**: drag-to-reschedule, conflict detection, recurring visits.
4. **Export PDF preventivi** + firma digitale cliente.
5. **Auto-seed PWA manifest** + service worker offline.

## Credentials
See `/app/memory/test_credentials.md`

## Test status (as of 2026-02-20)
- Backend: **25/25 pytest PASS** (`/app/backend/tests/test_dentalflow_api.py`)
- Frontend E2E: **~45/47 checks PASS**, zero critical bugs (iteration_3 report)
- Go/No-go: **GO for Phase 2 demo** ✅
