import os
import builtins
import math
import time
import sqlite3
import threading

import requests

from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

from flask import (
    Flask,
    jsonify,
    render_template,
    request,
    send_file
)

from export import (
    get_messages_by_extensions,
    generate_excel_from_messages
)


# =========================================================
# ENV
# =========================================================

load_dotenv()


# =========================================================
# CONFIG
# =========================================================

DB_FILE = "sms_monitor.db"

RC_BASE_URL = (
    "https://platform.ringcentral.com"
)

CLIENT_ID = os.getenv(
    "RINGCENTRAL_CLIENT_ID"
)

CLIENT_SECRET = os.getenv(
    "RINGCENTRAL_CLIENT_SECRET"
)

JWT = os.getenv(
    "RINGCENTRAL_JWT"
)


# ---------------------------------------------------------
# SYNC CONFIG
# ---------------------------------------------------------

# 1 = sync enabled
# 0 = sync disabled
SYNC_ENABLED = (
    os.getenv(
        "SYNC_ENABLED",
        "0"
    ).strip().lower()
    not in (
        "0",
        "false",
        "no",
        "off"
    )
)

# Каждые 10 минут
SYNC_INTERVAL = 10 * 60

# Берём последние 30 минут
SYNC_WINDOW = 30 * 60

# ~46 запросов / минуту
REQUEST_INTERVAL = 1.3

# API page size
SYNC_PER_PAGE = 100


# =========================================================
# FLASK
# =========================================================

app = Flask(__name__)


def print(*values, **kwargs):
    builtins.print(
        datetime.now().astimezone().strftime(
            "[%Y-%m-%d %H:%M:%S %z]"
        ),
        *values,
        **kwargs
    )


def export_filter_value(value):
    if not value:
        return None

    if len(value) == 10:
        return value

    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))

    if parsed.tzinfo is None:
        parsed = parsed.replace(
            tzinfo=ZoneInfo("Europe/Kyiv")
        )

    return parsed.astimezone(timezone.utc).isoformat()


# =========================================================
# DATABASE
# =========================================================

def get_connection():

    conn = sqlite3.connect(
        DB_FILE,
        check_same_thread=False,
        timeout=30
    )

    conn.row_factory = sqlite3.Row

    return conn


def init_database():

    conn = get_connection()

    cursor = conn.cursor()

    # -----------------------------------------------------
    # EXTENSIONS
    # -----------------------------------------------------

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS extensions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            extension_id INTEGER UNIQUE NOT NULL,

            extension_number TEXT,

            name TEXT,

            type TEXT,

            active INTEGER DEFAULT 1,

            last_sync TEXT
        )
    """)

    # -----------------------------------------------------
    # MESSAGES
    # -----------------------------------------------------

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            ringcentral_id INTEGER UNIQUE NOT NULL,

            extension_id INTEGER NOT NULL,

            from_number TEXT,

            to_number TEXT,

            direction TEXT,

            message TEXT,

            status TEXT,

            creation_time TEXT,

            delivery_time TEXT,

            last_updated TEXT,

            FOREIGN KEY (
                extension_id
            )
            REFERENCES extensions (
                extension_id
            )
        )
    """)

    # -----------------------------------------------------
    # INDEXES
    # -----------------------------------------------------

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS
        idx_messages_extension
        ON messages(extension_id)
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS
        idx_messages_status
        ON messages(status)
    """)

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS
        idx_messages_creation
        ON messages(creation_time)
    """)

    conn.commit()

    conn.close()


# Создаём БД/таблицы
init_database()


# =========================================================
# RINGCENTRAL AUTH
# =========================================================

def get_access_token():

    if not CLIENT_ID:
        raise RuntimeError(
            "RINGCENTRAL_CLIENT_ID is not configured"
        )

    if not CLIENT_SECRET:
        raise RuntimeError(
            "RINGCENTRAL_CLIENT_SECRET is not configured"
        )

    if not JWT:
        raise RuntimeError(
            "RINGCENTRAL_JWT is not configured"
        )

    print(
        "[SYNC] Getting access token..."
    )

    response = requests.post(
        f"{RC_BASE_URL}/restapi/oauth/token",

        auth=(
            CLIENT_ID,
            CLIENT_SECRET
        ),

        data={
            "grant_type":
                "urn:ietf:params:oauth:"
                "grant-type:jwt-bearer",

            "assertion": JWT
        },

        timeout=30
    )

    response.raise_for_status()

    token = response.json()[
        "access_token"
    ]

    print(
        "[SYNC] Access token received."
    )

    return token


