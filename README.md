# ProofOfProcess — MVP (local-first)

Evidence of process, not proof of authorship.

## Run

```bash
cd ~/proofofprocess_app/backend
cp .env.example .env          # first run: enables local dev sign-in
pip install -r requirements.txt
python3 -m uvicorn app:app --port 8013 --reload
# Frontend PWA at http://localhost:8013/
# Docs at http://localhost:8013/docs
```

Health: `GET /api/health`

## Demo (2 phones)

1. Phone A (student): write 500+ words, add 2 sources, disclose AI, add reflection → Save checkpoint → Receipt → Generate → copy teacher link.
2. Phone B (teacher): open `/?view=teacher&id=XXXX` → read the summary → expand diff → Yes/No feedback → add a note for the parent view.
3. Generate a parent link, then show **coverage**, **what to ask**, and the **teacher note** on the Parent view.
4. Show `How this was calculated` + Verify hash chain.

## Product guide

Plain-English guide (students, teachers, parents, impact, monetization): [`docs/Product-Guide.md`](docs/Product-Guide.md)

## UI

Five simple views:

- **Write** — editor, checkpoints, sources, AI disclosure, reflection, and an optional Schoology assignment picker.
- **Receipt** — summary, hash verification, teacher/parent links.
- **Teacher** — open a receipt, review feedback, and leave a note that appears in the parent digest.
- **Parent** — read-only tokenised digest with process coverage, assignment status, "what to ask" prompts, and teacher notes.
- **Settings** — student code, digest cadence, Schoology MCP test, and per-student sync tokens.

## Teacher sign-in (Google, localhost)

Teachers sign in with Google. Students join with a class code and do not need an account. Parents only use a private link.

**Try it locally now:** `POP_DEV_AUTH=1` (already in the sample `.env`) shows a **Local dev sign-in** button on Settings. No Google setup needed for development.

**Real Google login (free, ~5 minutes):**
1. Open <https://console.cloud.google.com/apis/credentials> and create a project.
2. Configure the OAuth consent screen (External, Testing) and add your Google account as a test user.
3. Create credentials → OAuth client ID → **Web application**.
4. Add an authorized redirect URI: `http://localhost:8013/auth/google/callback`.
5. Put the client ID and secret in `backend/.env`:
   ```bash
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=http://localhost:8013/auth/google/callback
   ```
6. Restart the server. Settings now shows **Sign in with Google**.

Sessions are random tokens stored as SHA-256 hashes in SQLite and sent as an HttpOnly, SameSite=Lax cookie (30 days). Google access tokens are never stored. `POP_DEV_AUTH` must be unset in production.

**Protected today:** settings, sync tokens, Schoology MCP test, and teacher notes. Receipt creation stays open for students, and parent links stay read-only. Class-level data scoping (each teacher sees only their classes) is the next auth step.

## API

- `POST /api/receipts` {title, assignment_prompt, assignment_id?, code_name, snapshots[], milestones[], sources[], ai_disclosure{}, reflection}
- `GET /api/receipts/{id}`
- `POST /api/receipts/{id}/feedback` {useful, time_spent_sec}
- `POST/GET /api/receipts/{id}/notes` (teacher only; note body appears in the parent digest)
- `GET /api/feedback`
- `POST /api/digests` {student_code, period_days} → tokenised read-only parent link
- `GET /api/digests/{token}` → live rebuild with coverage, assignments, notes, and prompts
- `GET /api/assignments?code=STUDENT_CODE`
- `POST /api/sync-tokens` {student_code} → one-time bridge token (teacher only)
- `GET /api/sync-tokens?code=STUDENT_CODE`, `DELETE /api/sync-tokens/{id}`
- `POST /api/lms/schoology/import` (bearer sync token) {student_code, assignments[], source}
- `POST /api/lms/schoology/test` {base_url, mcp_dir} (teacher only; local MCP check)
- `GET/POST /api/config`
- `GET /api/me` → sign-in state + enabled providers
- `GET /auth/google/start`, `GET /auth/google/callback`, `POST /auth/logout`
- `POST /auth/dev` (local only, requires `POP_DEV_AUTH=1`)

Hash: `SHA-256(prev_hash|created_at|text)`, genesis `GENESIS`. Backend re-verifies on POST.

## Persistence

Receipts, feedback, parent digests, settings, assignments, sync tokens, and teacher notes are stored in SQLite at `backend/data/pop.db` (override with `POP_DB=/path/to/file.db`). Parent digest tokens and sync tokens are stored only as SHA-256 hashes; raw tokens are shown once. Receipts expire after 90 days and parent links after 30. Synced assignment metadata is kept until replaced by a newer sync. The seed receipt is loaded only when the database has no receipts.

## Tests

```bash
cd backend
python3 -m unittest discover -s tests -v
```

Covers hash-chain verification, receipt/feedback round-trips, digest privacy (no raw draft text), token hashing at rest, expiry, assignment coverage, parent/teacher note visibility, sync-token auth/revocation, and Schoology due-date/ID normalization.

## Schoology via MCP (optional, laptop-only)

The third-party [`schoology-mcp`](https://github.com/coimf/schoology-mcp) server reads the student's Schoology session from Chrome. Because of that:

- It runs on the **student's laptop**, not on a hosted server.
- The laptop bridge posts only assignment metadata (title, course, due date, status, URL) to the app.
- Schoology cookies never leave the laptop.

### One-time setup (student laptop)

```bash
git clone https://github.com/coimf/schoology-mcp ~/schoology-mcp
cd ~/proofofprocess_app
pip install -r backend/requirements.txt -r backend/requirements-mcp.txt
# Sign in to https://<your-district>.schoology.com in Chrome.
```

`mcp` is pinned below 2.0 because `schoology-mcp` still uses the v1 `FastMCP` API. These packages are only needed on the laptop, not on the hosted server. On macOS, Chrome cookie decryption may ask for Keychain access the first time.

### Connect to the app

1. Sign in as a teacher and open **Settings → Student sync tokens**.
2. Enter the student code and choose **Create token**.
3. Copy the one-time token and run the bridge from the repo root:

```bash
python3 -m bg_agent.sync \
  --server http://localhost:8013 \
  --token <token> \
  --student-code <student-code> \
  --base <district-subdomain>
```

`--base` accepts `dtuhsd`, `dtuhsd.schoology.com`, or a full URL. It can also be set with `SCHOOLOGY_BASE_URL`. The MCP checkout defaults to `~/schoology-mcp`; override with `SCHOOLOGY_MCP_DIR` or `--dir`.

Useful checks:

```bash
python3 -m bg_agent.sync --demo --dry-run
python3 -m bg_agent.sync --demo --server http://localhost:8013 --token <token> \
  --student-code <student-code>
```

The demo path needs no Schoology login. A hosted deployment should use HTTPS and the per-student token; never ship `POP_SYNC_TOKEN` (a localhost-only shared-token fallback).

### What upstream MCP provides

The current upstream server exposes enrolled courses and upcoming assignments only. It does **not** provide assignment IDs, URLs, submission status, or grades. The bridge derives a stable ID from title + course so receipts keep matching across syncs; parent-facing **process status** (complete / in progress / not started / missing) is computed from local receipts, not Schoology.

For automatic, school-wide syncing on a hosted service, use the district's official Schoology API. The laptop bridge is the no-credentials option for individual students.

## Safety

Local-first by default. The server stores only explicitly shared receipts (90-day expiry). No real names — use codes. Never claims human authorship. No AI detector. Parent links are read-only and expiring; they contain counts, assignment coverage, process status, teacher notes, and prompts — not raw drafts or grades.
