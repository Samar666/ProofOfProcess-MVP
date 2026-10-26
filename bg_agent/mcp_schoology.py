"""Optional Schoology MCP client for the ByMe background agent.

This talks to the third-party `schoology-mcp` server over stdio:
    https://github.com/coimf/schoology-mcp

Important constraints of that server:
  * It is cookie-based: it reads Schoology session cookies from the local
    Chrome profile via browser_cookie3.
  * Therefore it MUST run on the student's own laptop, while they are signed
    in to Schoology in Chrome. It is not usable from a hosted server.
  * It exposes two tools: get_enrolled_courses, get_upcoming_assignments.

Everything here is optional and degrades gracefully: if the `mcp` package is
missing, the repo is not cloned, or Chrome has no Schoology session, callers
get a normal Python exception they can catch and fall back from.
"""
from __future__ import annotations

import asyncio
import hashlib
import importlib.util
import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Optional


def mcp_installed() -> bool:
    return importlib.util.find_spec("mcp") is not None


def normalise_base(base_url: str) -> str:
    """Accept 'dtuhsd', 'dtuhsd.schoology.com', or a full URL."""
    value = (base_url or "").strip()
    for prefix in ("https://", "http://"):
        if value.startswith(prefix):
            value = value[len(prefix):]
    value = value.split("/", 1)[0].strip().rstrip("/")
    if value and "." not in value:
        value = f"{value}.schoology.com"
    return value


def resolve_server_dir(explicit: Optional[str] = None) -> Optional[Path]:
    """Find the schoology-mcp checkout (which contains src/server.py)."""
    candidates = [
        explicit,
        os.environ.get("SCHOOLOGY_MCP_DIR"),
        str(Path.home() / "schoology-mcp"),
        str(Path.cwd() / "schoology-mcp"),
    ]
    for c in candidates:
        if not c:
            continue
        p = Path(c).expanduser()
        if (p / "src" / "server.py").exists():
            return p
    return None


def _as_list(payload: Any) -> list:
    """Normalise the many shapes a FastMCP tool result can take."""
    if payload is None:
        return []
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("result", "assignments", "items", "data"):
            if key in payload:
                return _as_list(payload[key])
        # upstream returns [{0: "error message"}] on failure
        if 0 in payload:
            return [payload]
        # otherwise treat dict values as rows only if all dicts
        values = list(payload.values())
        if values and all(isinstance(v, dict) for v in values):
            return values
        return [payload]
    return [payload]


def _parse_tool_result(result: Any) -> list:
    structured = getattr(result, "structuredContent", None)
    if structured:
        return _as_list(structured)

    chunks: list[str] = []
    for item in getattr(result, "content", None) or []:
        text = getattr(item, "text", None)
        if text:
            chunks.append(text)
    raw = "\n".join(chunks).strip()
    if not raw:
        return []
    try:
        return _as_list(json.loads(raw))
    except json.JSONDecodeError:
        start = raw.find("[")
        end = raw.rfind("]")
        if start != -1 and end > start:
            try:
                return _as_list(json.loads(raw[start:end + 1]))
            except json.JSONDecodeError:
                pass
    return []


def _parse_due(value: Any) -> str:
    if not value:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    text = str(value).strip()
    if not text:
        return ""
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        pass
    clean = text.split(" at ", 1)[0].strip()
    for fmt in (
        "%A, %B %d, %Y",
        "%A, %B %d",
        "%a, %b %d, %Y",
        "%B %d, %Y",
        "%b %d, %Y",
        "%B %d",
        "%b %d",
        "%m/%d/%Y",
    ):
        for candidate in (text, clean):
            try:
                return datetime.strptime(candidate, fmt).date().isoformat()
            except ValueError:
                continue
    return text


