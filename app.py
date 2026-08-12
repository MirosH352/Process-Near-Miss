from __future__ import annotations

import json
import hashlib
import os
import sqlite3
import secrets
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT
DB_PATH = ROOT / "near_miss.sqlite3"
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
USE_POSTGRES = bool(DATABASE_URL)
SESSION_COOKIE_NAME = "near_miss_session"
PASSWORD_HASH_ITERATIONS = 210000
SESSION_DAYS = int(os.environ.get("SESSION_DAYS", "7"))
SESSION_SECURE = os.environ.get("SESSION_SECURE", "0").lower() in {"1", "true", "yes"}

ENTRY_TYPES = {"bug", "near_miss"}
SEVERITIES = {"low", "medium", "high", "critical"}
STATUSES = {"new", "in_progress", "resolved", "closed"}
USER_ROLES = {"admin", "user"}

STATUS_LABELS = {
    "new": "Nový",
    "in_progress": "V řešení",
    "resolved": "Vyřešeno",
    "closed": "Uzavřeno",
}

TYPE_LABELS = {
    "bug": "Chyba",
    "near_miss": "Near miss",
}

PERSON_CHOICES = (
    "Miroslav Hilšer",
    "David Hejhal",
    "Andrey Zhilstov",
    "Tomáš Franc",
    "Michael Gottwald",
    "Zelený mužíček",
)
PERSON_CHOICES_SET = set(PERSON_CHOICES)
PERSON_EMPTY_LABEL = "Nevyplněno"

SEVERITY_LABELS = {
    "low": "Nízká",
    "medium": "Střední",
    "high": "Vysoká",
    "critical": "Kritická",
}


ROLE_LABELS = {
    "admin": "Admin",
    "user": "Uživatel",
}


def sql(query: str) -> str:
    return query.replace("?", "%s") if USE_POSTGRES else query


class DatabaseConnection:
    def __init__(self, connection):
        self._connection = connection

    def execute(self, query: str, params=()):
        if USE_POSTGRES:
            cursor = self._connection.cursor()
            cursor.execute(sql(query), params)
            return cursor
        return self._connection.execute(query, params)

    def __enter__(self):
        self._connection.__enter__()
        return self

    def __exit__(self, exc_type, exc, tb):
        return self._connection.__exit__(exc_type, exc, tb)

    def commit(self):
        return self._connection.commit()

    def rollback(self):
        return self._connection.rollback()

    def close(self):
        return self._connection.close()


def connect():
    if USE_POSTGRES:
        import psycopg
        from psycopg.rows import dict_row

        return DatabaseConnection(psycopg.connect(DATABASE_URL, row_factory=dict_row))

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return DatabaseConnection(conn)


def table_columns(conn: sqlite3.Connection, table_name: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return {row["name"] for row in rows}


def ensure_column(conn: sqlite3.Connection, table_name: str, column_name: str, definition: str) -> None:
    if column_name not in table_columns(conn, table_name):
        conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")


def migrate_users_table(conn: sqlite3.Connection) -> None:
    schema_row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'"
    ).fetchone()
    schema_sql = (schema_row["sql"] if schema_row else "") or ""
    if "CHECK (role = 'admin')" not in schema_sql:
        return

    conn.execute("ALTER TABLE users RENAME TO users_legacy")
    conn.execute(
        """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            CHECK (role IN ('admin', 'user')),
            CHECK (is_active IN (0, 1))
        )
        """
    )
    conn.execute(
        """
        INSERT INTO users (id, email, password_hash, role, is_active, created_at, updated_at)
        SELECT id, email, password_hash, 'admin', is_active, created_at, updated_at
        FROM users_legacy
        """
    )
    conn.execute("DROP TABLE users_legacy")


def repair_foreign_key_tables(conn: sqlite3.Connection) -> None:
    sessions_schema_row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sessions'"
    ).fetchone()
    sessions_schema_sql = (sessions_schema_row["sql"] if sessions_schema_row else "") or ""
    if "users_legacy" in sessions_schema_sql:
        conn.execute("ALTER TABLE sessions RENAME TO sessions_legacy")
        conn.execute(
            """
            CREATE TABLE sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            """
            INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at)
            SELECT id, user_id, token_hash, created_at, expires_at, last_seen_at
            FROM sessions_legacy
            """
        )
        conn.execute("DROP TABLE sessions_legacy")

    entries_schema_row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'entries'"
    ).fetchone()
    entries_schema_sql = (entries_schema_row["sql"] if entries_schema_row else "") or ""
    if "users_legacy" in entries_schema_sql:
        conn.execute("ALTER TABLE entries RENAME TO entries_legacy")
        conn.execute(
            """
            CREATE TABLE entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                entry_type TEXT NOT NULL,
                severity TEXT NOT NULL,
                status TEXT NOT NULL,
                problem_reporter TEXT,
                culprit TEXT,
                created_by_user_id INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                CHECK (entry_type IN ('bug', 'near_miss')),
                CHECK (severity IN ('low', 'medium', 'high', 'critical')),
                CHECK (status IN ('new', 'in_progress', 'resolved', 'closed')),
                FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
            )
            """
        )
        conn.execute(
            """
            INSERT INTO entries (
                id,
                title,
                description,
                entry_type,
                severity,
                status,
                created_by_user_id,
                created_at,
                updated_at
            )
            SELECT
                id,
                title,
                description,
                entry_type,
                severity,
                status,
                NULL AS problem_reporter,
                NULL AS culprit,
                created_by_user_id,
                created_at,
                updated_at
            FROM entries_legacy
            """
        )
        conn.execute("DROP TABLE entries_legacy")


def init_db() -> None:
    with connect() as conn:
        if USE_POSTGRES:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'user',
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    CHECK (role IN ('admin', 'user')),
                    CHECK (is_active IN (0, 1))
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    token_hash TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS entries (
                    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    entry_type TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    status TEXT NOT NULL,
                    problem_reporter TEXT,
                    culprit TEXT,
                    created_by_user_id BIGINT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    CHECK (entry_type IN ('bug', 'near_miss')),
                    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
                    CHECK (status IN ('new', 'in_progress', 'resolved', 'closed')),
                    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
                )
                """
            )
        else:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'user',
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    CHECK (role IN ('admin', 'user')),
                    CHECK (is_active IN (0, 1))
                )
                """
            )
            migrate_users_table(conn)
            repair_foreign_key_tables(conn)
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    token_hash TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS entries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    entry_type TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    status TEXT NOT NULL,
                    problem_reporter TEXT,
                    culprit TEXT,
                    created_by_user_id INTEGER,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    CHECK (entry_type IN ('bug', 'near_miss')),
                    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
                    CHECK (status IN ('new', 'in_progress', 'resolved', 'closed')),
                    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
                )
                """
            )
            ensure_column(conn, "entries", "created_by_user_id", "INTEGER")
            ensure_column(conn, "entries", "problem_reporter", "TEXT")
            ensure_column(conn, "entries", "culprit", "TEXT")


def now_dt() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now_dt().isoformat()


def normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt),
        PASSWORD_HASH_ITERATIONS,
    )
    return f"pbkdf2_sha256${PASSWORD_HASH_ITERATIONS}${salt}${derived.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations_text, salt_hex, hash_hex = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_text)
        expected = bytes.fromhex(hash_hex)
        derived = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            iterations,
        )
        return secrets.compare_digest(derived, expected)
    except (ValueError, TypeError):
        return False


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_password_error() -> ValueError:
    return ValueError("Heslo musí mít alespoň 8 znaků.")


def validate_email(email: str) -> str:
    normalized = normalize_email(str(email or ""))
    if not normalized or "@" not in normalized:
        raise ValueError("Zadej platný email.")
    return normalized


def validate_password(password: str) -> str:
    value = str(password or "")
    if len(value) < 8:
        raise create_password_error()
    return value


def json_response(
    handler: BaseHTTPRequestHandler,
    payload,
    status: int = 200,
    headers: list[tuple[str, str]] | None = None,
) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    for header, value in headers or []:
        handler.send_header(header, value)
    handler.end_headers()
    handler.wfile.write(body)


