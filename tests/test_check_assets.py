import sys
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app


class CheckAssetsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = app.ThreadingHTTPServer(("127.0.0.1", 0), app.AppHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def test_check_assets_are_served_with_correct_content_types(self):
        for filename in ["check-app.css", "check-app.js", "check-core.js", "check-worker.js", "vendor/xlsx.full.min.js"]:
            with self.subTest(filename=filename), urlopen(self.base + "/" + filename) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(response.read(), (app.ROOT / filename).read_bytes())
                self.assertIn("text/css" if filename.endswith("css") else "application/javascript", response.headers["Content-Type"])

    def test_assets_do_not_expose_arbitrary_files_or_protected_data(self):
        for url, status in [("/vendor/../../app.py", 404), ("/app.py", 404), ("/near_miss.sqlite3", 404), ("/api/entries", 401)]:
            with self.subTest(url=url), self.assertRaises(HTTPError) as error:
                urlopen(self.base + url)
            self.assertEqual(error.exception.code, status)

    def test_static_mirror_matches_served_files(self):
        for filename in ["index.html", "check-app.css", "check-app.js", "check-core.js", "check-worker.js", "vendor/xlsx.full.min.js"]:
            self.assertEqual((app.ROOT / filename).read_bytes(), (app.ROOT / "static" / filename).read_bytes(), filename)


if __name__ == "__main__":
    unittest.main()