def _stable_id(title: str, course: str, due_date: str = "") -> str:
    raw = f"{(title or '').strip().lower()}|{(course or '').strip().lower()}"
    return "schoology-" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def _normalise(rows: list) -> list:
    out = []
    seen = set()
    for i, row in enumerate(rows):
        if not isinstance(row, dict):
            continue
        if 0 in row and len(row) == 1:
            raise RuntimeError(str(row[0]))
        title = (row.get("title") or row.get("name") or "").strip()
        if not title:
            continue
        course = (row.get("class") or row.get("course") or row.get("courseTitle") or "").strip()
        due_date = _parse_due(row.get("due") or row.get("due_date"))
        aid = str(row.get("id") or "").strip() or _stable_id(title, course, due_date)
        if aid in seen:
            continue
        seen.add(aid)
        out.append({
            "id": aid,
            "title": title,
            "course": course,
            "due_date": due_date,
            "status": (row.get("status") or "upcoming").strip(),
            "url": (row.get("url") or row.get("link") or "").strip(),
        })
    return out


async def _call_tool(base_url: str, server_dir: Path, tool: str, timeout: float) -> list:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    env = dict(os.environ)
    env["SCHOOLOGY_BASE_URL"] = base_url

    if shutil.which("uv"):
        params = StdioServerParameters(
            command="uv",
            args=["--directory", str(server_dir), "run", "src/server.py"],
            env=env,
        )
    else:
        params = StdioServerParameters(
            command=sys.executable,
            args=[str(server_dir / "src" / "server.py")],
            env=env,
        )

    async def _run() -> list:
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(tool, {})
                return _parse_tool_result(result)

    return await asyncio.wait_for(_run(), timeout=timeout)


def get_assignments(
    base_url: str,
    server_dir: Optional[str] = None,
    timeout: float = 45.0,
) -> list:
    """Fetch upcoming Schoology assignments via the MCP server.

    Raises RuntimeError with a human-readable message on any failure.
    """
    if not base_url:
        raise RuntimeError("Schoology school subdomain is not configured")
    if not mcp_installed():
        raise RuntimeError("Python package 'mcp' is not installed (pip install mcp)")
    resolved = resolve_server_dir(server_dir)
    if resolved is None:
        raise RuntimeError(
            "schoology-mcp checkout not found. Clone it and set the MCP repo path "
            "(e.g. git clone https://github.com/coimf/schoology-mcp ~/schoology-mcp)"
        )
    rows = asyncio.run(_call_tool(normalise_base(base_url), resolved, "get_upcoming_assignments", timeout))
    return _normalise(rows)


def get_courses(
    base_url: str,
    server_dir: Optional[str] = None,
    timeout: float = 45.0,
) -> list:
    if not base_url:
        raise RuntimeError("Schoology school subdomain is not configured")
    if not mcp_installed():
        raise RuntimeError("Python package 'mcp' is not installed (pip install mcp)")
    resolved = resolve_server_dir(server_dir)
    if resolved is None:
        raise RuntimeError("schoology-mcp checkout not found")
    rows = asyncio.run(_call_tool(normalise_base(base_url), resolved, "get_enrolled_courses", timeout))
    return [r for r in rows if isinstance(r, dict)]


def self_check(base_url: str, server_dir: Optional[str] = None) -> dict:
    """Return a diagnostic dict without raising (used by the API)."""
    resolved = resolve_server_dir(server_dir)
    info = {
        "ok": False,
        "mcp_installed": mcp_installed(),
        "server_dir": str(resolved) if resolved else None,
        "base_url": base_url or "",
        "uv": shutil.which("uv") or None,
        "error": None,
        "assignments": [],
        "courses": [],
    }
    try:
        assignments = get_assignments(base_url, server_dir)
        info["assignments"] = assignments
        try:
            info["courses"] = get_courses(base_url, server_dir)
        except Exception:
            pass
        info["ok"] = True
    except Exception as e:  # noqa: BLE001 - report any failure to the caller
        info["error"] = str(e)
    return info
