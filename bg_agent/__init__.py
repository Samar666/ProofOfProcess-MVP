"""ProofOfProcess Background Agent (v2.0).
Optional local service that runs on the student's laptop to:
  1. Periodically fetch assigned homework from Schoology/Google Classroom (read-only).
  2. Assemble BGReport from ProofOfProcess snapshots + LMS data.
  3. Trigger report generation (POST /api/reports/generate).
Config is stored in ./bg_agent/config.yaml (opt-in only).
Usage: python -m bg_agent.scheduler
"""
from __future__ import annotations

import json
import os
import sys
import time
import threading
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Add backend to path so we can import app helpers
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
from app import cfg, BG_TASKS, BG_REPORTS, now_utc, iso  # type: ignore

BG_DIR = Path(__file__).parent
CONFIG_PATH = BG_DIR / "config.yaml"
REPORTS_DIR = BG_DIR / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

# ─── Config ────────────────────────────────────────────────────
def load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            import yaml  # type: ignore
            return yaml.safe_load(CONTEXT_PATH.read_text()) or {}
        except Exception:
            return {}
    return {}


def save_config(cfg: dict):
    import yaml  # type: ignore
    cfg["opt_in_timestamp"] = iso(__import__("datetime").datetime.now(timezone.utc))
    CONFIG_PATH.write_text(yaml.dump(cfg, sort_keys=False))


def ensure_config():
    default = {
        "student_code": "",
        "parent_email": "",
        "cadence": "weekly",
        "lms_schoology_connected": False,
        "lms_classroom_connected": False,
        "opt_in_timestamp": iso(__import__("datetime").datetime.now(timezone.utc)),
    }
    cfg_now = load_config()
    for k, v in default.items():
        cfg_now.setdefault(k, v)
    save_config(cfg_now)
    return cfg_now


# ─── LMS fetchers (read-only, placeholders for v1) ──────────────
def fetch_schoology_assignments(student_code: str) -> list:
    """Placeholder: in v1 returns static sample assignments.
    Real impl: Schoology OAuth → GET /api/v1/users/me/courses → list assignments."""
    import json as _json
    return [
        {
            "id": f"school-{i}",
            "title": f"Math HW {i}: Pythagoras",
            "due_date": (datetime.now() + timedelta(days=i+1)).strftime("%Y-%m-%d"),
            "status": ["not_started", "in_progress", "submitted", "late"][i % 4],
        }
        for i in range(5)
    ]


def fetch_google_classroom_assignments(student_code: str) -> list:
    """Placeholder: in v1 returns static sample assignments.
    Real impl: Google OAuth classroom.readonly scope → list coursework."""
    import json as _json
    return [
        {
            "id": f"classroom-{i}",
            "title": f"History reading {i}: Chapter 4",
            "due_date": (datetime.now() + timedelta(days=i+2)).strftime("%Y-%m-%d"),
            "status": ["not_started", "in_progress", "submitted", "late"][i % 4],
        }
        for i in range(4)
    ]