# =========================================================
# RINGCENTRAL GET
# =========================================================

def rc_get(
    access_token,
    endpoint,
    params=None,
    max_retries=5
):

    for attempt in range(
        max_retries
    ):

        response = requests.get(

            f"{RC_BASE_URL}"
            f"{endpoint}",

            headers={
                "Authorization":
                    f"Bearer {access_token}"
            },

            params=params,

            timeout=30
        )

        # -------------------------------------------------
        # RATE LIMIT
        # -------------------------------------------------

        if response.status_code == 429:

            retry_after = (
                response.headers.get(
                    "Retry-After"
                )
            )

            if retry_after:

                try:
                    wait_time = int(
                        retry_after
                    )

                except ValueError:

                    wait_time = 5

            else:

                wait_time = min(
                    5 * (2 ** attempt),
                    60
                )

            print(
                "[SYNC] Rate limit. "
                f"Waiting {wait_time}s..."
            )

            time.sleep(
                wait_time
            )

            continue

        # -------------------------------------------------
        # AUTH
        # -------------------------------------------------

        if response.status_code == 401:

            raise requests.exceptions.HTTPError(
                "401 Unauthorized",
                response=response
            )

        response.raise_for_status()

        return response.json()

    raise RuntimeError(
        "RingCentral rate limit retries exceeded"
    )


# =========================================================
# TIME
# =========================================================

def now_utc():

    return datetime.now(
        timezone.utc
    )


def iso_utc(dt):

    return dt.astimezone(
        timezone.utc
    ).replace(
        microsecond=0
    ).isoformat().replace(
        "+00:00",
        "Z"
    )


# =========================================================
# GET ACTIVE EXTENSIONS FROM LOCAL DATABASE
# =========================================================

def get_active_extensions():

    conn = get_connection()

    rows = conn.execute("""
        SELECT
            extension_id,
            extension_number,
            name,
            type
        FROM extensions
        WHERE active = 1
        ORDER BY extension_number
    """).fetchall()

    conn.close()

    return rows


# =========================================================
# GET SMS FOR ONE EXTENSION
# =========================================================

def get_recent_messages(
    access_token,
    extension_id
):

    all_messages = []

    page = 1

    # -----------------------------------------------------
    # 30 MINUTES WINDOW
    #
    # Небольшой overlap уже обеспечен:
    # цикл каждые 10 минут,
    # окно 30 минут.
    # -----------------------------------------------------

    date_from = (
        now_utc()
        - timedelta(
            seconds=SYNC_WINDOW
        )
    )

    date_from_iso = iso_utc(
        date_from
    )

    while True:

        print(
            f"    Loading page {page}..."
        )

        data = rc_get(

            access_token,

            f"/restapi/v1.0/account/~/"
            f"extension/{extension_id}/"
            f"message-store",

            {
                "messageType": "SMS",

                "perPage":
                    SYNC_PER_PAGE,

                "page":
                    page,

                "dateFrom":
                    date_from_iso
            }
        )

        records = data.get(
            "records",
            []
        )

        all_messages.extend(
            records
        )

        paging = data.get(
            "paging",
            {}
        )

        total_pages = paging.get(
            "totalPages",
            1
        )

        print(
            f"    Page {page}/"
            f"{total_pages}: "
            f"{len(records)} messages"
        )

        if page >= total_pages:
            break

        page += 1

        # -------------------------------------------------
        # Rate limit protection
        # -------------------------------------------------

        time.sleep(
            REQUEST_INTERVAL
        )

    return all_messages


# =========================================================
# SAVE MESSAGES
# =========================================================

