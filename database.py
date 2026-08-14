import sqlite3
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DATABASE = BASE_DIR / "sms_monitor_ext.db"


def get_connection():
    conn = sqlite3.connect(
        DATABASE,
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


if __name__ == "__main__":
    init_database()

    print(
        f"Database initialized: {DATABASE}"
    )