def read_json(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0"))
    raw = handler.rfile.read(length) if length else b"{}"
    try:
        data = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError("Neplatné JSON tělo.") from exc
    if not isinstance(data, dict):
        raise ValueError("JSON musí být objekt.")
    return data


def user_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "email": row["email"],
        "role": row["role"],
        "role_label": ROLE_LABELS.get(row["role"], row["role"]),
        "is_active": bool(row["is_active"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def row_to_dict(row: sqlite3.Row) -> dict:
    created_by_email = row["created_by_email"] if "created_by_email" in row.keys() else None
    problem_reporter = row["problem_reporter"] if "problem_reporter" in row.keys() else None
    culprit = row["culprit"] if "culprit" in row.keys() else None
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "entry_type": row["entry_type"],
        "entry_type_label": TYPE_LABELS[row["entry_type"]],
        "severity": row["severity"],
        "severity_label": SEVERITY_LABELS[row["severity"]],
        "status": row["status"],
        "status_label": STATUS_LABELS[row["status"]],
        "problem_reporter": problem_reporter,
        "problem_reporter_label": problem_reporter or PERSON_EMPTY_LABEL,
        "culprit": culprit,
        "culprit_label": culprit or PERSON_EMPTY_LABEL,
        "created_by_user_id": row["created_by_user_id"],
        "created_by_email": created_by_email,
        "created_by_label": created_by_email or "SystĂ©m",
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def normalize_person_choice(value: object, field_label: str) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text not in PERSON_CHOICES_SET:
        raise ValueError(f"NeplatnĂ˝ {field_label}.")
    return text


def session_expires_at() -> str:
    return (now_dt() + timedelta(days=SESSION_DAYS)).isoformat()


def cookie_value(handler: BaseHTTPRequestHandler, name: str) -> str | None:
    raw = handler.headers.get("Cookie")
    if not raw:
        return None
    cookie = SimpleCookie()
    cookie.load(raw)
    morsel = cookie.get(name)
    return morsel.value if morsel else None


def session_cookie_header(token: str, expires_at: str) -> str:
    max_age = max(0, int((datetime.fromisoformat(expires_at) - now_dt()).total_seconds()))
    cookie = (
        f"{SESSION_COOKIE_NAME}={token}; HttpOnly; Path=/; SameSite=Lax; Max-Age={max_age}"
    )
    if SESSION_SECURE:
        cookie += "; Secure"
    return cookie


def set_session_cookie(handler: BaseHTTPRequestHandler, token: str, expires_at: str) -> None:
    handler.send_header("Set-Cookie", session_cookie_header(token, expires_at))


def clear_session_cookie_value() -> str:
    cookie = f"{SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0"
    if SESSION_SECURE:
        cookie += "; Secure"
    return cookie


def clear_session_cookie(handler: BaseHTTPRequestHandler) -> None:
    handler.send_header("Set-Cookie", clear_session_cookie_value())


def user_count() -> int:
    with connect() as conn:
        row = conn.execute("SELECT COUNT(*) AS count FROM users").fetchone()
    return int(row["count"])


def get_user_by_email(email: str) -> sqlite3.Row | None:
    normalized = normalize_email(email)
    with connect() as conn:
        return conn.execute("SELECT * FROM users WHERE email = ?", (normalized,)).fetchone()


def create_user(email: str, password: str, role: str = "user") -> dict:
    normalized_email = validate_email(email)
    validated_password = validate_password(password)
    normalized_role = str(role or "user")
    if normalized_role not in USER_ROLES:
        raise ValueError("Neplatná role.")
    created_at = now_iso()
    password_hash = hash_password(validated_password)

    with connect() as conn:
        try:
            inserted = conn.execute(
                """
                INSERT INTO users (email, password_hash, role, is_active, created_at, updated_at)
                VALUES (?, ?, ?, 1, ?, ?)
                RETURNING id
                """,
                (normalized_email, password_hash, normalized_role, created_at, created_at),
            ).fetchone()
        except sqlite3.IntegrityError as exc:
            raise ValueError("Uživatel s tímto emailem už existuje.") from exc
        row = conn.execute("SELECT * FROM users WHERE id = ?", (inserted["id"],)).fetchone()
    return user_to_dict(row)


def update_user(user_id: int, data: dict, actor_user_id: int | None = None) -> dict:
    allowed_fields: dict[str, object] = {}
    current_row: sqlite3.Row | None = None

    if actor_user_id is not None and actor_user_id == user_id:
        with connect() as conn:
            current_row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if current_row is None:
            raise LookupError("Uživatel nebyl nalezen.")

    if "email" in data:
        normalized_email = validate_email(data["email"])
        existing = get_user_by_email(normalized_email)
        if existing is not None and existing["id"] != user_id:
            raise ValueError("Uživatel s tímto emailem už existuje.")
        allowed_fields["email"] = normalized_email

    if "role" in data:
        normalized_role = str(data["role"] or "user")
        if normalized_role not in USER_ROLES:
            raise ValueError("Neplatná role.")
        allowed_fields["role"] = normalized_role

    if "is_active" in data:
        raw_active = data["is_active"]
        if isinstance(raw_active, bool):
            allowed_fields["is_active"] = int(raw_active)
        elif isinstance(raw_active, (int, float)):
            allowed_fields["is_active"] = 1 if int(raw_active) else 0
        elif isinstance(raw_active, str):
            allowed_fields["is_active"] = 1 if raw_active.strip().lower() in {"1", "true", "yes", "on"} else 0
        else:
            raise ValueError("Neplatný stav účtu.")

    if "new_password" in data or "password" in data:
        password_value = str(data.get("new_password", data.get("password", "")) or "").strip()
        if password_value:
            allowed_fields["password_hash"] = hash_password(validate_password(password_value))

    if not allowed_fields:
        raise ValueError("Není co aktualizovat.")

    if current_row is not None:
        next_role = str(allowed_fields.get("role", current_row["role"]))
        next_active = int(allowed_fields.get("is_active", current_row["is_active"]))
        if current_row["role"] == "admin" and next_role != "admin":
            raise ValueError("Nemůžeš si odebrat vlastní admin práva.")
        if next_active == 0:
            raise ValueError("Nemůžeš deaktivovat svůj vlastní účet.")

    allowed_fields["updated_at"] = now_iso()
    columns = ", ".join(f"{key} = ?" for key in allowed_fields)
    values = list(allowed_fields.values()) + [user_id]

    with connect() as conn:
        try:
            cursor = conn.execute(
                f"UPDATE users SET {columns} WHERE id = ?",
                values,
            )
        except sqlite3.IntegrityError as exc:
            raise ValueError("Uživatel s tímto emailem už existuje.") from exc
        if cursor.rowcount == 0:
            raise LookupError("Uživatel nebyl nalezen.")
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return user_to_dict(row)


def bulk_update_users_active(user_ids: list[int], is_active: bool, actor_user_id: int | None = None) -> int:
    unique_ids = []
    seen = set()
    for user_id in user_ids:
        if not isinstance(user_id, int):
            raise ValueError("Neplatné ID uživatele.")
        if user_id <= 0:
            raise ValueError("Neplatné ID uživatele.")
        if user_id in seen:
            continue
        seen.add(user_id)
        unique_ids.append(user_id)

    if not unique_ids:
        raise ValueError("Vyber alespoň jednoho uživatele.")

    if actor_user_id is not None and not is_active and actor_user_id in seen:
        raise ValueError("Nemůžeš deaktivovat svůj vlastní účet.")

    placeholders = ", ".join(["?"] * len(unique_ids))
    updated_at = now_iso()

    with connect() as conn:
        rows = conn.execute(f"SELECT id FROM users WHERE id IN ({placeholders})", unique_ids).fetchall()
        found_ids = {int(row["id"]) for row in rows}
        if len(found_ids) != len(seen):
            raise LookupError("Jeden nebo více uživatelů nebyl nalezen.")
        conn.execute(
            f"UPDATE users SET is_active = ?, updated_at = ? WHERE id IN ({placeholders})",
            [1 if is_active else 0, updated_at, *unique_ids],
        )

    return len(unique_ids)


def list_users() -> list[dict]:
    with connect() as conn:
        rows = conn.execute("SELECT * FROM users ORDER BY created_at ASC, id ASC").fetchall()
    return [user_to_dict(row) for row in rows]


def create_session(user_id: int) -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    token_hash = hash_token(token)
    created_at = now_iso()
    expires_at = session_expires_at()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO sessions (user_id, token_hash, created_at, expires_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user_id, token_hash, created_at, expires_at, created_at),
        )
    return token, expires_at


def delete_session(token: str) -> None:
    token_hash = hash_token(token)
    with connect() as conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))