def save_messages(
    extension_id,
    records
):

    if not records:
        return 0

    conn = get_connection()

    cursor = conn.cursor()

    count = 0

    sync_time = iso_utc(
        now_utc()
    )

    for message in records:

        # -------------------------------------------------
        # TO
        # -------------------------------------------------

        to_number = ""

        to_list = message.get(
            "to"
        )

        if to_list:

            to_number = (
                to_list[0].get(
                    "phoneNumber",
                    ""
                )
                or ""
            )

        # -------------------------------------------------
        # FROM
        # -------------------------------------------------

        from_number = (
            message.get(
                "from",
                {}
            ).get(
                "phoneNumber",
                ""
            )
            or ""
        )

        # -------------------------------------------------
        # SAVE / UPDATE
        # -------------------------------------------------

        cursor.execute("""
            INSERT INTO messages (

                ringcentral_id,

                extension_id,

                from_number,

                to_number,

                direction,

                message,

                status,

                creation_time,

                delivery_time,

                last_updated

            )

            VALUES (
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?
            )

            ON CONFLICT(
                ringcentral_id
            )

            DO UPDATE SET

                extension_id =
                    excluded.extension_id,

                from_number =
                    excluded.from_number,

                to_number =
                    excluded.to_number,

                direction =
                    excluded.direction,

                message =
                    excluded.message,

                status =
                    excluded.status,

                creation_time =
                    excluded.creation_time,

                delivery_time =
                    excluded.delivery_time,

                last_updated =
                    excluded.last_updated
        """, (

            message["id"],

            extension_id,

            from_number,

            to_number,

            message.get(
                "direction"
            ),

            message.get(
                "subject",
                message.get(
                    "message",
                    ""
                )
            ),

            message.get(
                "messageStatus"
            ),

            message.get(
                "creationTime"
            ),

            message.get(
                "smsDeliveryTime"
            ),

            sync_time
        ))

        count += 1

    conn.commit()

    conn.close()

    return count


# =========================================================
# UPDATE EXTENSION LAST SYNC
# =========================================================

def update_extension_last_sync(
    extension_id
):

    conn = get_connection()

    conn.execute("""
        UPDATE extensions

        SET last_sync = ?

        WHERE extension_id = ?
    """, (
        iso_utc(
            now_utc()
        ),
        extension_id
    ))

    conn.commit()

    conn.close()


# =========================================================
# SYNC ONE EXTENSION
# =========================================================

def sync_one_extension(
    access_token,
    extension
):

    extension_id = (
        extension["extension_id"]
    )

    extension_number = (
        extension["extension_number"]
        or str(extension_id)
    )

    print()
    print(
        f"[SYNC] Extension "
        f"{extension_number} "
        f"({extension_id})"
    )

    records = get_recent_messages(
        access_token,
        extension_id
    )

    print(
        f"    Received from API: "
        f"{len(records)}"
    )

    saved = save_messages(
        extension_id,
        records
    )

    update_extension_last_sync(
        extension_id
    )

    print(
        f"    SQLite upserted: "
        f"{saved}"
    )

    return saved


# =========================================================
# SYNC ALL LOCAL EXTENSIONS
# =========================================================

def sync_all():

    print()
    print("=" * 60)
    print("SMS MONITOR BACKGROUND SYNC")
    print("=" * 60)

    if not SYNC_ENABLED:

        print(
            "[SYNC] DISABLED "
            "(SYNC_ENABLED=0)"
        )

        return

    extensions = get_active_extensions()

    print(
        f"[SYNC] Local extensions: "
        f"{len(extensions)}"
    )

    if not extensions:

        print(
            "[SYNC] No active extensions "
            "in database."
        )

        return

    access_token = get_access_token()

    total_saved = 0

    for extension in extensions:

        try:

            total_saved += (
                sync_one_extension(
                    access_token,
                    extension
                )
            )

        except requests.exceptions.HTTPError as e:

            print(
                f"[SYNC] ERROR for "
                f"extension "
                f"{extension['extension_number']}: "
                f"{e}"
            )

            # -------------------------------------------------
            # Если token протух — не ломаем весь цикл.
            # Следующий запуск через 10 минут получит новый.
            # -------------------------------------------------

        except Exception as e:

            print(
                f"[SYNC] ERROR for "
                f"extension "
                f"{extension['extension_number']}: "
                f"{e}"
            )

        # -----------------------------------------------------
        # Между extension тоже держим интервал.
        #
        # Это важно, потому что каждый extension минимум
        # делает один API request.
        # -----------------------------------------------------

        time.sleep(
            REQUEST_INTERVAL
        )

    print()
    print("=" * 60)
    print("SYNC COMPLETE")
    print(
        f"Messages processed: "
        f"{total_saved}"
    )
    print("=" * 60)
    print()


