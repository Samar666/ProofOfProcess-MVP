# ProofOfProcess — Demo Runbook (two phones, ~6 minutes)

## One-time prep (on this Mac)

```bash
cd ~/proofofprocess_app/backend
python3 -m uvicorn app:app --port 8013 --host 0.0.0.0   # LAN-reachable
```

```bash
python3 ~/proofofprocess_app/scripts/seed_demo.py        # fresh demo data, prints links
```

Both phones must be on the **same Wi-Fi** as the Mac. Open this URL on each phone
(replace with the Mac's current IP — `ipconfig getifaddr en0`):

```
http://<MAC-IP>:8013/
```

> Hashing works over plain HTTP on the LAN: the app falls back to a pure-JS
> SHA-256 (identical output to Web Crypto) when `crypto.subtle` is unavailable,
> so the chain still verifies server-side. Copy buttons also fall back to a
> legacy clipboard path.

## Seeded demo state

- Student code `English-3B-07`, 4 Schoology assignments (demo sync):
  - "Should school start later?" — **has a receipt** (8 checkpoints, 2 sources,
    AI disclosed, reflection done) with a **teacher note**.
  - "Thesis revision checklist" — **past due, no receipt** (shows as missing).
  - Two upcoming assignments with no receipt.
- The seed script prints the exact Teacher and Parent links — keep them handy.

## The 6-minute flow

**1. Student writes live (Phone A, ~2 min)**
- Open the app → Write tab. Type a few sentences in the draft, hit
  **Save checkpoint** twice with an edit in between (watch the chain chip change).
- Add one source (title + URL + claim). Tick "I used AI" and fill a line.
- Write a one-line reflection, then go to **Receipt → Generate teacher link**.
- Point out: "Saved checkpoint #N" — meaningful moments, not keystrokes.

**2. Teacher reviews (Phone B, ~1 min)**
- Open the seeded teacher link (or the one just generated on Phone A).
- Show: summary bullets, "Chain verified" badge, sources, milestones.
- Click **Yes** on "Was this useful?" — then write a quick note for the parent view.

**3. Parent digest (Phone B, ~1 min)**
- Open the seeded parent link.
- Show: coverage bar (**1 of 4 assignments** have a process receipt), the
  "missing" past-due row, the teacher note, and the "What to ask your child" prompts.

**4. Trust close (~1 min)**
- History → **Verify hash chain** on Phone A.
- Emphasize the non-claims (they're the moat): no AI-detector score, no proof of
  authorship, no keystrokes/screens/web history. The chain proves the record
  wasn't changed *after* recording — nothing more.
- Parent link is read-only, expires in 30 days, and never contains raw drafts.

## If something goes wrong

- **Phone can't reach the app** → same Wi-Fi? Mac firewall? Server bound to
  `0.0.0.0`? Re-check `ipconfig getifaddr en0` — the IP changes between networks.
- **"Add a reflection before exporting" toast** → expected; reflection is required.
- **Old project state on the demo phone** → clear site data for the origin
  (project persists in localStorage by design).
- **Server down** → restart with the command above; data persists in
  `backend/data/pop.db`.
- **Reset demo data** → re-run `scripts/seed_demo.py` (it wipes and rebuilds the
  demo student's rows; use `--keep` to add instead).

## Backup talking points

- Local-first: writing + snapshots + hashing happen in the browser; the server
  only stores what the student explicitly shares (90-day expiry).
- Schoology bridge is opt-in and laptop-only: cookies never leave the laptop;
  the server receives assignment metadata only (`python3 -m bg_agent.sync --demo`
  reproduces the seeded sync).
- Monetization: free teacher tier; schools pay ~$500–$2k/yr; optional parent
  report $4.99/mo. (Full story in `docs/Product-Guide.md`.)
