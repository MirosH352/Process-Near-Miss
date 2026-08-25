from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import sqlite3
import secrets
import threading
import unicodedata
from collections import Counter
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
CSRF_HEADER_NAME = "X-CSRF-Token"
PASSWORD_HASH_ITERATIONS = 210000
SESSION_DAYS = int(os.environ.get("SESSION_DAYS", "7"))
SESSION_SECURE = os.environ.get("SESSION_SECURE", "0").lower() in {"1", "true", "yes"}
APP_ORIGIN = os.environ.get("APP_ORIGIN", "").strip().rstrip("/")
TEAMS_OUTGOING_WEBHOOK_SECRET = os.environ.get("TEAMS_OUTGOING_WEBHOOK_SECRET", "").strip()
LOGIN_RATE_LIMIT_MAX_ATTEMPTS = int(os.environ.get("LOGIN_RATE_LIMIT_MAX_ATTEMPTS", "10"))
LOGIN_RATE_LIMIT_WINDOW_SECONDS = int(os.environ.get("LOGIN_RATE_LIMIT_WINDOW_SECONDS", "600"))
LOGIN_RATE_LIMIT_BLOCK_SECONDS = int(os.environ.get("LOGIN_RATE_LIMIT_BLOCK_SECONDS", "900"))

ENTRY_TYPES = {"bug", "near_miss"}
SEVERITIES = {"low", "medium", "high", "incident", "critical"}
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

AREA_CHOICES = (
    "AlzaBoxy",
    "Pobočky",
    "Sklad",
    "Dropshipment",
    "Zpětný tok",
    "WebAdmin",
    "IT BUG",
    "Tracking",
)
AREA_CHOICES_SET = set(AREA_CHOICES)
AREA_EMPTY_LABEL = "Nevyplněno"

SEARCH_STOPWORDS = {
    "a",
    "ale",
    "ani",
    "asi",
    "bez",
    "by",
    "byl",
    "byla",
    "bylo",
    "byly",
    "co",
    "do",
    "ho",
    "i",
    "jak",
    "je",
    "jen",
    "ji",
    "jsem",
    "jsme",
    "jsi",
    "jsou",
    "jste",
    "k",
    "kde",
    "kdy",
    "ke",
    "kdo",
    "ma",
    "má",
    "mi",
    "mne",
    "mě",
    "na",
    "nad",
    "ne",
    "ně",
    "nebo",
    "o",
    "od",
    "po",
    "pro",
    "při",
    "se",
    "si",
    "s",
    "u",
    "v",
    "ve",
    "za",
    "z",
    "už",
    "tak",
    "ten",
    "to",
    "tu",
    "toto",
    "tam",
    "tady",
    "tím",
    "tímto",
    "jenž",
    "jej",
    "její",
    "jeho",
    "jich",
    "jí",
}

SEVERITY_LABELS = {
    "low": "Nízká",
    "medium": "Střední",
    "high": "Vysoká",
    "incident": "Incident",
    "critical": "Kritická",
}


ROLE_LABELS = {
    "admin": "Admin",
    "user": "Uživatel",
}


EMAIL_PATTERN = re.compile(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$"
)

AVATAR_DATA_URL_PATTERN = re.compile(
    r"^data:(image/(?:png|jpe?g|gif|webp));base64,([A-Za-z0-9+/=\s]+)$",
    re.IGNORECASE,
)
MAX_AVATAR_BYTES = 1_000_000

LOGIN_RATE_LIMIT_STATE: dict[str, dict[str, object]] = {}
LOGIN_RATE_LIMIT_LOCK = threading.Lock()

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