# =========================================================
# BACKGROUND SYNC LOOP
# =========================================================

def background_sync_loop():

    if not SYNC_ENABLED:

        print(
            "[SYNC] Background sync "
            "is disabled."
        )

        return

    print(
        "[SYNC] Background sync enabled."
    )

    print(
        "[SYNC] First sync starts immediately."
    )

    # -----------------------------------------------------
    # FIRST SYNC — IMMEDIATELY
    # -----------------------------------------------------

    try:

        sync_all()

    except Exception as e:

        print(
            "[SYNC] Background sync "
            f"failed: {e}"
        )

    # -----------------------------------------------------
    # REPEATED SYNC
    #
    # Every 10 minutes.
    # Each sync looks back 30 minutes.
    # -----------------------------------------------------

    while True:

        print(
            f"[SYNC] Next sync in "
            f"{SYNC_INTERVAL // 60} minutes..."
        )

        time.sleep(
            SYNC_INTERVAL
        )

        try:

            sync_all()

        except Exception as e:

            print(
                "[SYNC] Background sync "
                f"failed: {e}"
            )


# =========================================================
# START BACKGROUND SYNC
# =========================================================

def start_background_sync():

    if not SYNC_ENABLED:

        print(
            "[SYNC] Disabled by "
            "SYNC_ENABLED=0"
        )

        return

    thread = threading.Thread(

        target=background_sync_loop,

        name="sms-sync",

        daemon=True
    )

    thread.start()

    print(
        "[SYNC] Background thread started."
    )


# =========================================================
# DASHBOARD
# =========================================================

@app.route("/")
def dashboard():

    return render_template(
        "dashboard.html"
    )


@app.route("/login")
def login():

    return render_template(
        "login.html"
    )


# Enable this guard after a real authentication/session implementation exists.
# @app.before_request
# def require_login():
#     if request.endpoint not in {"login", "static"} and not session.get("user"):
#         return redirect(url_for("login"))


# =========================================================
# EXTENSIONS
# =========================================================

@app.route("/api/extensions")
def api_extensions():

    conn = get_connection()

    rows = conn.execute("""
        SELECT
            extension_id,
            extension_number,
            name,
            type,
            active,
            last_sync

        FROM extensions

        WHERE active = 1

        ORDER BY extension_number
    """).fetchall()

    conn.close()

    extensions = []

    for row in rows:

        extensions.append({

            "id":
                row["extension_id"],

            "extensionNumber":
                row["extension_number"],

            "name":
                row["name"],

            "type":
                row["type"],

            "active":
                row["active"],

            "lastSync":
                row["last_sync"]
        })

    return jsonify({
        "records": extensions
    })


# =========================================================
# OVERVIEW
# =========================================================

