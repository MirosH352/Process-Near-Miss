import gc
import json
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

import app


class SharedChecklistTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent)
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(gc.collect)
        for name, value in {
            "DB_PATH": Path(self.temp.name) / "test.sqlite3",
            "USE_POSTGRES": False,
        }.items():
            override = patch.object(app, name, value)
            override.start()
            self.addCleanup(override.stop)
        app.init_db()
        self.sessions = []
        for email in ("first@example.test", "second@example.test"):
            user = app.create_user(email, "test-password")
            token, _, csrf = app.create_session(user["id"])
            self.sessions.append({
                "Cookie": f"{app.SESSION_COOKIE_NAME}={token}",
                "X-CSRF-Token": csrf,
            })
        self.server = app.ThreadingHTTPServer(("127.0.0.1", 0), app.AppHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop_server)

    def stop_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, method="GET", payload=None, user=0, csrf=True):
        headers = dict(self.sessions[user]) if user is not None else {}
        if not csrf:
            headers.pop("X-CSRF-Token", None)
        if payload is not None:
            headers["Content-Type"] = "application/json"
        conn = HTTPConnection(*self.server.server_address, timeout=5)
        try:
            conn.request(method, app.SHARED_CHECKLIST_PATH,
                         body=json.dumps(payload) if payload is not None else None,
                         headers=headers)
            response = conn.getresponse()
            return response.status, json.loads(response.read())
        finally:
            conn.close()

    def test_new_checklist_is_shared_and_unchecked(self):
        status, first = self.request()
        self.assertEqual(status, 200)
        self.assertEqual(first, self.request(user=1)[1])
        self.assertEqual(len(first["items"]), 16)
        self.assertFalse(any(first["items"].values()))
        self.assertIsNone(first["updatedAt"])

    def test_two_users_can_update_different_items_without_losing_changes(self):
        first, second = app.SHARED_CHECKLIST_ITEMS[:2]
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [
                pool.submit(self.request, "PATCH", {"items": {item: True}}, user)
                for user, item in enumerate((first, second))
            ]
            for future in futures:
                self.assertEqual(future.result()[0], 200)
        for user in (0, 1):
            data = self.request(user=user)[1]
            self.assertTrue(data["items"][first])
            self.assertTrue(data["items"][second])
        self.request("PATCH", {"items": {first: False}}, user=1)
        data = self.request()[1]
        self.assertFalse(data["items"][first])
        self.assertTrue(data["items"][second])

    def test_progress_survives_database_initialization_and_reset_is_shared(self):
        item = app.SHARED_CHECKLIST_ITEMS[0]
        self.request("PATCH", {"items": {item: True}})
        app.init_db()
        self.assertTrue(self.request(user=1)[1]["items"][item])
        status, _ = self.request("PATCH", {
            "items": dict.fromkeys(app.SHARED_CHECKLIST_ITEMS, False)
        }, user=1)
        self.assertEqual(status, 200)
        data = self.request()[1]
        self.assertFalse(any(data["items"].values()))
        self.assertIsNotNone(data["updatedAt"])

    def test_authentication_and_csrf_are_required(self):
        item = app.SHARED_CHECKLIST_ITEMS[0]
        payload = {"items": {item: True}}
        self.assertEqual(self.request(user=None)[0], 401)
        self.assertEqual(self.request("PATCH", payload, user=None)[0], 401)
        self.assertEqual(self.request("PATCH", payload, csrf=False)[0], 403)
        self.assertFalse(self.request()[1]["items"][item])

    def test_invalid_batch_never_partially_changes_progress(self):
        item = app.SHARED_CHECKLIST_ITEMS[0]
        for payload in (
            {"items": {item: True, "unknown": True}},
            {"items": {item: "false"}},
            {"items": {item: 1}},
            {"items": {}},
            {"items": []},
            {"items": {item: True}, "unexpected": True},
        ):
            with self.subTest(payload=payload):
                self.assertEqual(self.request("PATCH", payload)[0], 400)
                self.assertFalse(any(self.request()[1]["items"].values()))


if __name__ == "__main__":
    unittest.main()
