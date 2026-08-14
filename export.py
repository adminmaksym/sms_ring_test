import os
import sqlite3
from datetime import datetime
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter


# =========================================================
# DATABASE
# =========================================================

DB_FILE = "sms_monitor.db"


def get_connection():

    conn = sqlite3.connect(DB_FILE)

    conn.row_factory = sqlite3.Row

    return conn


# =========================================================
# GET EXTENSIONS
# =========================================================

def get_extensions():

    conn = get_connection()

    rows = conn.execute("""
        SELECT
            extension_id,
            extension_number,
            name,
            type
        FROM extensions
        WHERE active = 1
          AND type = 'User'
        ORDER BY extension_number
    """).fetchall()

    conn.close()

    return rows


# =========================================================
# GET MESSAGE COUNT
# =========================================================

def get_message_count(extension_id):

    conn = get_connection()

    row = conn.execute("""
        SELECT COUNT(*) AS total
        FROM messages
        WHERE extension_id = ?
    """, (extension_id,)).fetchone()

    conn.close()

    return row["total"]


# =========================================================
# GENERATE EXCEL FROM MESSAGES
# =========================================================

def generate_excel_from_messages(
    rows,
    title="SMS"
):
    """
    Generate Excel workbook from message rows.
    
    Args:
        rows: List of message records
        title: Sheet title (default: "SMS")
    
    Returns:
        BytesIO object containing the Excel file
    """

    workbook = Workbook()

    sheet = workbook.active

    sheet.title = title


    headers = [

        "Date",

        "Direction",

        "From",

        "To",

        "Status",

        "Message",

        "Delivery Time",

        "Last Updated",

        "RingCentral ID"

    ]


    # Header

    for column, header in enumerate(
        headers,
        start=1
    ):

        cell = sheet.cell(
            row=1,
            column=column,
            value=header
        )

        cell.font = Font(
            bold=True,
            color="FFFFFF"
        )

        cell.fill = PatternFill(
            start_color="1F4E78",
            end_color="1F4E78",
            fill_type="solid"
        )

        cell.alignment = Alignment(
            horizontal="center",
            vertical="center"
        )


    # =====================================================
    # DATA
    # =====================================================

    for row_number, row in enumerate(
        rows,
        start=2
    ):

        values = [

            row["creation_time"],

            row["direction"],

            row["from_number"],

            row["to_number"],

            row["status"],

            row["message"],

            row["delivery_time"],

            row["last_updated"],

            row["ringcentral_id"]

        ]


        for column, value in enumerate(
            values,
            start=1
        ):

            cell = sheet.cell(
                row=row_number,
                column=column,
                value=value
            )

            cell.alignment = Alignment(
                vertical="top",
                wrap_text=(
                    column == 6
                )
            )


    # =====================================================
    # COLUMN WIDTH
    # =====================================================

    widths = {

        1: 22,  # Date

        2: 14,  # Direction

        3: 20,  # From

        4: 20,  # To

        5: 20,  # Status

        6: 60,  # Message

        7: 22,  # Delivery

        8: 22,  # Updated

        9: 25   # ID

    }


    for column, width in widths.items():

        sheet.column_dimensions[
            get_column_letter(column)
        ].width = width


    # =====================================================
    # FREEZE HEADER
    # =====================================================

    sheet.freeze_panes = "A2"


    # =====================================================
    # AUTOFILTER
    # =====================================================

    sheet.auto_filter.ref = (
        f"A1:I{len(rows) + 1}"
    )


    # Convert to BytesIO
    output = BytesIO()
    workbook.save(output)
    output.seek(0)

    return output


# =========================================================
# GET MESSAGES BY EXTENSIONS AND DATES
# =========================================================

def get_messages_by_extensions(
    extension_ids,
    date_from=None,
    date_to=None
):
    """
    Get messages from multiple extensions with date filtering.
    
    Args:
        extension_ids: List of extension IDs
        date_from: Start date (YYYY-MM-DD format, optional)
        date_to: End date (YYYY-MM-DD format, optional)
    
    Returns:
        List of message records
    """

    if not extension_ids:
        return []

    conn = get_connection()

    query = """
        SELECT
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
        WHERE extension_id IN ({})
    """.format(
        ",".join("?" * len(extension_ids))
    )

    params = list(extension_ids)

    if date_from:
        query += """
            AND date(creation_time) >= date(?)
        """
        params.append(date_from)

    if date_to:
        query += """
            AND date(creation_time) <= date(?)
        """
        params.append(date_to)

    query += """
        ORDER BY creation_time ASC
    """

    rows = conn.execute(
        query,
        params
    ).fetchall()

    conn.close()

    return rows