@app.route("/api/overview")
def api_overview():

    conn = get_connection()

    stats = conn.execute("""
        SELECT

            COUNT(*) AS total,

            SUM(
                CASE
                    WHEN status = 'Delivered'
                    THEN 1
                    ELSE 0
                END
            ) AS delivered,

            SUM(
                CASE
                    WHEN status IN (
                        'DeliveryFailed',
                        'SendingFailed'
                    )
                    THEN 1
                    ELSE 0
                END
            ) AS failed,

            SUM(
                CASE
                    WHEN status NOT IN (
                        'Delivered',
                        'DeliveryFailed',
                        'SendingFailed'
                    )
                    OR status IS NULL
                    THEN 1
                    ELSE 0
                END
            ) AS received

        FROM messages
    """).fetchone()

    total = (
        stats["total"]
        or 0
    )

    delivered = (
        stats["delivered"]
        or 0
    )

    failed = (
        stats["failed"]
        or 0
    )

    received = (
        stats["received"]
        or 0
    )

    delivery_rate = (

        round(
            delivered /
            (
                delivered +
                failed
            ) * 100,
            1
        )

        if (
            delivered +
            failed
        ) > 0

        else 0
    )

    extension_rows = conn.execute("""
        SELECT

            e.extension_id,

            e.extension_number,

            e.name,

            COUNT(m.id) AS total,

            SUM(
                CASE
                    WHEN m.status = 'Delivered'
                    THEN 1
                    ELSE 0
                END
            ) AS delivered,

            SUM(
                CASE
                    WHEN m.status IN (
                        'DeliveryFailed',
                        'SendingFailed'
                    )
                    THEN 1
                    ELSE 0
                END
            ) AS failed,

            SUM(
                CASE
                    WHEN m.status NOT IN (
                        'Delivered',
                        'DeliveryFailed',
                        'SendingFailed'
                    )
                    OR m.status IS NULL
                    THEN 1
                    ELSE 0
                END
            ) AS received

        FROM extensions e

        LEFT JOIN messages m
            ON m.extension_id =
               e.extension_id

        WHERE e.active = 1

        GROUP BY
            e.extension_id,
            e.extension_number,
            e.name

        ORDER BY
            e.extension_number
    """).fetchall()

    extensions = []

    for row in extension_rows:

        ext_total = (
            row["total"]
            or 0
        )

        ext_delivered = (
            row["delivered"]
            or 0
        )

        ext_failed = (
            row["failed"]
            or 0
        )

        ext_received = (
            row["received"]
            or 0
        )

        rate = (

            round(
                ext_delivered /
                (
                    ext_delivered +
                    ext_failed
                ) * 100,
                1
            )

            if (
                ext_delivered +
                ext_failed
            ) > 0

            else 0
        )

        extensions.append({

            "id":
                row["extension_id"],

            "extensionNumber":
                row["extension_number"],

            "name":
                row["name"],

            "total":
                ext_total,

            "delivered":
                ext_delivered,

            "failed":
                ext_failed,

            "received":
                ext_received,

            "deliveryRate":
                rate
        })

    conn.close()

    return jsonify({

        "total":
            total,

        "delivered":
            delivered,

        "failed":
            failed,

        "received":
            received,

        "delivery_rate":
            delivery_rate,

        "extensions":
            extensions
    })


# =========================================================
# EXTENSION OVERVIEW
# =========================================================