def ensure_postgres_column(conn, table_name: str, column_name: str, definition: str) -> None:
    conn.execute(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS {column_name} {definition}")


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
                area TEXT,
                problem_reporter TEXT,
                culprit TEXT,
                created_by_user_id INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                CHECK (entry_type IN ('bug', 'near_miss')),
                CHECK (severity IN ('low', 'medium', 'high', 'incident', 'critical')),
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
                area,
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
                NULL AS area,
                created_by_user_id,
                created_at,
                updated_at
            FROM entries_legacy
            """
        )
        conn.execute("DROP TABLE entries_legacy")


def migrate_entries_table(conn: sqlite3.Connection) -> None:
    entries_schema_row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'entries'"
    ).fetchone()
    entries_schema_sql = (entries_schema_row["sql"] if entries_schema_row else "") or ""
    if "'incident'" in entries_schema_sql:
        return

    existing_columns = table_columns(conn, "entries")
    if not existing_columns:
        return

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
            area TEXT,
            problem_reporter TEXT,
            culprit TEXT,
            created_by_user_id INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            CHECK (entry_type IN ('bug', 'near_miss')),
            CHECK (severity IN ('low', 'medium', 'high', 'incident', 'critical')),
            CHECK (status IN ('new', 'in_progress', 'resolved', 'closed')),
            FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
        )
        """
    )
    area_expr = "area" if "area" in existing_columns else "NULL AS area"
    problem_reporter_expr = (
        "problem_reporter" if "problem_reporter" in existing_columns else "NULL AS problem_reporter"
    )
    culprit_expr = "culprit" if "culprit" in existing_columns else "NULL AS culprit"
    created_by_expr = (
        "created_by_user_id" if "created_by_user_id" in existing_columns else "NULL AS created_by_user_id"
    )
    conn.execute(
        f"""
        INSERT INTO entries (
            id,
            title,
            description,
            entry_type,
            severity,
            status,
            area,
            problem_reporter,
            culprit,
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
            {area_expr},
            {problem_reporter_expr},
            {culprit_expr},
            {created_by_expr},
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
                    avatar_url TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    CHECK (role IN ('admin', 'user')),
                    CHECK (is_active IN (0, 1))
                )
                """
            )
            ensure_postgres_column(conn, "users", "avatar_url", "TEXT")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    token_hash TEXT NOT NULL UNIQUE,
                    csrf_token TEXT,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
                """
            )
            ensure_postgres_column(conn, "sessions", "csrf_token", "TEXT")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS entries (
                    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    entry_type TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    status TEXT NOT NULL,
                    area TEXT,
                    problem_reporter TEXT,
                    culprit TEXT,
                    created_by_user_id BIGINT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    CHECK (entry_type IN ('bug', 'near_miss')),
                    CHECK (severity IN ('low', 'medium', 'high', 'incident', 'critical')),
                    CHECK (status IN ('new', 'in_progress', 'resolved', 'closed')),
                    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
                )
                """
            )
            ensure_postgres_column(conn, "entries", "area", "TEXT")
            ensure_postgres_column(conn, "entries", "problem_reporter", "TEXT")
            ensure_postgres_column(conn, "entries", "culprit", "TEXT")
        else:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'user',
                    is_active INTEGER NOT NULL DEFAULT 1,
                    avatar_url TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    CHECK (role IN ('admin', 'user')),
                    CHECK (is_active IN (0, 1))
                )
                """
            )
            migrate_users_table(conn)
            ensure_column(conn, "users", "avatar_url", "TEXT")
            repair_foreign_key_tables(conn)
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    token_hash TEXT NOT NULL UNIQUE,
                    csrf_token TEXT,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
                """
            )
            ensure_column(conn, "sessions", "csrf_token", "TEXT")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS entries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    entry_type TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    status TEXT NOT NULL,
                    area TEXT,
                    problem_reporter TEXT,
                    culprit TEXT,
                    created_by_user_id INTEGER,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    CHECK (entry_type IN ('bug', 'near_miss')),
                    CHECK (severity IN ('low', 'medium', 'high', 'incident', 'critical')),
                    CHECK (status IN ('new', 'in_progress', 'resolved', 'closed')),
                    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
                )
                """
            )
            ensure_column(conn, "entries", "created_by_user_id", "INTEGER")
            ensure_column(conn, "entries", "area", "TEXT")
            ensure_column(conn, "entries", "problem_reporter", "TEXT")
            ensure_column(conn, "entries", "culprit", "TEXT")
            migrate_entries_table(conn)


def now_dt() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now_dt().isoformat()


def normalize_email(email: str) -> str:
    return email.strip().lower()


def normalize_avatar_url(value: object) -> str | None:
    if value is None:
        return None

    text = str(value).strip()
    if not text:
        return None

    match = AVATAR_DATA_URL_PATTERN.fullmatch(text)
    if not match:
        raise ValueError("Profilový obrázek musí být nahraný jako PNG, JPG, GIF nebo WEBP.")

    mime_type = match.group(1).lower()
    encoded = re.sub(r"\s+", "", match.group(2))

    try:
        decoded = base64.b64decode(encoded, validate=True)
    except Exception as exc:
        raise ValueError("Profilový obrázek je poškozený.") from exc

    if len(decoded) > MAX_AVATAR_BYTES:
        raise ValueError("Profilový obrázek je příliš velký. Zkus menší soubor.")

    return f"data:{mime_type};base64,{base64.b64encode(decoded).decode('ascii')}"


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
    if not normalized or len(normalized) > 254 or not EMAIL_PATTERN.fullmatch(normalized):
        raise ValueError("Zadej platný email.")
    if not normalized or "@" not in normalized:
        raise ValueError("Zadej platný email.")
    return normalized


def validate_password(password: str) -> str:
    value = str(password or "")
    if len(value) < 8:
        raise create_password_error()
    return value


def client_ip(handler: BaseHTTPRequestHandler) -> str:
    return str(handler.client_address[0] if handler.client_address else "unknown")


def login_rate_limit_key(ip: str) -> str:
    return f"login:{ip}"


def login_rate_limit_check(ip: str) -> int | None:
    now = now_dt().timestamp()
    key = login_rate_limit_key(ip)
    with LOGIN_RATE_LIMIT_LOCK:
        state = LOGIN_RATE_LIMIT_STATE.get(key)
        if not state:
            return None

        blocked_until = float(state.get("blocked_until", 0.0) or 0.0)
        if blocked_until > now:
            return max(1, int(blocked_until - now))

        attempts = [float(value) for value in state.get("attempts", []) if now - float(value) <= LOGIN_RATE_LIMIT_WINDOW_SECONDS]
        if not attempts:
            LOGIN_RATE_LIMIT_STATE.pop(key, None)
            return None

        state["attempts"] = attempts
        if len(attempts) >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS:
            state["blocked_until"] = now + LOGIN_RATE_LIMIT_BLOCK_SECONDS
            state["attempts"] = []
            return LOGIN_RATE_LIMIT_BLOCK_SECONDS

        return None


def login_rate_limit_fail(ip: str) -> None:
    now = now_dt().timestamp()
    key = login_rate_limit_key(ip)
    with LOGIN_RATE_LIMIT_LOCK:
        state = LOGIN_RATE_LIMIT_STATE.setdefault(key, {"attempts": [], "blocked_until": 0.0})
        attempts = [float(value) for value in state.get("attempts", []) if now - float(value) <= LOGIN_RATE_LIMIT_WINDOW_SECONDS]
        attempts.append(now)
        state["attempts"] = attempts
        state["blocked_until"] = 0.0
        if len(attempts) >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS:
            state["blocked_until"] = now + LOGIN_RATE_LIMIT_BLOCK_SECONDS
            state["attempts"] = []


def login_rate_limit_clear(ip: str) -> None:
    with LOGIN_RATE_LIMIT_LOCK:
        LOGIN_RATE_LIMIT_STATE.pop(login_rate_limit_key(ip), None)


def security_headers(content_type: str) -> list[tuple[str, str]]:
    headers = [
        ("X-Content-Type-Options", "nosniff"),
        ("X-Frame-Options", "DENY"),
        ("Referrer-Policy", "same-origin"),
        ("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()"),
    ]
    if content_type.startswith("text/html"):
        headers.append(
            (
                "Content-Security-Policy",
                "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; "
                "script-src 'self'; style-src 'self' https://fonts.googleapis.com; "
                "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'",
            )
        )
    if SESSION_SECURE:
        headers.append(("Strict-Transport-Security", "max-age=31536000; includeSubDomains"))
    return headers


def request_origin(handler: BaseHTTPRequestHandler) -> str | None:
    origin = handler.headers.get("Origin")
    if origin:
        return origin.rstrip("/")

    referer = handler.headers.get("Referer")
    if not referer:
        return None

    parsed = urlparse(referer)
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def expected_origin(handler: BaseHTTPRequestHandler) -> str | None:
    if APP_ORIGIN:
        return APP_ORIGIN

    host = (handler.headers.get("Host") or "").strip()
    if not host:
        return None

    forwarded_proto = (handler.headers.get("X-Forwarded-Proto") or "").split(",")[0].strip().lower()
    scheme = forwarded_proto if forwarded_proto in {"http", "https"} else "http"
    return f"{scheme}://{host}".rstrip("/")


def reject_cross_origin(handler: BaseHTTPRequestHandler) -> bool:
    incoming = request_origin(handler)
    if incoming is None:
        return True

    expected = expected_origin(handler)
    if expected is None or incoming == expected:
        return True

    json_response(handler, {"error": "Neplatný původ požadavku."}, HTTPStatus.FORBIDDEN)
    return False


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
    for header, value in security_headers("application/json; charset=utf-8"):
        handler.send_header(header, value)
    for header, value in headers or []:
        handler.send_header(header, value)
    handler.end_headers()
    handler.wfile.write(body)


def read_body(handler: BaseHTTPRequestHandler) -> bytes:
    length = int(handler.headers.get("Content-Length", "0"))
    return handler.rfile.read(length) if length else b""


def parse_json_body(raw: bytes) -> dict:
    try:
        data = json.loads(raw.decode("utf-8") if raw else "{}")
    except json.JSONDecodeError as exc:
        raise ValueError("Neplatné JSON tělo.") from exc
    if not isinstance(data, dict):
        raise ValueError("JSON musí být objekt.")
    return data


def read_json(handler: BaseHTTPRequestHandler) -> dict:
    return parse_json_body(read_body(handler))


def user_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "email": row["email"],
        "role": row["role"],
        "role_label": ROLE_LABELS.get(row["role"], row["role"]),
        "is_active": bool(row["is_active"]),
        "avatar_url": row["avatar_url"] if "avatar_url" in row.keys() else None,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def row_to_dict(row: sqlite3.Row) -> dict:
    created_by_email = row["created_by_email"] if "created_by_email" in row.keys() else None
    area = row["area"] if "area" in row.keys() else None
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
        "area": area,
        "area_label": area or AREA_EMPTY_LABEL,
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


def normalize_area_choice(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text not in AREA_CHOICES_SET:
        raise ValueError("Neplatná oblast.")
    return text


def normalize_search_text(value: object) -> str:
    text = str(value or "").strip().lower()
    normalized = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def public_app_origin() -> str:
    return (
        APP_ORIGIN
        or os.environ.get("RENDER_EXTERNAL_URL", "").strip().rstrip("/")
        or "https://process-near-miss.onrender.com"
    )


def entry_detail_url(entry_id: int) -> str:
    return f"{public_app_origin()}/?entry={entry_id}"


def split_search_terms(query: str) -> list[str]:
    normalized = normalize_search_text(query)
    terms = [
        term
        for term in re.split(r"[^a-z0-9]+", normalized)
        if len(term) >= 3 and term not in SEARCH_STOPWORDS
    ]
    seen: set[str] = set()
    deduped: list[str] = []
    for term in terms:
        if term in seen:
            continue
        seen.add(term)
        deduped.append(term)
    return deduped


def teams_mention_text(text: str) -> str:
    cleaned = re.sub(r"<at>.*?</at>", "", text, flags=re.IGNORECASE)
    cleaned = re.sub(r"@\S+", "", cleaned)
    return " ".join(cleaned.split()).strip()


def teams_hmac_is_valid(handler: BaseHTTPRequestHandler, body: bytes) -> bool:
    if not TEAMS_OUTGOING_WEBHOOK_SECRET:
        return False

    header_value = (handler.headers.get("Authorization") or handler.headers.get("hmac") or "").strip()
    if not header_value:
        return False

    provided_signature = header_value
    if header_value.lower().startswith("hmac "):
        provided_signature = header_value[5:].strip()

    try:
        key_bytes = base64.b64decode(TEAMS_OUTGOING_WEBHOOK_SECRET, validate=True)
    except Exception:
        return False

    calculated = base64.b64encode(hmac.new(key_bytes, body, hashlib.sha256).digest()).decode("ascii")
    return secrets.compare_digest(provided_signature, calculated)


def entry_search_blob(entry: dict) -> str:
    parts = [
        entry.get("title", ""),
        entry.get("description", ""),
        entry.get("entry_type_label", ""),
        entry.get("severity_label", ""),
        entry.get("status_label", ""),
        entry.get("area_label", ""),
        entry.get("problem_reporter_label", ""),
        entry.get("culprit_label", ""),
        entry.get("created_by_label", ""),
    ]
    return normalize_search_text(" ".join(str(part) for part in parts))


def entry_words(value: object) -> list[tuple[str, str]]:
    raw_words = re.findall(r"[0-9A-Za-zÀ-ž]+", str(value or ""))
    result: list[tuple[str, str]] = []
    for word in raw_words:
        normalized = normalize_search_text(word)
        if normalized:
            result.append((word, normalized))
    return result


def collect_field_matches(value: object, terms: list[str], limit: int = 4) -> list[str]:
    if not terms:
        return []

    matches: list[str] = []
    seen: set[str] = set()
    for original, normalized in entry_words(value):
        for term in terms:
            if not term or len(term) < 2:
                continue
            if normalized == term or normalized.startswith(term) or term.startswith(normalized):
                key = normalized
                if key in seen:
                    break
                seen.add(key)
                matches.append(original)
                break
        if len(matches) >= limit:
            break
    return matches


def normalize_terms_for_display(terms: list[str]) -> list[str]:
    return list(dict.fromkeys(term for term in terms if term and term not in SEARCH_STOPWORDS))


def build_description_excerpt(description: str, terms: list[str], window: int = 42) -> str:
    if not description:
        return ""

    normalized_description = normalize_search_text(description)
    best_index: int | None = None
    best_term: str | None = None
    for term in terms:
        if len(term) < 3:
            continue
        index = normalized_description.find(term)
        if index == -1:
            continue
        if best_index is None or index < best_index:
            best_index = index
            best_term = term

    if best_index is None or best_term is None:
        return ""

    raw_text = " ".join(str(description).strip().split())
    raw_index = raw_text.lower().find(best_term)
    if raw_index == -1:
        raw_index = 0
    start = max(0, raw_index - window)
    end = min(len(raw_text), raw_index + len(best_term) + window)
    excerpt = raw_text[start:end]
    if start > 0:
        excerpt = f"…{excerpt}"
    if end < len(raw_text):
        excerpt = f"{excerpt}…"
    return excerpt


def format_match_summary(details: dict[str, list[str]], description: str = "") -> str:
    parts: list[str] = []
    title_terms = normalize_terms_for_display(details.get("title_terms", []))
    if title_terms:
        parts.append(f"název: {', '.join(title_terms)}")

    description_terms = normalize_terms_for_display(details.get("description_terms", []))
    if description_terms:
        parts.append(f"popis: {', '.join(description_terms)}")

    area_terms = normalize_terms_for_display(details.get("area_terms", []))
    if area_terms:
        parts.append(f"oblast: {', '.join(area_terms)}")

    reporter_terms = normalize_terms_for_display(details.get("reporter_terms", []))
    if reporter_terms:
        parts.append(f"zadavatel: {', '.join(reporter_terms)}")

    type_terms = normalize_terms_for_display(details.get("type_terms", []))
    if type_terms:
        parts.append(f"typ: {', '.join(type_terms)}")

    severity_terms = normalize_terms_for_display(details.get("severity_terms", []))
    if severity_terms:
        parts.append(f"závažnost: {', '.join(severity_terms)}")

    status_terms = normalize_terms_for_display(details.get("status_terms", []))
    if status_terms:
        parts.append(f"stav: {', '.join(status_terms)}")

    excerpt_terms = description_terms or title_terms
    excerpt = build_description_excerpt(description, excerpt_terms)
    if excerpt:
        parts.append(f"úryvek: {excerpt}")

    return "; ".join(parts)


def score_entry_for_query(entry: dict, terms: list[str]) -> tuple[int, list[str], dict[str, list[str]]]:
    if not terms:
        return 0, [], {}

    score = 0
    reasons: list[str] = []
    details: dict[str, list[str]] = {}

    title = normalize_search_text(entry.get("title", ""))
    description = normalize_search_text(entry.get("description", ""))
    area = normalize_search_text(entry.get("area_label", ""))
    culprit = normalize_search_text(entry.get("culprit_label", ""))
    reporter = normalize_search_text(entry.get("problem_reporter_label", ""))
    entry_type = normalize_search_text(entry.get("entry_type_label", ""))
    severity = normalize_search_text(entry.get("severity_label", ""))
    status = normalize_search_text(entry.get("status_label", ""))
    blob = entry_search_blob(entry)
    title_terms = normalize_terms_for_display(collect_field_matches(entry.get("title", ""), terms))
    description_terms = normalize_terms_for_display(collect_field_matches(entry.get("description", ""), terms))
    area_terms = normalize_terms_for_display(collect_field_matches(entry.get("area_label", ""), terms))
    reporter_terms = normalize_terms_for_display(collect_field_matches(entry.get("problem_reporter_label", ""), terms))
    type_terms = normalize_terms_for_display(collect_field_matches(entry.get("entry_type_label", ""), terms))
    severity_terms = normalize_terms_for_display(collect_field_matches(entry.get("severity_label", ""), terms))
    status_terms = normalize_terms_for_display(collect_field_matches(entry.get("status_label", ""), terms))
    details = {
        "title_terms": title_terms,
        "description_terms": description_terms,
        "area_terms": area_terms,
        "reporter_terms": reporter_terms,
        "type_terms": type_terms,
        "severity_terms": severity_terms,
        "status_terms": status_terms,
    }

    if area_terms:
        score += 7 * len(area_terms)
        reasons.append(f"oblast {entry.get('area_label')}")

    if reporter_terms:
        score += 4 * len(reporter_terms)
        reasons.append(f"zadavatel {entry.get('problem_reporter_label')}")

    if title_terms:
        score += 6 * len(title_terms)
        reasons.append("shoda v názvu")

    if description_terms:
        score += 3 * len(description_terms)
        reasons.append("shoda v popisu")

    if type_terms:
        score += 2 * len(type_terms)
        reasons.append(f"typ {entry.get('entry_type_label')}")

    if severity_terms:
        score += len(severity_terms)
        reasons.append(f"závažnost {entry.get('severity_label')}")

    if status_terms:
        score += len(status_terms)
        reasons.append(f"stav {entry.get('status_label')}")

    matched_tokens = {normalize_search_text(token) for values in details.values() for token in values}
    for term in terms:
        if term in blob and not any(term == token or term in token or token in term for token in matched_tokens):
            score += 1

    return score, list(dict.fromkeys(reasons)), details


def similar_entries_for_query(query: str, limit: int = 5) -> list[dict]:
    items = list_entries()
    terms = split_search_terms(query)
    if not terms:
        return [
            {
                **entry,
                "_match_score": 0,
                "_match_reasons": [],
                "_match_details": {},
            }
            for entry in items[: max(0, limit)]
        ]

    scored: list[tuple[int, dict, list[str], dict[str, list[str]]]] = []
    for item in items:
        score, reasons, details = score_entry_for_query(item, terms)
        scored.append((score, item, reasons, details))

    scored.sort(
        key=lambda item: (
            item[0],
            str(item[1].get("updated_at", "")),
            int(item[1].get("id", 0)),
        ),
        reverse=True,
    )

    top = [item for item in scored if item[0] > 0][: max(1, limit)]
    if top:
        return [
            {
                **entry,
                "_match_score": score,
                "_match_reasons": reasons,
                "_match_details": details,
            }
            for score, entry, reasons, details in top
        ]

    fallback = items[: max(0, limit)]
    return [
        {
            **entry,
            "_match_score": 0,
            "_match_reasons": [],
            "_match_details": {},
        }
        for entry in fallback
    ]


def build_teams_reply(query: str, limit: int = 3) -> dict:
    cleaned_query = teams_mention_text(query)
    matches = similar_entries_for_query(cleaned_query, limit=limit)
    if not matches:
        return {
            "type": "message",
            "text": "V databázi zatím nejsou žádné incidenty nebo near miss záznamy.",
        }

    if not cleaned_query:
        lines = ["**Nemám konkrétní dotaz, takže posílám nejnovější záznamy.**"]
    else:
        lines = [f"**Hledal jsem podobné záznamy pro:** {cleaned_query}"]

    lines.append(f"Našel jsem **{len(matches)}** podobné záznamy seřazené podle relevance.")
    lines.append("")

    for idx, item in enumerate(matches, start=1):
        reasons = item.get("_match_reasons") or []
        match_details = item.get("_match_details") or {}
        reason_text = format_match_summary(match_details, item.get("description", "")) if match_details else ""
        if not reason_text:
            reason_text = ", ".join(reasons) if reasons else "nejnovější relevantní záznam"
        detail_url = entry_detail_url(int(item["id"]))
        lines.extend(
            [
                f"**{idx}. #{item['id']} {item['title']}**",
                f"- Oblast: {item['area_label']}",
                f"- Stav: {item['status_label']} | Priorita: {item['severity_label']}",
                f"- Proč je podobný: {reason_text}",
                f"- Detail: [otevřít issue]({detail_url})",
                "",
            ]
        )

    return {"type": "message", "text": "\n".join(lines)}


def log_teams_event(message: str) -> None:
    print(f"[teams] {message}", flush=True)


def session_expires_at() -> str:
    return (now_dt() + timedelta(days=SESSION_DAYS)).isoformat()


def csrf_token() -> str:
    return secrets.token_urlsafe(32)


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

    if "avatar_url" in data:
        allowed_fields["avatar_url"] = normalize_avatar_url(data.get("avatar_url"))

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


def create_session(user_id: int) -> tuple[str, str, str]:
    token = secrets.token_urlsafe(32)
    token_hash = hash_token(token)
    csrf = csrf_token()
    created_at = now_iso()
    expires_at = session_expires_at()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO sessions (user_id, token_hash, csrf_token, created_at, expires_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (user_id, token_hash, csrf, created_at, expires_at, created_at),
        )
    return token, expires_at, csrf


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
            SELECT u.*, s.csrf_token AS csrf_token
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_active = 1
            """,
            (token_hash, current),
        ).fetchone()
        if row is not None:
            if "csrf_token" not in row.keys() or not row["csrf_token"]:
                conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
                return None
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


