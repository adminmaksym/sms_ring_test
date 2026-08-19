import os
import sqlite3
from pathlib import Path


# =========================================================
# DATABASE CONFIG
# =========================================================

BASE_DIR = Path(__file__).resolve().parent

# По умолчанию используется sms_monitor.db.
#
# Если понадобится другая БД, можно указать:
#
# Windows CMD:
#   set SMS_DATABASE=D:\data\sms_monitor.db
#
# PowerShell:
#   $env:SMS_DATABASE="D:\data\sms_monitor.db"
#
# Linux:
#   export SMS_DATABASE=/data/sms_monitor.db
#
DATABASE = Path(
    os.getenv(
        "SMS_DATABASE",
        str(BASE_DIR / "sms_monitor.db")
    )
)


# =========================================================
# CONNECTION
# =========================================================

def get_connection():
    """
    Создаёт новое соединение с SQLite.

    Важно:
    Каждому потоку/операции создаём собственное соединение.
    Это безопаснее при параллельном sync.
    """

    conn = sqlite3.connect(
        DATABASE,
        timeout=30,
        check_same_thread=False
    )

    conn.row_factory = sqlite3.Row

    # Разрешаем SQLite ждать освобождения БД
    # вместо мгновенного "database is locked".
    conn.execute(
        "PRAGMA busy_timeout = 30000"
    )

    # WAL позволяет одновременно:
    #
    # sync.py  -> пишет
    # main.py  -> читает
    #
    # без постоянных блокировок.
    conn.execute(
        "PRAGMA journal_mode = WAL"
    )

    # Нормальный баланс между скоростью и надёжностью.
    conn.execute(
        "PRAGMA synchronous = NORMAL"
    )

    return conn


# =========================================================
# DATABASE INITIALIZATION
# =========================================================

def init_database():
    """
    Создаёт таблицы/индексы, если их ещё нет.

    Существующие данные НЕ удаляются.
    Существующая БД НЕ очищается.
    """

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

    # Очень полезный индекс именно для incremental sync:
    #
    # SELECT MAX(creation_time)
    # FROM messages
    # WHERE extension_id = ?
    #
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS
        idx_messages_extension_creation
        ON messages(
            extension_id,
            creation_time
        )
    """)

    conn.commit()

    conn.close()


# =========================================================
# INITIALIZE
# =========================================================

if __name__ == "__main__":

    init_database()

    print(
        "Database initialized:"
    )

    print(
        DATABASE
    )