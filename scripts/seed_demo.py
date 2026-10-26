#!/usr/bin/env python3
"""Seed a clean, polished demo dataset for the ProofOfProcess demo.

Resets the demo student (English-3B-07), then creates:
  - 4 demo Schoology assignments (one past due, one upcoming, one done)
  - 1 receipt with 8 chained snapshots, 2 sources, AI disclosure, reflection
  - 1 teacher note attached to that receipt
  - 1 read-only parent digest link

Usage:
    python3 scripts/seed_demo.py [--server http://localhost:8013] [--keep]

--keep skips the reset and adds another receipt instead.
"""
from __future__ import annotations

import argparse
import hashlib
import http.cookiejar
import json
import os
import sqlite3
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = Path(os.environ.get("POP_DB", str(ROOT / "backend" / "data" / "pop.db")))
STUDENT = "English-3B-07"


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def chain(snapshots_text: list[tuple[str, str]]) -> list[dict]:
    """snapshots_text: [(created_at_iso, text)] -> snapshots with valid hashes."""
    prev = "GENESIS"
    out = []
    for seq, (created_at, text) in enumerate(snapshots_text):
        digest = sha256_hex(f"{prev}|{created_at}|{text}")
        out.append({
            "seq": seq,
            "created_at": created_at,
            "trigger": ["manual", "growth", "auto", "source_added", "auto",
                        "structural", "auto", "milestone"][seq] if seq < 8 else "auto",
            "text": text,
            "word_count": len(text.split()),
            "prev_hash": prev,
            "hash": digest,
        })
        prev = digest
    return out