@app.route(
    "/api/extensions/<int:extension_id>/overview"
)
def api_extension_overview(
    extension_id
):

    conn = get_connection()

    extension = conn.execute("""
        SELECT
            extension_id,
            extension_number,
            name

        FROM extensions

        WHERE extension_id = ?
    """, (
        extension_id,
    )).fetchone()

    if not extension:

        conn.close()

        return jsonify({
            "error":
                "Extension not found"
        }), 404

    date_from = request.args.get(
        "dateFrom"
    )

    date_to = request.args.get(
        "dateTo"
    )

    contact = request.args.get(
        "contact"
    )

    where_clauses = [
        "extension_id = ?"
    ]

    params = [
        extension_id
    ]

    if date_from:

        where_clauses.append(
            "date(creation_time) >= date(?)"
        )

        params.append(
            date_from
        )

    if date_to:

        where_clauses.append(
            "date(creation_time) <= date(?)"
        )

        params.append(
            date_to
        )

    if contact:

        where_clauses.append(
            "("
            "from_number = ? "
            "OR to_number = ?"
            ")"
        )

        params.extend([
            contact,
            contact
        ])

    where_sql = " AND ".join(
        where_clauses
    )

    extension_number = (
        extension["extension_number"]
        or ""
    )

    partner_case = """
        CASE

            WHEN
                from_number IS NOT NULL
                AND from_number != ''
                AND from_number != ?
            THEN from_number

            WHEN
                to_number IS NOT NULL
                AND to_number != ''
                AND to_number != ?
            THEN to_number

            WHEN
                from_number IS NOT NULL
                AND from_number != ''
            THEN from_number

            ELSE to_number

        END
    """

    summary = conn.execute(
        f"""
        SELECT

            COUNT(*) AS total,

            SUM(
                CASE
                    WHEN status = 'Delivered'
                    THEN 1
                    ELSE 0
                END
            ) AS delivered,

            SUM(
                CASE
                    WHEN status IN (
                        'DeliveryFailed',
                        'SendingFailed'
                    )
                    THEN 1
                    ELSE 0
                END
            ) AS failed,

            SUM(
                CASE
                    WHEN status NOT IN (
                        'Delivered',
                        'DeliveryFailed',
                        'SendingFailed'
                    )
                    OR status IS NULL
                    THEN 1
                    ELSE 0
                END
            ) AS received

        FROM messages

        WHERE {where_sql}
        """,
        params
    ).fetchone()

    total = (
        summary["total"]
        or 0
    )

    delivered = (
        summary["delivered"]
        or 0
    )

    failed = (
        summary["failed"]
        or 0
    )

    received = (
        summary["received"]
        or 0
    )

    rate = (

        round(
            delivered /
            (
                delivered +
                failed
            ) * 100,
            1
        )

        if (
            delivered +
            failed
        ) > 0

        else 0
    )

    unique_chats = conn.execute(
        f"""
        SELECT COUNT(
            DISTINCT {partner_case}
        ) AS unique_chats

        FROM messages

        WHERE {where_sql}
        """,

        [
            extension_number,
            extension_number
        ] + params

    ).fetchone()[
        "unique_chats"
    ] or 0

    number_rows = conn.execute(
        f"""
        SELECT

            {partner_case}
                AS number,

            COUNT(*) AS total,

            SUM(
                CASE
                    WHEN status = 'Delivered'
                    THEN 1
                    ELSE 0
                END
            ) AS delivered,

            SUM(
                CASE
                    WHEN status IN (
                        'DeliveryFailed',
                        'SendingFailed'
                    )
                    THEN 1
                    ELSE 0
                END
            ) AS failed,

            SUM(
                CASE
                    WHEN status NOT IN (
                        'Delivered',
                        'DeliveryFailed',
                        'SendingFailed'
                    )
                    OR status IS NULL
                    THEN 1
                    ELSE 0
                END
            ) AS received

        FROM messages

        WHERE {where_sql}

        GROUP BY number

        ORDER BY
            total DESC,
            number ASC

        LIMIT 20
        """,

        [
            extension_number,
            extension_number
        ] + params

    ).fetchall()

    numbers = []

    for row in number_rows:

        numbers.append({

            "number":
                row["number"]
                or "Unknown",

            "total":
                row["total"]
                or 0,

            "received":
                row["received"]
                or 0,

            "delivered":
                row["delivered"]
                or 0,

            "failed":
                row["failed"]
                or 0
        })

    conn.close()

    return jsonify({

        "extension": {

            "id":
                extension["extension_id"],

            "extensionNumber":
                extension["extension_number"],

            "name":
                extension["name"]
        },

        "total":
            total,

        "delivered":
            delivered,

        "failed":
            failed,

        "received":
            received,

        "deliveryRate":
            rate,

        "uniqueChats":
            unique_chats,

        "numbers":
            numbers
    })


# =========================================================
# CHART DATA
# =========================================================

