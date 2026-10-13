"""Read the public feed used by status.alza.cz, with a shared short cache."""
import json
import threading
import time
import urllib.request
from datetime import datetime, timezone

SOURCE_URL = "https://status.alza.cz/"
FEED_URL = SOURCE_URL + "api_status.php"
CACHE_SECONDS = 60
_cache = None
_checked_at = None
_next_check = 0
_lock = threading.Lock()


def parse_services(payload):
    services = payload.get("services") if isinstance(payload, dict) else None
    if not isinstance(services, list) or not services:
        raise ValueError("Missing service status")
    affected = []
    for service in services:
        if not isinstance(service, dict) or service.get("status") not in {
            "ok", "operational", "warning", "degraded", "error", "down"
        }:
            raise ValueError("Unknown service status")
        # Healthy services may contain recently resolved tickets.
        if service["status"] in {"ok", "operational"}:
            continue
        tickets = service.get("tickets", [])
        if not isinstance(tickets, list):
            raise ValueError("Invalid tickets")
        affected.append({
            "name": str(service.get("name") or "Služba Alzy")[:200],
            "status": service["status"],
            "incidents": [str(ticket.get("summary") or ticket.get("key") or "Aktivní incident")[:500]
                          for ticket in tickets if isinstance(ticket, dict)],
        })
    return affected


def get_status():
    global _cache, _checked_at, _next_check
    with _lock:
        if time.monotonic() >= _next_check:
            try:
                request = urllib.request.Request(FEED_URL, headers={
                    "Accept": "application/json", "User-Agent": "ProcessTools-Status/1.0"
                })
                with urllib.request.urlopen(request, timeout=8) as response:
                    raw = response.read(2_000_001)
                if len(raw) > 2_000_000:
                    raise ValueError("Status response too large")
                affected = parse_services(json.loads(raw))
                _checked_at = datetime.now(timezone.utc).isoformat()
                _cache = {"available": True, "services": affected}
            except (OSError, ValueError, TypeError):
                _cache = {"available": False, "services": (_cache or {}).get("services", [])}
            _next_check = time.monotonic() + CACHE_SECONDS
        return {**_cache, "checkedAt": _checked_at, "sourceUrl": SOURCE_URL}