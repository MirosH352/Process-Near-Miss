"""Local browser QA against a disposable database, never the real application data."""
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app

if __name__ == "__main__":
    directory = Path(__file__).resolve().parents[1] / ".check-preview"
    directory.mkdir(exist_ok=True)
    database = directory / f"preview-{uuid.uuid4().hex}.sqlite3"
    try:
        app.USE_POSTGRES = False
        app.DATABASE_URL = ""
        app.DB_PATH = database
        app.SESSION_SECURE = False
        app.APP_ORIGIN = "http://127.0.0.1:8011"
        app.init_db()
        app.create_user("preview@example.test", "CheckPreview2026!", "admin")
        app.create_user("reader@example.test", "CheckPreview2026!", "user")
        print("Disposable preview: http://127.0.0.1:8011", flush=True)
        app.ThreadingHTTPServer(("127.0.0.1", 8011), app.AppHandler).serve_forever()
    finally:
        database.unlink(missing_ok=True)