@app.route("/api/chart-data")
def api_chart_data():

    conn = get_connection()

    date_from = request.args.get(
        "dateFrom"
    )

    date_to = request.args.get(
        "dateTo"
    )

    extension_id = request.args.get(
        "extensionId"
    )

    contact = request.args.get(
        "contact"
    )

    group_format = (
        "%Y-%m-%d %H:%M"
    )

    if date_from and date_to:

        try:

            d_from = datetime.strptime(
                date_from,
                "%Y-%m-%d"
            )

            d_to = datetime.strptime(
                date_to,
                "%Y-%m-%d"
            )

            days_diff = (
                d_to - d_from
            ).days

            if days_diff > 1:

                group_format = (
                    "%Y-%m-%d"
                )

        except ValueError:

            pass

    def load_chart_data(
        status
    ):

        query = """
            SELECT

                strftime(
                    ?,
                    creation_time
                ) AS time_slot,

                COUNT(*) AS count

            FROM messages

            WHERE status = ?
        """

        params = [
            group_format,
            status
        ]

        if extension_id:

            query += """
                AND extension_id = ?
            """

            params.append(
                int(extension_id)
            )

        if contact:

            query += """
                AND (
                    from_number = ?
                    OR to_number = ?
                )
            """

            params.extend([
                contact,
                contact
            ])

        if date_from:

            query += """
                AND date(
                    creation_time
                ) >= date(?)
            """

            params.append(
                date_from
            )

        if date_to:

            query += """
                AND date(
                    creation_time
                ) <= date(?)
            """

            params.append(
                date_to
            )

        query += """
            GROUP BY
                strftime(
                    ?,
                    creation_time
                )

            ORDER BY
                time_slot ASC
        """

        params.append(
            group_format
        )

        return conn.execute(
            query,
            params
        ).fetchall()

    sent_rows = load_chart_data(
        "sent"
    )

    received_rows = load_chart_data(
        "received"
    )

    conn.close()

    sent_data = {}

    received_data = {}

    for row in sent_rows:

        sent_data[
            row["time_slot"]
        ] = row["count"]

    for row in received_rows:

        received_data[
            row["time_slot"]
        ] = row["count"]

    all_slots = sorted(
        set(sent_data.keys())
        |
        set(received_data.keys())
    )

    return jsonify({

        "labels":
            all_slots,

        "sent": [

            sent_data.get(
                slot,
                0
            )

            for slot in all_slots
        ],

        "received": [

            received_data.get(
                slot,
                0
            )

            for slot in all_slots
        ]
    })


# =========================================================
# MESSAGES BY EXTENSION
# =========================================================

@app.route(
    "/api/extensions/<int:extension_id>/messages"
)
def api_extension_messages(
    extension_id
):

    conn = get_connection()

    extension = conn.execute("""
        SELECT
            extension_id,
            extension_number,
            name

        FROM extensions

        WHERE extension_id = ?
    """, (
        extension_id,
    )).fetchone()

    if not extension:

        conn.close()

        return jsonify({
            "error":
                "Extension not found"
        }), 404

    status = request.args.get(
        "status"
    )

    contact = request.args.get(
        "contact"
    )

    try:

        page = int(
            request.args.get(
                "page",
                1
            )
        )

    except ValueError:

        page = 1

    try:

        per_page = int(
            request.args.get(
                "perPage",
                500
            )
        )

    except ValueError:

        per_page = 500

    per_page = min(
        max(
            per_page,
            1
        ),
        500
    )

    page = max(
        page,
        1
    )

    sort = request.args.get(
        "sort",
        "newest"
    )

    date_from = request.args.get(
        "dateFrom"
    )

    date_to = request.args.get(
        "dateTo"
    )

    conditions = [
        "extension_id = ?"
    ]

    params = [
        extension_id
    ]

    if status:

        conditions.append(
            "status = ?"
        )

        params.append(
            status
        )

    if contact:

        conditions.append(
            "("
            "from_number = ? "
            "OR to_number = ?"
            ")"
        )

        params.extend([
            contact,
            contact
        ])

    if date_from:

        conditions.append(
            "date(creation_time) >= date(?)"
        )

        params.append(
            date_from
        )

    if date_to:

        conditions.append(
            "date(creation_time) <= date(?)"
        )

        params.append(
            date_to
        )

    where_sql = " AND ".join(
        conditions
    )

    total_elements = conn.execute(
        f"""
        SELECT COUNT(*)

        FROM messages

        WHERE {where_sql}
        """,

        params

    ).fetchone()[0]

    if sort == "oldest":

        order_sql = (
            "creation_time ASC"
        )

    else:

        order_sql = (
            "creation_time DESC"
        )

    offset = (
        page - 1
    ) * per_page

    rows = conn.execute(
        f"""
        SELECT

            id,

            ringcentral_id,

            extension_id,

            from_number,

            to_number,

            direction,

            message,

            status,

            creation_time,

            delivery_time,

            last_updated

        FROM messages

        WHERE {where_sql}

        ORDER BY {order_sql}

        LIMIT ?

        OFFSET ?
        """,

        params + [
            per_page,
            offset
        ]

    ).fetchall()

    conn.close()

    messages = []

    for row in rows:

        messages.append({

            "id":
                row["ringcentral_id"],

            "extensionId":
                row["extension_id"],

            "from": {

                "phoneNumber":
                    row["from_number"]
            },

            "to": [

                {

                    "phoneNumber":
                        row["to_number"]
                }
            ],

            "direction":
                row["direction"],

            "subject":
                row["message"],

            "message":
                row["message"],

            "messageStatus":
                row["status"],

            "status":
                row["status"],

            "creationTime":
                row["creation_time"],

            "smsDeliveryTime":
                row["delivery_time"],

            "lastUpdated":
                row["last_updated"]
        })

    total_pages = max(
        1,
        math.ceil(
            total_elements /
            per_page
        )
    )

    return jsonify({

        "records":
            messages,

        "paging": {

            "page":
                page,

            "perPage":
                per_page,

            "totalElements":
                total_elements,

            "totalPages":
                total_pages
        },

        "sort":
            sort,

        "dateFrom":
            date_from,

        "dateTo":
            date_to
    })