def api(opener: urllib.request.OpenerDirector, method: str, server: str,
        path: str, body: dict | None = None, headers: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(server.rstrip("/") + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    with opener.open(req, timeout=30) as resp:
        return json.loads(resp.read().decode() or "{}")


def reset(student: str) -> None:
    if not DB.exists():
        return
    conn = sqlite3.connect(DB, timeout=10)
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM receipts WHERE code_name IN (?, 'CS-3B-07')", (student,))
        cur.execute("DELETE FROM assignments WHERE student_code=?", (student,))
        cur.execute("DELETE FROM teacher_notes WHERE student_code=?", (student,))
        conn.commit()
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--server", default=os.environ.get("POP_SERVER_URL", "http://localhost:8013"))
    parser.add_argument("--keep", action="store_true", help="do not reset existing demo data")
    args = parser.parse_args()
    server = args.server.rstrip("/")

    if not args.keep:
        reset(STUDENT)

    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    # Teacher sign-in (local dev auth; enabled by POP_DEV_AUTH=1 in backend/.env).
    try:
        api(opener, "POST", server, "/auth/dev")
    except Exception as exc:
        print(f"Dev sign-in failed ({exc}). Is the server running with POP_DEV_AUTH=1?")
        return 1

    # 1. Demo assignments via the sync-token path (same flow as the laptop bridge).
    token = api(opener, "POST", server, "/api/sync-tokens", {"student_code": STUDENT})["token"]
    today = date.today()
    assignments = [
        {"id": "demo-1", "title": "Should school start later?", "course": "English 3B",
         "due_date": (today + timedelta(days=2)).isoformat(), "status": "upcoming", "url": ""},
        {"id": "demo-2", "title": "Source evaluation: sleep research", "course": "English 3B",
         "due_date": (today + timedelta(days=5)).isoformat(), "status": "upcoming", "url": ""},
        {"id": "demo-3", "title": "Counterargument paragraph", "course": "English 3B",
         "due_date": (today + timedelta(days=7)).isoformat(), "status": "upcoming", "url": ""},
        {"id": "demo-4", "title": "Thesis revision checklist", "course": "English 3B",
         "due_date": (today - timedelta(days=2)).isoformat(), "status": "upcoming", "url": ""},
    ]
    api(opener, "POST", server, "/api/lms/schoology/import",
        {"student_code": STUDENT, "assignments": assignments, "source": "demo"},
        headers={"Authorization": f"Bearer {token}"})

    # 2. Receipt with a valid hash chain, linked to demo-1.
    base = datetime.now(timezone.utc) - timedelta(minutes=47)
    at = lambda mins: (base + timedelta(minutes=mins)).isoformat().replace("+00:00", "Z")
    draft1 = "Outline: 1. Thesis - later start helps focus. 2. Sleep science. 3. Counterargument - sports."
    draft2 = draft1 + "\n\nTeenagers are biologically wired to fall asleep later."
    draft3 = draft2 + " The CDC recommends 8-10 hours of sleep, but first period at 7:30 makes that nearly impossible."
    draft4 = draft3 + "\n\nSource 1 (CDC teen sleep) supports this claim directly."
    draft5 = draft4 + "\n\nCritics argue that later start times disrupt after-school sports and bus schedules."
    draft6 = draft5 + " However, districts that shifted start times saw tardiness drop and first-period grades rise."
    draft7 = draft6 + "\n\nRevised thesis: later start times do not just help students feel rested; they measurably reduce tardiness."
    draft8 = draft7 + "\n\nConclusion: the schedule should serve the students, not the other way around."
    snapshots = chain([(at(m), d) for m, d in zip([0, 6, 14, 21, 28, 33, 41, 46],
                                                  [draft1, draft2, draft3, draft4, draft5, draft6, draft7, draft8])])
    payload = {
        "title": "Should school start later?",
        "assignment_prompt": "Persuasive essay: should school start later? Argue your position with at least two sources.",
        "assignment_id": "demo-1",
        "code_name": STUDENT,
        "snapshots": snapshots,
        "milestones": [
            {"type": "outline_created", "kind": "outline", "note": "Outline created", "seq": 0},
            {"type": "source_added", "kind": "source", "note": "Added CDC teen sleep source", "seq": 3},
            {"type": "source_added", "kind": "source", "note": "Added RAND district study", "seq": 5},
            {"type": "claim_revised", "kind": "claim_revised",
             "note": "Thesis narrowed from 'helps focus' to 'reduces tardiness' after RAND study", "seq": 6},
            {"type": "reflection_completed", "kind": "reflection", "note": "Reflection completed", "seq": 7},
        ],
        "sources": [
            {"title": "CDC — Sleep and Health (teen sleep)", "url": "https://www.cdc.gov/sleep/",
             "claim": "Teens need 8-10 hours of sleep per night"},
            {"title": "RAND — Later school start times study", "url": "https://www.rand.org/",
             "claim": "Districts saw tardiness and first-period grades improve"},
        ],
        "ai_disclosure": {
            "used": True,
            "purpose": "Suggested counterarguments (sports, buses)",
            "accepted": "Kept the sports counterargument, rewrote it in my own words",
            "rejected": "Rejected two suggested statistics I could not verify",
        },
        "reflection": "My strongest change was narrowing the thesis from 'helps focus' to 'reduces tardiness' "
                      "after the RAND source gave me something measurable. The AI counterargument helped, "
                      "but I rewrote it because it did not sound like me.",
    }
    receipt = api(opener, "POST", server, "/api/receipts", payload)
    rid = receipt["receipt_id"]

    # 3. Teacher note (appears in the parent digest).
    api(opener, "POST", server, f"/api/receipts/{rid}/notes",
        {"body": "Strong revision after the RAND source — ask them about the thesis change. "
                 "Two unverifiable AI statistics were rejected; good instinct."})

    # 4. Parent digest link.
    digest = api(opener, "POST", server, "/api/digests", {"student_code": STUDENT, "period_days": 30})

    print()
    print("Demo data ready.")
    print(f"  Teacher link : {server}/?view=teacher&id={rid}")
    print(f"  Parent link  : {server}{digest['url']}")
    print(f"  Receipt id   : {rid}")
    print(f"  Coverage     : 1 of 4 assignments have a receipt (1 past due)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
