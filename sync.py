import os
import time
import requests

from datetime import datetime, timezone

from dotenv import load_dotenv

from database import get_connection


load_dotenv()


CLIENT_ID = os.getenv(
    "RINGCENTRAL_CLIENT_ID"
)

CLIENT_SECRET = os.getenv(
    "RINGCENTRAL_CLIENT_SECRET"
)

JWT = os.getenv(
    "RINGCENTRAL_JWT"
)

RC_BASE_URL = (
    "https://platform.ringcentral.com"
)


# =========================================================
# ACCESS TOKEN
# =========================================================

def get_access_token():

    response = requests.post(

        f"{RC_BASE_URL}"
        "/restapi/oauth/token",

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

    return response.json()[
        "access_token"
    ]


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

        # -----------------------------------------
        # RATE LIMIT
        # -----------------------------------------

        if response.status_code == 429:

            retry_after = (
                response.headers.get(
                    "Retry-After"
                )
            )

            if retry_after:

                wait_time = int(
                    retry_after
                )

            else:

                wait_time = min(
                    5 * (2 ** attempt),
                    60
                )

            print(
                f"Rate limit reached. "
                f"Waiting {wait_time} seconds..."
            )

            time.sleep(
                wait_time
            )

            continue

        response.raise_for_status()

        return response.json()

    raise Exception(
        "RingCentral rate limit: "
        f"maximum retries "
        f"({max_retries}) exceeded"
    )


# =========================================================
# DATE / TIME
# =========================================================

def now_utc():

    return datetime.now(
        timezone.utc
    ).isoformat()


# =========================================================
# GET ALL SMS PAGES
# =========================================================

def get_all_messages(
    access_token,
    extension_id
):

    all_messages = []

    page = 1

    per_page = 100

    while True:

        print(
            f"    Loading page "
            f"{page}..."
        )

        data = rc_get(

            access_token,

            f"/restapi/v1.0/account/~/"
            f"extension/{extension_id}/"
            f"message-store",

            {
                "messageType": "SMS",

                "perPage": per_page,

                "page": page,

                "dateFrom":
                    "2026-01-01T00:00:00Z"
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

        # Небольшая пауза между страницами
        time.sleep(1.1)

    return all_messages


# =========================================================
# SYNC EXTENSIONS
# =========================================================

# =========================================================
# GET ALL EXTENSIONS PAGES
# =========================================================

def get_all_extensions(
    access_token
):

    all_extensions = []

    page = 1

    per_page = 100

    while True:

        print(
            f"Loading extensions page "
            f"{page}..."
        )

        data = rc_get(

            access_token,

            "/restapi/v1.0/account/~/extension",

            {
                "perPage": per_page,
                "page": page
            }
        )

        records = data.get(
            "records",
            []
        )

        all_extensions.extend(
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

        total_elements = paging.get(
            "totalElements",
            len(all_extensions)
        )

        print(
            f"  Page {page}/{total_pages}: "
            f"{len(records)} extensions "
            f"(total: {len(all_extensions)}/{total_elements})"
        )

        if page >= total_pages:

            break

        page += 1

    print(
        f"Total extensions received: "
        f"{len(all_extensions)}"
    )

    return all_extensions


# =========================================================
# SYNC EXTENSIONS
# =========================================================

def sync_extensions(
    access_token
):

    print(
        "Syncing extensions..."
    )

    extensions = get_all_extensions(
        access_token
    )

    conn = get_connection()

    cursor = conn.cursor()

    count = 0

    for extension in extensions:

        # =============================================
        # Только реальные пользователи
        # =============================================

        extension_type = extension.get(
            "type"
        )

        if extension_type != "User":

            print(
                f"Skipping "
                f"{extension.get('extensionNumber')} "
                f"({extension.get('name')}) "
                f"type={extension_type}"
            )

            continue

        # =============================================
        # Сохраняем User
        # =============================================

        cursor.execute("""

            INSERT INTO extensions (

                extension_id,

                extension_number,

                name,

                type,

                active,

                last_sync

            )

            VALUES (?, ?, ?, ?, ?, ?)

            ON CONFLICT(extension_id)

            DO UPDATE SET

                extension_number =
                    excluded.extension_number,

                name =
                    excluded.name,

                type =
                    excluded.type,

                active =
                    excluded.active,

                last_sync =
                    excluded.last_sync

        """, (

            extension["id"],

            extension.get(
                "extensionNumber"
            ),

            extension.get(
                "name"
            ),

            extension_type,

            1,

            now_utc()

        ))

        count += 1

    conn.commit()

    conn.close()

    print(
        f"Users synced: "
        f"{count}"
    )

    return [
        extension
        for extension in extensions
        if extension.get("type") == "User"
    ]


# =========================================================
# SYNC MESSAGES
# =========================================================

def sync_messages(
    access_token,
    extension
):

    extension_id = (
        extension["id"]
    )

    extension_number = (

        extension.get(
            "extensionNumber"
        )

        or extension_id
    )

    print(
        f"\nSyncing SMS for "
        f"extension "
        f"{extension_number}..."
    )

    # =============================================
    # ВАЖНО:
    #
    # Здесь мы НЕ делаем rc_get напрямую.
    #
    # Вместо этого получаем ВСЕ страницы.
    # =============================================

    records = get_all_messages(

        access_token,

        extension_id
    )

    print(
        f"    Total messages received: "
        f"{len(records)}"
    )

    conn = get_connection()

    cursor = conn.cursor()

    count = 0

    for message in records:

        # -----------------------------------------
        # TO
        # -----------------------------------------

        to_number = ""

        if message.get("to"):

            to_number = (

                message["to"][0]

                .get(
                    "phoneNumber",
                    ""
                )

            )

        # -----------------------------------------
        # FROM
        # -----------------------------------------

        from_number = (

            message.get(
                "from",
                {}
            )

            .get(
                "phoneNumber",
                ""
            )

        )

        # -----------------------------------------
        # SAVE MESSAGE
        # -----------------------------------------

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
                ""
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

            now_utc()

        ))

        count += 1

    conn.commit()

    conn.close()

    print(
        f"    SQLite updated: "
        f"{count}"
    )

    return count


# =========================================================
# SYNC EVERYTHING
# =========================================================

def sync_all():

    print("=" * 60)

    print(
        "SMS MONITOR SYNC"
    )

    print("=" * 60)

    # Получаем JWT → Access Token

    access_token = (
        get_access_token()
    )

    # -----------------------------------------
    # Extensions
    # -----------------------------------------

    extensions = sync_extensions(
        access_token
    )

    # -----------------------------------------
    # Messages
    # -----------------------------------------

    total_messages = 0

    for extension in extensions:

        try:

            total_messages += (
                sync_messages(
                    access_token,
                    extension
                )
            )

        except requests.exceptions.HTTPError as e:

            print(
                f"ERROR for extension "
                f"{extension.get('extensionNumber')}: "
                f"{e}"
            )

        except Exception as e:

            print(
                f"ERROR for extension "
                f"{extension.get('extensionNumber')}: "
                f"{e}"
            )

    print("=" * 60)

    print(
        "SYNC COMPLETE"
    )

    print(
        f"Messages processed: "
        f"{total_messages}"
    )

    print("=" * 60)


# =========================================================
# START
# =========================================================

if __name__ == "__main__":

    sync_all()