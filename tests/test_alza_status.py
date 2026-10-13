import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import alza_status


class AlzaStatusTests(unittest.TestCase):
    def setUp(self):
        alza_status._cache = None
        alza_status._next_check = 0
        alza_status._checked_at = None

    def test_every_affected_service_is_included_and_resolved_tickets_are_ignored(self):
        statuses = ["ok", "operational", "warning", "degraded", "error", "down"]
        services = [{"name": status, "status": status, "tickets": [{"summary": "Incident"}]} for status in statuses]
        result = alza_status.parse_services({"services": services, "rfcEvents": [{"title": "Planned"}]})
        self.assertEqual([service["name"] for service in result], statuses[2:])
        self.assertEqual(result[0]["incidents"], ["Incident"])

    def test_unknown_or_missing_data_is_not_reported_as_healthy(self):
        for payload in [{}, {"services": []}, {"services": [{"status": "unexpected"}]}]:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                alza_status.parse_services(payload)

    def test_cache_and_failure_preserve_last_known_incident(self):
        raw = json.dumps({"services": [{"name": "Web", "status": "down", "tickets": []}]}).encode()
        with patch("alza_status.urllib.request.urlopen", return_value=io.BytesIO(raw)) as request:
            first = alza_status.get_status()
            self.assertTrue(first["available"])
            self.assertEqual(alza_status.get_status(), first)
            request.assert_called_once()
        alza_status._next_check = 0
        with patch("alza_status.urllib.request.urlopen", side_effect=OSError("offline")):
            failed = alza_status.get_status()
        self.assertFalse(failed["available"])
        self.assertEqual(failed["services"], first["services"])
        self.assertEqual(failed["checkedAt"], first["checkedAt"])
        alza_status._next_check = 0
        with patch("alza_status.urllib.request.urlopen", return_value=io.BytesIO(b'{"services":[{"status":"ok"}]}')):
            recovered = alza_status.get_status()
        self.assertTrue(recovered["available"])
        self.assertEqual(recovered["services"], [])

    def test_first_failure_has_no_successful_timestamp(self):
        with patch("alza_status.urllib.request.urlopen", side_effect=OSError("offline")):
            result = alza_status.get_status()
        self.assertFalse(result["available"])
        self.assertIsNone(result["checkedAt"])


if __name__ == "__main__":
    unittest.main()