# ─── Report generator ───────────────────────────────────────────
def build_report(student_code: str, period_days: int = 7) -> dict:
    """Assemble a BGReport from local receipts + LMS fetched data."""
    # Collect student snapshots
    student_snaps = [r for r in __import__("sys").modules['app'].receipts.values()
                     if r.get("code_name") == student_code]

    # Fetch LMS data
    schoology_assignments = fetch_schoology_assignments(student_code)
    classroom_assignments = fetch_google_classroom_assignments(student_code)

    # Compute simple metrics
    structural = sum(
        1 for r in student_snaps
        for m in (r.get("milestones") or [])
        if m.get("kind") in ("structural", "paragraph_reorganized", "claim_revised")
    )
    ai_used = any(r.get("ai_disclosure", {}).get("used") for r in student_snaps)
    reflection_ok = any(r.get("reflection", "").strip() for r in student_snaps)

    # Early alarms (simple thresholds)
    alarms: list = []
    if len(student_snaps) < 3:
        alarms.append("few_snapshots")
    if not reflection_ok:
        alarms.append("missing_reflection")
    if ai_used and not any(r.get("ai_disclosure", {}).get("accepted") for r in student_snaps):
        alarms.append("ai_used_no_accept")

    # Per-subject summary (placeholder — from LMS)
    subjects = {
        "math": {
            "assignments_last_7d": len([a for a in schoology_assignments if a["due_date"]]
                                     and (datetime.now()).date().isoformat()
                                     <= a["due_date"] <= (datetime.now() + timedelta(days=7)).date().isoformat()),
            "on_time_rate": 0.67,
            "average_session_minutes": 22,
        },
        "history": {
            "assignments_last_7d": len([a for a in classroom_assignments if a["due_date"]]
                                      and (datetime.now()).date().isoformat()
                                      <= a["due_date"] <= (datetime.now() + timedelta(days=7)).date().isoformat()),
            "on_time_rate": 1.0,
            "average_session_minutes": 18,
        },
    }

    report = {
        "id": __import__("uuid").uuid4().hex[:8],
        "student_code": student_code,
        "period_start": iso(datetime.now() - timedelta(days=period_days)),
        "period_end": iso(datetime.now()),
        "snapshots_analyzed": len(student_snaps),
        "structural_changes": structural,
        "ai_disclosure": ai_used,
        "reflection_completed": reflection_ok,
        "early_alarms": alarms,
        "generated_at": iso(__import__("datetime").datetime.now(timezone.utc)),
        "subjects": subjects,
    }
    return report


# ─── Scheduler ──────────────────────────────────────────────────
def scheduler_loop(cadence: str = "weekly"):
    """Run forever in a daemon thread.
    cadence: daily | weekday-only | weekly
    Sleeps between runs; each run fetches LMS + builds report → POSTs to backend.
    """
    import requests  # type: ignore  # noqa: F811  needed for Schoology/Classroom POSTs if real

    cadence_map = {
        "daily": 24 * 3600,
        "weekday-only": (5 * 24 * 3600) / 7,  # roughly
        "weekly": 7 * 24 * 3600,
    }
    interval = cadence_map.get(cadence, 7 * 24 * 3600)

    while True:
        try:
            start = datetime.now(timezone.utc)
            # 1. Ensure config
            student_code = cfg.get("student_code", "")
            parent_email = cfg.get("parent_email", "")

            if not student_code or not parent_email:
                # Nothing to do until configured
                elapsed = (datetime.now(timezone.utc) - start).total_seconds()
                time.sleep(max(0, interval - elapsed))
                continue

            # 2. Fetch LMS assignments
            schoology_a = fetch_schoology_assignments(student_code)
            classroom_a = fetch_google_classroom_assignments(student_code)

            # 3. Build report
            report = build_report(student_code, period_days=7)

            # 4. Attempt to send report email (placeholder — in production would use SES/SMTP)
            #    For v1 we just write to reports/ dir and print summary
            report_path = REPORTS_DIR / f"report_{report['id']}.json"
            report_path.write_text(json.dumps(report, indent=2, default=str))

            # 5. Notify parent (placeholder — email not sent in v1)
            #    Real: SES send_email(parent_email, "ProofOfProcess Weekly Summary", report_text)
            print(f"[bg-agent] Report generated for {student_code}: alarms={report['early_alarms']}")

            # 6. Update config last_report timestamp
            cfg["last_report"] = iso(datetime.now(timezone.utc))
            save_config(cfg)

            # Sleep until next interval
            elapsed = (datetime.now(timezone.utc) - start).total_seconds()
            time.sleep(max(0, interval - elapsed))

        except Exception as e:
            print(f"[bg-agent] scheduler error: {e}")
            time.sleep(60)  # backoff


# ─── CLI entry point ───────────────────────────────────────────
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="ProofOfProcess Background Agent")
    parser.add_argument("--cadence", choices=["daily", "weekday-only", "weekly"], default="weekly")
    args = parser.parse_args()
    cfg_now = ensure_config()
    thread = threading.Thread(target=scheduler_loop, args=(args.cadence,), daemon=True)
    thread.start()
    print(f"[bg-agent] Started with cadence={args.cadence}")
    print(f"[bg-agent] Config: {cfg_now}")
    # Keep main thread alive
    try:
        while thread.is_alive():
            thread.join(1)
    except KeyboardInterrupt:
        print("[bg-agent] Stopped")