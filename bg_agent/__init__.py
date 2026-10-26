"""Optional local bridge for ByMe.

The package no longer imports the FastAPI app at import time. The supported
entry point is ``python3 -m bg_agent.sync``; the legacy scheduler/report code
was removed during the SQLite migration.
"""
from __future__ import annotations

__all__ = ["mcp_schoology", "sync"]
__version__ = "0.3.0"