# =========================================================
# EXPORT
# =========================================================

def export_messages(extension):

    extension_id = extension["extension_id"]

    extension_number = (
        extension["extension_number"]
        or str(extension_id)
    )

    name = extension["name"] or "Unknown"

    print()
    print("=" * 60)
    print("EXPORT")
    print("=" * 60)

    print(
        f"Extension: {extension_number}"
    )

    print(
        f"User: {name}"
    )

    total = get_message_count(
        extension_id
    )

    print(
        f"Messages: {total}"
    )

    if total == 0:

        print()
        print("У этого extension нет сообщений.")

        return


    # =====================================================
    # DATE FILTER
    # =====================================================

    print()
    print("Фильтр по дате:")

    print(
        "1. Все сообщения"
    )

    print(
        "2. Указать период"
    )

    date_choice = input(
        "\nВыбор: "
    ).strip()


    date_from = None
    date_to = None


    if date_choice == "2":

        date_from = input(
            "Дата от (YYYY-MM-DD): "
        ).strip()

        date_to = input(
            "Дата до (YYYY-MM-DD): "
        ).strip()

        try:

            datetime.strptime(
                date_from,
                "%Y-%m-%d"
            )

            datetime.strptime(
                date_to,
                "%Y-%m-%d"
            )

        except ValueError:

            print(
                "Неверный формат даты."
            )

            return


    # =====================================================
    # QUERY
    # =====================================================

    conn = get_connection()

    query = """
        SELECT

            ringcentral_id,
            from_number,
            to_number,
            direction,
            message,
            status,
            creation_time,
            delivery_time,
            last_updated

        FROM messages

        WHERE extension_id = ?
    """

    params = [
        extension_id
    ]


    if date_from:

        query += """
            AND creation_time >= ?
        """

        params.append(
            date_from + "T00:00:00"
        )


    if date_to:

        query += """
            AND creation_time < ?
        """

        params.append(
            date_to + "T23:59:59"
        )


    query += """
        ORDER BY creation_time ASC
    """


    rows = conn.execute(
        query,
        params
    ).fetchall()

    conn.close()


    print()
    print(
        f"Подготовлено сообщений: "
        f"{len(rows)}"
    )


    if not rows:

        print(
            "За выбранный период сообщений нет."
        )

        return


    # =====================================================
    # GENERATE EXCEL
    # =====================================================

    output = generate_excel_from_messages(
        rows,
        title="SMS"
    )

    workbook = output
    sheet = None


    # =====================================================
    # OUTPUT NAME
    # =====================================================

    safe_name = "".join(

        c if c.isalnum() or c in (
            " ",
            "_",
            "-"
        )

        else "_"

        for c in name

    ).strip()


    if not safe_name:

        safe_name = "User"


    date_suffix = datetime.now().strftime(
        "%Y-%m-%d_%H-%M"
    )


    filename = (
        f"SMS_{extension_number}_"
        f"{safe_name}_"
        f"{date_suffix}.xlsx"
    )


    output_path = os.path.join(
        os.getcwd(),
        filename
    )

    # Save the BytesIO object to file
    with open(output_path, 'wb') as f:
        f.write(output.getvalue())


    print()
    print("=" * 60)
    print("ГОТОВО")
    print("=" * 60)

    print(
        f"Файл: {output_path}"
    )

    print(
        f"Сообщений: {len(rows)}"
    )

    print("=" * 60)


# =========================================================
# MAIN
# =========================================================

def main():

    print("=" * 60)

    print(
        "SMS MONITOR — EXCEL EXPORT"
    )

    print("=" * 60)


    extensions = get_extensions()


    if not extensions:

        print()
        print(
            "В БД нет активных User extensions."
        )

        return


    print()
    print(
        "Доступные пользователи:"
    )

    print()


    for index, extension in enumerate(
        extensions,
        start=1
    ):

        extension_number = (
            extension["extension_number"]
            or "-"
        )

        name = (
            extension["name"]
            or "Без имени"
        )

        count = get_message_count(
            extension["extension_id"]
        )

        print(
            f"{index:3}. "
            f"Ext. {extension_number:<10} "
            f"{name:<30} "
            f"{count} SMS"
        )


    print()

    choice = input(
        "Выберите extension: "
    ).strip()


    try:

        index = int(choice)

    except ValueError:

        print(
            "Введите номер из списка."
        )

        return


    if index < 1 or index > len(
        extensions
    ):

        print(
            "Такого extension нет."
        )

        return


    extension = extensions[
        index - 1
    ]


    export_messages(
        extension
    )


# =========================================================
# START
# =========================================================

if __name__ == "__main__":

    main()