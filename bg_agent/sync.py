"""Sync Schoology assignment metadata to a ByMe server.

Run this on the student's laptop while they are signed in to Schoology in
Chrome. The MCP server reads the local browser session; the app server only
receives assignment metadata through a per-student sync token.

Examples:
    POP_SERVER_URL=http://localhost:8013 \
    POP_SYNC_TOKEN=<token> \
    SCHOOLOGY_BASE_URL=dtuhsd \
    python3 -m bg_agent.sync

    python3 -m bg_agent.sync --demo --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any
from urllib import error, request

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _demo_assignments() -> list[dict[str, Any]]:
    today = date.today()
    rows = [
        ("Should school start later?", "English 3B", 2, "upcoming"),
        ("Source evaluation: sleep research", "English 3B", 4, "upcoming"),
        ("Counterargument paragraph", "English 3B", 7, "upcoming"),
        ("Thesis revision", "English 3B", -2, "upcoming"),
    ]
    return [
        {
            "id": f"demo-{i}",
            "title": title,
            "course": course,
            "due_date": (today + timedelta(days=offset)).isoformat(),
            "status": status,
            "url": "",
        }
        for i, (title, course, offset, status) in enumerate(rows, start=1)
    ]


def _load_file(path: str) -> list[dict[str, Any]]:
    data = json.loads(Path(path).expanduser().read_text())
    if isinstance(data, dict):
        data = data.get("assignments", [])
    if not isinstance(data, list):
        raise RuntimeError("assignment file must contain a list or an 'assignments' list")
    return [row for row in data if isinstance(row, dict)]


def _fetch(args: argparse.Namespace) -> tuple[list[dict[str, Any]], str]:
    if args.demo:
        return _demo_assignments(), "demo"
    if args.file:
        return _load_file(args.file), "schoology"
    if not args.base:
        raise RuntimeError("SCHOOLOGY_BASE_URL (--base) is required for a live sync")
    from bg_agent.mcp_schoology import get_assignments

    rows = get_assignments(args.base, args.dir)
    return rows, "schoology"


def _post(
    server: str,
    token: str,
    student_code: str,
    assignments: list[dict[str, Any]],
    source: str,
) -> dict[str, Any]:
    body: dict[str, Any] = {"assignments": assignments, "source": source}
    if student_code:
        body["student_code"] = student_code
    payload = json.dumps(body, separators=(",", ":")).encode("utf-8")
    req = request.Request(
        server.rstrip("/") + "/api/lms/schoology/import",
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": "proof-of-process-bridge/0.3",
        },
    )
    try:
        with request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8") or "{}")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"server returned {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"could not reach {server}: {exc.reason}") from exc


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Sync Schoology assignments from this laptop to ByMe."
    )
    parser.add_argument("--server", default=os.environ.get("POP_SERVER_URL", "http://127.0.0.1:8013"))
    parser.add_argument("--token", default=os.environ.get("POP_SYNC_TOKEN", ""))
    parser.add_argument("--student-code", default=os.environ.get("POP_STUDENT_CODE", ""))
    parser.add_argument("--base", default=os.environ.get("SCHOOLOGY_BASE_URL", ""))
    parser.add_argument("--dir", default=os.environ.get("SCHOOLOGY_MCP_DIR", ""))
    parser.add_argument("--file", default="", help="read assignments from a JSON file instead of MCP")
    parser.add_argument("--demo", action="store_true", help="send clearly labelled demo assignments")
    parser.add_argument("--dry-run", action="store_true", help="print the payload without posting")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    token = (args.token or "").strip()
    if not token and not args.dry_run:
        print("Missing sync token. Set POP_SYNC_TOKEN or pass --token.", file=sys.stderr)
        return 2
    try:
        assignments, source = _fetch(args)
    except Exception as exc:  # noqa: BLE001 - CLI reports the full reason
        print(f"Could not read Schoology assignments: {exc}", file=sys.stderr)
        return 1
    if not assignments:
        print("No upcoming assignments returned; nothing to sync.", file=sys.stderr)
        return 0
    if args.dry_run:
        print(json.dumps({"source": source, "assignments": assignments}, indent=2))
        return 0
    try:
        result = _post(args.server, token, args.student_code.strip(), assignments, source)
    except Exception as exc:  # noqa: BLE001
        print(f"Sync failed: {exc}", file=sys.stderr)
        return 1
    print(
        f"Synced {result.get('written', 0)} assignment(s) for "
        f"{result.get('student_code') or args.student_code or 'student'} "
        f"from {result.get('source', source)} at {result.get('synced_at', '')}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
