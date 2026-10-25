# ProofOfProcess — MVP (local-first)

Evidence of process, not proof of authorship.

## Run

```bash
cd ~/proofofprocess_app/backend
pip install -r requirements.txt
PYTHONPATH=/tmp/shelter_deps python3 -m uvicorn app:app --port 8013 --reload
# Frontend PWA at http://localhost:8013/
# Docs at http://localhost:8013/docs
```

Health: `GET /api/health`

## Demo (2 phones)

1. Phone A (student): write 500+ words, add 2 sources, disclose AI, add reflection → Snapshot now → Receipt → Generate → copy teacher link.
2. Phone B (teacher): open `/?view=receipt&id=XXXX` → read 1-min summary → expand diff → Yes/No feedback.
3. Show `How this was calculated` + Verify hash chain.

## API

- `POST /api/receipts` {title, assignment_prompt, code_name, snapshots[], milestones[], sources[], ai_disclosure{}, reflection}
- `GET /api/receipts/{id}`
- `POST /api/receipts/{id}/feedback` {useful, time_spent_sec}
- `GET /api/feedback`

Hash: `SHA-256(prev_hash|created_at|text)`, genesis `GENESIS`. Backend re-verifies on POST.

## Safety

Local-first. Server stores only explicitly shared receipts (90-day expiry concept). No real names — use codes. Never claims human authorship. No AI detector.