# =========================================================
# EXPORT MESSAGES
# =========================================================

@app.route(
    "/api/export",
    methods=["POST"]
)
def api_export():

    try:

        data = request.get_json()

        if not data:

            return jsonify({
                "error":
                    "No JSON data provided"
            }), 400

        extension_ids = data.get(
            "extensionIds",
            []
        )

        if (
            not extension_ids
            or not isinstance(
                extension_ids,
                list
            )
        ):

            return jsonify({
                "error":
                    "extensionIds must be "
                    "a non-empty list"
            }), 400

        date_from = data.get(
            "dateFrom"
        )

        date_to = data.get(
            "dateTo"
        )

        date_from = export_filter_value(date_from)
        date_to = export_filter_value(date_to)

        rows = (
            get_messages_by_extensions(
                extension_ids,
                date_from=date_from,
                date_to=date_to
            )
        )

        if not rows:

            return jsonify({
                "error":
                    "No messages found "
                    "for selected criteria"
            }), 404

        excel_file = (
            generate_excel_from_messages(
                rows,
                title="SMS Export"
            )
        )

        return send_file(

            excel_file,

            mimetype=(
                "application/vnd.openxmlformats-"
                "officedocument.spreadsheetml.sheet"
            ),

            as_attachment=True,

            download_name=(
                f"SMS_Export_"
                f"{len(extension_ids)}_ext_"
                f"{len(rows)}_messages.xlsx"
            )
        )

    except Exception as e:

        return jsonify({
            "error":
                str(e)
        }), 500


# =========================================================
# DATABASE INFO
# =========================================================

@app.route("/api/database-info")
def database_info():

    conn = get_connection()

    extensions = conn.execute("""
        SELECT COUNT(*)

        FROM extensions

        WHERE active = 1
    """).fetchone()[0]

    messages = conn.execute("""
        SELECT COUNT(*)

        FROM messages
    """).fetchone()[0]

    last_sync = conn.execute("""
        SELECT MAX(last_sync)

        FROM extensions
    """).fetchone()[0]

    conn.close()

    return jsonify({

        "extensions":
            extensions,

        "messages":
            messages,

        "lastSync":
            last_sync
    })


# =========================================================
# START
# =========================================================

if __name__ == "__main__":

    # -----------------------------------------------------
    # Flask debug reloader запускает main.py дважды.
    #
    # Поэтому sync запускаем только в настоящем процессе.
    # -----------------------------------------------------

    is_reloader_process = (
        os.environ.get(
            "WERKZEUG_RUN_MAIN"
        ) == "true"
    )

    if (
        not app.debug
        or is_reloader_process
    ):

        start_background_sync()

    app.run(

        host="0.0.0.0",

        port=5001,
        debug=False,
        use_reloader=False,
        threaded=True
    )