def current_user(handler: BaseHTTPRequestHandler) -> sqlite3.Row | None:
    token = cookie_value(handler, SESSION_COOKIE_NAME)
    if not token:
        return None

    token_hash = hash_token(token)
    current = now_iso()
    with connect() as conn:
        row = conn.execute(
            """
            SELECT u.*
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_active = 1
            """,
            (token_hash, current),
        ).fetchone()
        if row is not None:
            conn.execute("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?", (current, token_hash))
        else:
            conn.execute("DELETE FROM sessions WHERE token_hash = ? OR expires_at <= ?", (token_hash, current))
    return row


def require_user(handler: BaseHTTPRequestHandler) -> sqlite3.Row | None:
    user = current_user(handler)
    if user is None:
        json_response(handler, {"error": "Nepřihlášený uživatel."}, HTTPStatus.UNAUTHORIZED)
        return None
    return user


def require_admin(handler: BaseHTTPRequestHandler) -> sqlite3.Row | None:
    user = require_user(handler)
    if user is None:
        return None
    if user["role"] != "admin":
        json_response(handler, {"error": "Nemáš oprávnění."}, HTTPStatus.FORBIDDEN)
        return None
    return user


def list_entries() -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT
                e.*,
                u.email AS created_by_email
            FROM entries e
            LEFT JOIN users u ON u.id = e.created_by_user_id
            ORDER BY e.created_at DESC, e.id DESC
            """
        ).fetchall()
    return [row_to_dict(row) for row in rows]


def create_entry(data: dict, created_by_user_id: int | None) -> dict:
    title = str(data.get("title", "")).strip()
    description = str(data.get("description", "")).strip()
    entry_type = str(data.get("entry_type", "bug"))
    severity = str(data.get("severity", "medium"))
    status = str(data.get("status", "new"))
    problem_reporter = normalize_person_choice(data.get("problem_reporter"), "zadavatele problému")
    culprit = normalize_person_choice(data.get("culprit"), "viníka")

    if not title:
        raise ValueError("Název je povinný.")
    if entry_type not in ENTRY_TYPES:
        raise ValueError("Neplatný typ záznamu.")
    if severity not in SEVERITIES:
        raise ValueError("Neplatná závažnost.")
    if status not in STATUSES:
        raise ValueError("Neplatný stav.")

    created_at = now_iso()
    with connect() as conn:
        inserted = conn.execute(
            """
            INSERT INTO entries (
                title,
                description,
                entry_type,
                severity,
                status,
                problem_reporter,
                culprit,
                created_by_user_id,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
            """,
            (
                title,
                description,
                entry_type,
                severity,
                status,
                problem_reporter,
                culprit,
                created_by_user_id,
                created_at,
                created_at,
            ),
        ).fetchone()
        row = conn.execute(
            """
            SELECT e.*, u.email AS created_by_email
            FROM entries e
            LEFT JOIN users u ON u.id = e.created_by_user_id
            WHERE e.id = ?
            """,
            (inserted["id"],),
        ).fetchone()
    return row_to_dict(row)


def update_entry(entry_id: int, data: dict) -> dict:
    allowed_fields = {}
    if "title" in data:
        title = str(data["title"]).strip()
        if not title:
            raise ValueError("Název je povinný.")
        allowed_fields["title"] = title
    if "description" in data:
        allowed_fields["description"] = str(data["description"]).strip()
    if "entry_type" in data:
        entry_type = str(data["entry_type"])
        if entry_type not in ENTRY_TYPES:
            raise ValueError("Neplatný typ záznamu.")
        allowed_fields["entry_type"] = entry_type
    if "severity" in data:
        severity = str(data["severity"])
        if severity not in SEVERITIES:
            raise ValueError("Neplatná závažnost.")
        allowed_fields["severity"] = severity
    if "status" in data:
        status = str(data["status"])
        if status not in STATUSES:
            raise ValueError("Neplatný stav.")
        allowed_fields["status"] = status
    if "problem_reporter" in data:
        allowed_fields["problem_reporter"] = normalize_person_choice(
            data["problem_reporter"], "zadavatele problému"
        )
    if "culprit" in data:
        allowed_fields["culprit"] = normalize_person_choice(data["culprit"], "viníka")

    if not allowed_fields:
        raise ValueError("Není co aktualizovat.")

    allowed_fields["updated_at"] = now_iso()
    columns = ", ".join(f"{key} = ?" for key in allowed_fields)
    values = list(allowed_fields.values()) + [entry_id]

    with connect() as conn:
        cursor = conn.execute(
            f"UPDATE entries SET {columns} WHERE id = ?",
            values,
        )
        if cursor.rowcount == 0:
            raise LookupError("Záznam nebyl nalezen.")
        row = conn.execute(
            """
            SELECT e.*, u.email AS created_by_email
            FROM entries e
            LEFT JOIN users u ON u.id = e.created_by_user_id
            WHERE e.id = ?
            """,
            (entry_id,),
        ).fetchone()
    return row_to_dict(row)


def delete_entry(entry_id: int) -> None:
    with connect() as conn:
        cursor = conn.execute("DELETE FROM entries WHERE id = ?", (entry_id,))
        if cursor.rowcount == 0:
            raise LookupError("Záznam nebyl nalezen.")


def bootstrap_admin(data: dict) -> dict:
    if user_count() > 0:
        raise ValueError("Počáteční administrátor už existuje.")

    user = create_user(data.get("email", ""), data.get("password", ""), "admin")
    with connect() as conn:
        conn.execute(
            "UPDATE entries SET created_by_user_id = ? WHERE created_by_user_id IS NULL",
            (user["id"],),
        )
    return user


def login_user(data: dict) -> dict:
    email = validate_email(data.get("email", ""))
    password = validate_password(data.get("password", ""))

    with connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ? AND is_active = 1", (email,)).fetchone()

    if row is None or not verify_password(password, row["password_hash"]):
        raise ValueError("Neplatný email nebo heslo.")

    return user_to_dict(row)


def change_password(user_id: int, current_password: str, new_password: str) -> None:
    current_password = validate_password(current_password)
    new_password = validate_password(new_password)

    with connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if row is None or not verify_password(current_password, row["password_hash"]):
            raise ValueError("Neplatné současné heslo.")
        conn.execute(
            "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
            (hash_password(new_password), now_iso(), user_id),
        )


class AppHandler(BaseHTTPRequestHandler):
    server_version = "NearMissTracker/1.0"

    def log_message(self, format: str, *args) -> None:
        return

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/bootstrap/status":
            json_response(self, {"needs_bootstrap": user_count() == 0})
            return

        if path == "/api/auth/me":
            user = require_user(self)
            if user is None:
                return
            json_response(self, {"user": user_to_dict(user)})
            return

        if path == "/api/entries":
            user = require_user(self)
            if user is None:
                return
            json_response(self, {"items": list_entries()})
            return

        if path == "/api/users":
            user = require_admin(self)
            if user is None:
                return
            json_response(self, {"items": list_users()})
            return

        if path == "/" or path == "/index.html":
            self.serve_file(STATIC_DIR / "index.html", "text/html; charset=utf-8")
            return

        if path == "/styles.css":
            self.serve_file(STATIC_DIR / "styles.css", "text/css; charset=utf-8")
            return

        if path == "/app.js":
            self.serve_file(STATIC_DIR / "app.js", "application/javascript; charset=utf-8")
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/bootstrap/admin":
            try:
                if user_count() > 0:
                    json_response(self, {"error": "Počáteční administrátor už existuje."}, HTTPStatus.CONFLICT)
                    return
                data = read_json(self)
                user = bootstrap_admin(data)
                token, expires_at = create_session(user["id"])
                json_response(
                    self,
                    {"user": user},
                    HTTPStatus.CREATED,
                    headers=[("Set-Cookie", session_cookie_header(token, expires_at))],
                )
            except ValueError as exc:
                json_response(self, {"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return

        if path == "/api/auth/login":
            try:
                data = read_json(self)
                user = login_user(data)
                token, expires_at = create_session(user["id"])
                json_response(
                    self,
                    {"user": user},
                    headers=[("Set-Cookie", session_cookie_header(token, expires_at))],
                )
            except ValueError as exc:
                json_response(self, {"error": str(exc)}, HTTPStatus.UNAUTHORIZED)
            return

        if path == "/api/auth/logout":
            token = cookie_value(self, SESSION_COOKIE_NAME)
            if token:
                delete_session(token)
            json_response(
                self,
                {"ok": True},
                headers=[("Set-Cookie", clear_session_cookie_value())],
            )
            return

        if path == "/api/auth/change-password":
            user = require_user(self)
            if user is None:
                return
            try:
                data = read_json(self)
                change_password(user["id"], data.get("current_password", ""), data.get("new_password", ""))
                json_response(self, {"ok": True})
            except ValueError as exc:
                json_response(self, {"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return

        if path == "/api/entries":
            user = require_user(self)
            if user is None:
                return
            try:
                data = read_json(self)
                item = create_entry(data, user["id"])
                json_response(self, item, HTTPStatus.CREATED)
            except ValueError as exc:
                json_response(self, {"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return

        if path == "/api/users":
            user = require_admin(self)
            if user is None:
                return
            try:
                data = read_json(self)
                item = create_user(data.get("email", ""), data.get("password", ""), data.get("role", "user"))
                json_response(self, item, HTTPStatus.CREATED)
            except ValueError as exc:
                json_response(self, {"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return

        if path.startswith(users_prefix):
            user = require_admin(self)
            if user is None:
                return
            try:
                target_user_id = int(path[len(users_prefix) :])
            except ValueError:
                json_response(self, {"error": "Neplatné ID."}, HTTPStatus.BAD_REQUEST)
                return
            try:
                data = read_json(self)
                item = update_user(target_user_id, data)
                json_response(self, item)
            except ValueError as exc:
                json_response(self, {"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            except LookupError as exc:
                json_response(self, {"error": str(exc)}, HTTPStatus.NOT_FOUND)
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_PATCH(self) -> None:
        path = urlparse(self.path).path
        users_prefix = "/api/users/"
        if path.startswith(users_prefix):
            bulk_suffix = "bulk-status"
            if path == f"{users_prefix}{bulk_suffix}":
                user = require_admin(self)
                if user is None:
                    return
                try:
                    data = read_json(self)
                    raw_ids = data.get("user_ids", [])
                    if not isinstance(raw_ids, list):
                        raise ValueError("Seznam uživatelů je neplatný.")
                    is_active = data.get("is_active")
                    if not isinstance(is_active, bool):
                        raise ValueError("Neplatný stav účtu.")
                    user_ids = [int(value) for value in raw_ids]
                    updated = bulk_update_users_active(user_ids, is_active, user["id"])
                    json_response(self, {"updated": updated})
                except ValueError as exc:
                    json_response(self, {"error": str(exc)}, HTTPStatus.BAD_REQUEST)
                except LookupError as exc:
                    json_response(self, {"error": str(exc)}, HTTPStatus.NOT_FOUND)
                return

            user = require_admin(self)
            if user is None:
                return
            try:
                target_user_id = int(path[len(users_prefix) :])
            except ValueError:
                json_response(self, {"error": "Neplatné ID."}, HTTPStatus.BAD_REQUEST)
                return

            try:
                data = read_json(self)
                item = update_user(target_user_id, data, user["id"])
                json_response(self, item)
            except ValueError as exc:
                json_response(self, {"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            except LookupError as exc:
                json_response(self, {"error": str(exc)}, HTTPStatus.NOT_FOUND)
            return

        prefix = "/api/entries/"
        if not path.startswith(prefix):
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return
        if require_user(self) is None:
            return
        try:
            entry_id = int(path[len(prefix) :])
        except ValueError:
            json_response(self, {"error": "Neplatné ID."}, HTTPStatus.BAD_REQUEST)
            return

        try:
            data = read_json(self)
            item = update_entry(entry_id, data)
            json_response(self, item)
        except ValueError as exc:
            json_response(self, {"error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except LookupError as exc:
            json_response(self, {"error": str(exc)}, HTTPStatus.NOT_FOUND)

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path
        prefix = "/api/entries/"
        if not path.startswith(prefix):
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return
        if require_user(self) is None:
            return
        try:
            entry_id = int(path[len(prefix) :])
        except ValueError:
            json_response(self, {"error": "Neplatné ID."}, HTTPStatus.BAD_REQUEST)
            return

        try:
            delete_entry(entry_id)
            self.send_response(HTTPStatus.NO_CONTENT)
            self.end_headers()
        except LookupError as exc:
            json_response(self, {"error": str(exc)}, HTTPStatus.NOT_FOUND)

    def serve_file(self, path: Path, content_type: str) -> None:
        if not path.exists():
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return
        data = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    init_db()
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer((host, port), AppHandler)
    print(f"Near miss tracker běží na http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