def require_csrf(handler: BaseHTTPRequestHandler, user: sqlite3.Row) -> bool:
    expected = str(user["csrf_token"] or "")
    provided = handler.headers.get(CSRF_HEADER_NAME, "")
    if not expected or not provided or not secrets.compare_digest(provided, expected):
        json_response(handler, {"error": "Neplatný CSRF token."}, HTTPStatus.FORBIDDEN)
        return False
    return True


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
    area = normalize_area_choice(data.get("area"))
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
                area,
                problem_reporter,
                culprit,
                created_by_user_id,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
            """,
            (
                title,
                description,
                entry_type,
                severity,
                status,
                area,
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
    if "area" in data:
        allowed_fields["area"] = normalize_area_choice(data["area"])
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
            json_response(self, {"user": user_to_dict(user), "csrfToken": user["csrf_token"]})
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
        if path == "/api/teams/outgoing-webhook":
            try:
                body = read_body(self)
                log_teams_event(
                    f"request from {client_ip(self)} len={len(body)} auth={'yes' if (self.headers.get('Authorization') or self.headers.get('hmac')) else 'no'}"
                )
                if not teams_hmac_is_valid(self, body):
                    log_teams_event("invalid HMAC")
                    json_response(self, {"error": "Neplatná Teams HMAC autentizace."}, HTTPStatus.UNAUTHORIZED)
                    return
                data = parse_json_body(body)
                query = str(data.get("text", "") or "")
                log_teams_event(f"query={query!r}")
                limit_value = data.get("limit", 5)
                try:
                    limit = int(limit_value)
                except (TypeError, ValueError):
                    limit = 5
                limit = max(1, min(limit, 3))
                response = build_teams_reply(query, limit=limit)
                log_teams_event(f"reply_type={response.get('type')} chars={len(str(response.get('text', '')))}")
                json_response(self, response)
            except ValueError as exc:
                log_teams_event(f"bad request: {exc}")
                json_response(self, {"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return

        if path == "/api/bootstrap/admin":
            try:
                if not reject_cross_origin(self):
                    return
                ip = client_ip(self)
                retry_after = login_rate_limit_check(ip)
                if retry_after is not None:
                    json_response(
                        self,
                        {"error": "Příliš mnoho pokusů. Zkus to později."},
                        HTTPStatus.TOO_MANY_REQUESTS,
                        headers=[("Retry-After", str(retry_after))],
                    )
                    return
                if user_count() > 0:
                    json_response(self, {"error": "Počáteční administrátor už existuje."}, HTTPStatus.CONFLICT)
                    return
                data = read_json(self)
                user = bootstrap_admin(data)
                token, expires_at, csrf = create_session(user["id"])
                json_response(
                    self,
                    {"user": user, "csrfToken": csrf},
                    HTTPStatus.CREATED,
                    headers=[("Set-Cookie", session_cookie_header(token, expires_at))],
                )
                login_rate_limit_clear(ip)
            except ValueError as exc:
                login_rate_limit_fail(client_ip(self))
                json_response(self, {"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return

        if path == "/api/auth/login":
            try:
                if not reject_cross_origin(self):
                    return
                ip = client_ip(self)
                retry_after = login_rate_limit_check(ip)
                if retry_after is not None:
                    json_response(
                        self,
                        {"error": "Příliš mnoho pokusů. Zkus to později."},
                        HTTPStatus.TOO_MANY_REQUESTS,
                        headers=[("Retry-After", str(retry_after))],
                    )
                    return
                data = read_json(self)
                user = login_user(data)
                token, expires_at, csrf = create_session(user["id"])
                json_response(
                    self,
                    {"user": user, "csrfToken": csrf},
                    headers=[("Set-Cookie", session_cookie_header(token, expires_at))],
                )
                login_rate_limit_clear(ip)
            except ValueError as exc:
                login_rate_limit_fail(client_ip(self))
                json_response(self, {"error": str(exc)}, HTTPStatus.UNAUTHORIZED)
            return

        if path == "/api/auth/logout":
            user = require_user(self)
            if user is None:
                return
            if not require_csrf(self, user):
                return
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
            if not require_csrf(self, user):
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
            if not require_csrf(self, user):
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
            if not require_csrf(self, user):
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
            if not require_csrf(self, user):
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
                if not require_csrf(self, user):
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
            if not require_csrf(self, user):
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
        user = require_user(self)
        if user is None:
            return
        if not require_csrf(self, user):
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
        user = require_user(self)
        if user is None:
            return
        if not require_csrf(self, user):
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
        for header, value in security_headers(content_type):
            self.send_header(header, value)
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

