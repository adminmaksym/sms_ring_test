from flask import Flask, jsonify, render_template, request
import math
import sqlite3
from pathlib import Path

app = Flask(__name__)

def get_connection():
    conn = sqlite3.connect(
        "sms_monitor.db",
        check_same_thread=False
    )

    conn.row_factory = sqlite3.Row

    return conn


def init_database():

    conn = get_connection()

    cursor = conn.cursor()

    # Extensions
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

    # Messages
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

    # Useful indexes
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

# Создаём БД/таблицы, если их ещё нет
init_database()


# =========================================================
# DASHBOARD
# =========================================================

@app.route("/")
def dashboard():
    return render_template("dashboard.html")


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
            "id": row["extension_id"],
            "extensionNumber": row["extension_number"],
            "name": row["name"],
            "type": row["type"],
            "active": row["active"],
            "lastSync": row["last_sync"]
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

    # Общая статистика
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
            ) AS pending

        FROM messages
    """).fetchone()

    total = stats["total"] or 0
    delivered = stats["delivered"] or 0
    failed = stats["failed"] or 0
    pending = stats["pending"] or 0

    delivery_rate = (
        round(
            delivered / total * 100,
            1
        )
        if total
        else 0
    )

    # Статистика по extensions
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
            ) AS pending

        FROM extensions e

        LEFT JOIN messages m
            ON m.extension_id = e.extension_id

        WHERE e.active = 1

        GROUP BY
            e.extension_id,
            e.extension_number,
            e.name

        ORDER BY e.extension_number
    """).fetchall()

    extensions = []

    for row in extension_rows:

        ext_total = row["total"] or 0
        ext_delivered = row["delivered"] or 0
        ext_failed = row["failed"] or 0
        ext_pending = row["pending"] or 0

        rate = (
            round(
                ext_delivered / ext_total * 100,
                1
            )
            if ext_total
            else 0
        )

        extensions.append({
            "id": row["extension_id"],
            "extensionNumber":
                row["extension_number"],
            "name": row["name"],
            "total": ext_total,
            "delivered": ext_delivered,
            "failed": ext_failed,
            "pending": ext_pending,
            "deliveryRate": rate
        })

    conn.close()

    return jsonify({
        "total": total,
        "delivered": delivered,
        "failed": failed,
        "pending": pending,
        "delivery_rate": delivery_rate,
        "extensions": extensions
    })


# =========================================================
# MESSAGES BY EXTENSION
# =========================================================

# =========================================================
# MESSAGES BY EXTENSION
# =========================================================

@app.route(
    "/api/extensions/<int:extension_id>/messages"
)
def api_extension_messages(extension_id):

    conn = get_connection()

    # -----------------------------------------------------
    # Проверяем extension
    # -----------------------------------------------------

    extension = conn.execute("""
        SELECT
            extension_id,
            extension_number,
            name
        FROM extensions
        WHERE extension_id = ?
    """, (extension_id,)).fetchone()


    if not extension:

        conn.close()

        return jsonify({
            "error": "Extension not found"
        }), 404


    # -----------------------------------------------------
    # Параметры
    # -----------------------------------------------------

    status = request.args.get(
        "status"
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


    # Ограничиваем максимум 500
    per_page = min(
        max(per_page, 1),
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


    # -----------------------------------------------------
    # WHERE
    # -----------------------------------------------------

    conditions = [
        "extension_id = ?"
    ]


    params = [
        extension_id
    ]


    # Status
    if status:

        conditions.append(
            "status = ?"
        )

        params.append(
            status
        )


    # -----------------------------------------------------
    # DATE FROM
    # -----------------------------------------------------

    if date_from:

        conditions.append("""
            date(creation_time) >= date(?)
        """)

        params.append(
            date_from
        )


    # -----------------------------------------------------
    # DATE TO
    # -----------------------------------------------------

    if date_to:

        conditions.append("""
            date(creation_time) <= date(?)
        """)

        params.append(
            date_to
        )


    where_sql = " AND ".join(
        conditions
    )


    # -----------------------------------------------------
    # TOTAL COUNT
    # -----------------------------------------------------

    count_query = f"""
        SELECT COUNT(*)
        FROM messages
        WHERE {where_sql}
    """


    total_elements = conn.execute(
        count_query,
        params
    ).fetchone()[0]


    # -----------------------------------------------------
    # SORT
    # -----------------------------------------------------

    if sort == "oldest":

        order_sql = """
            creation_time ASC
        """

    else:

        order_sql = """
            creation_time DESC
        """


    # -----------------------------------------------------
    # PAGINATION
    # -----------------------------------------------------

    offset = (
        page - 1
    ) * per_page


    # -----------------------------------------------------
    # MESSAGES
    # -----------------------------------------------------

    query = f"""
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
    """


    query_params = (
        params +
        [
            per_page,
            offset
        ]
    )


    rows = conn.execute(
        query,
        query_params
    ).fetchall()


    conn.close()


    # -----------------------------------------------------
    # FORMAT MESSAGES
    # -----------------------------------------------------

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


    # -----------------------------------------------------
    # PAGINATION INFO
    # -----------------------------------------------------

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
        "extensions": extensions,
        "messages": messages,
        "lastSync": last_sync
    })


# =========================================================
# START
# =========================================================

if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )