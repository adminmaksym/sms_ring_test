// ======================================================
// STATE
// ======================================================

let extensions = [];

let currentExtensionId = null;

let currentPage = 1;

let currentSort = "newest";

let currentDateFrom = "";

let currentDateTo = "";


// ======================================================
// START
// ======================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        console.log(
            "SMS Monitor started"
        );

        loadExtensions();

        showOverview();

    }
);


// ======================================================
// LOAD EXTENSIONS
// ======================================================

async function loadExtensions() {

    const container =
        document.getElementById(
            "extensions"
        );


    try {

        const response =
            await fetch(
                "/api/extensions"
            );


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );

        }


        const data =
            await response.json();


        console.log(
            "Extensions:",
            data
        );


        extensions =
            Array.isArray(data)
                ? data
                : (
                    data.records ||
                    []
                );


        renderExtensions();


    } catch (error) {

        console.error(
            "Extensions error:",
            error
        );


        container.innerHTML = `

            <div class="error">

                Failed to load extensions

            </div>

        `;

    }

}


// ======================================================
// RENDER EXTENSIONS
// ======================================================

function renderExtensions() {

    const container =
        document.getElementById(
            "extensions"
        );


    if (!extensions.length) {

        container.innerHTML = `

            <div class="empty">

                No extensions

            </div>

        `;

        return;

    }


    container.innerHTML = "";


    extensions.forEach(
        extension => {

            const id =
                extension.id ||
                extension.extensionId;


            const number =
                extension.extensionNumber ||
                id;


            const name =
                extension.name ||
                "";


            const button =
                document.createElement(
                    "button"
                );


            button.className =
                "extension-button";


            button.dataset.id =
                id;


            button.innerHTML = `

                <span
                    class="extension-number"
                >

                    Ext.
                    ${escapeHtml(number)}

                </span>


                <span
                    class="extension-name"
                >

                    ${escapeHtml(
                        name
                    )}

                </span>

            `;


            button.addEventListener(
                "click",
                () => {

                    selectExtension(
                        id
                    );

                }
            );


            container.appendChild(
                button
            );

        }
    );

}


// ======================================================
// SELECT EXTENSION
// ======================================================

function selectExtension(
    extensionId
) {

    currentExtensionId =
        extensionId;

    currentPage = 1;

    currentDateFrom = "";

    currentDateTo = "";

    currentSort = "newest";


    document
        .querySelectorAll(
            ".extension-button"
        )
        .forEach(
            button => {

                button.classList.toggle(
                    "active",
                    String(
                        button.dataset.id
                    ) ===
                    String(extensionId)
                );

            }
        );


    document
        .getElementById(
            "overviewButton"
        )
        .classList.remove(
            "active"
        );


    const extension =
        getExtension(
            extensionId
        );


    const number =
        extension?.extensionNumber ||
        extensionId;


    const name =
        extension?.name ||
        `Ext. ${number}`;


    document.getElementById(
        "page-title"
    ).textContent =
        name;


    document.getElementById(
        "page-subtitle"
    ).textContent =
        `Ext. ${number}`;


    loadMessages();

}


// ======================================================
// GET EXTENSION
// ======================================================

function getExtension(
    id
) {

    return extensions.find(
        extension =>
            String(
                extension.id ||
                extension.extensionId
            ) === String(id)
    );

}


// ======================================================
// SHOW OVERVIEW
// ======================================================

function showOverview() {

    currentExtensionId =
        null;


    currentPage = 1;


    document
        .querySelectorAll(
            ".extension-button"
        )
        .forEach(
            button => {

                button.classList.remove(
                    "active"
                );

            }
        );


    document
        .getElementById(
            "overviewButton"
        )
        .classList.add(
            "active"
        );


    document.getElementById(
        "page-title"
    ).textContent =
        "SMS Delivery Monitor";


    document.getElementById(
        "page-subtitle"
    ).textContent =
        "Company overview";


    const content =
        document.getElementById(
            "content"
        );


    content.innerHTML = `

        <div class="overview">

            <div class="overview-card">

                <div class="overview-icon">
                    📱
                </div>

                <div>

                    <div class="overview-label">
                        Extensions
                    </div>

                    <div class="overview-value">
                        ${extensions.length}
                    </div>

                </div>

            </div>


            <div class="overview-card">

                <div class="overview-icon">
                    💬
                </div>

                <div>

                    <div class="overview-label">
                        SMS Monitor
                    </div>

                    <div class="overview-value">
                        Active
                    </div>

                </div>

            </div>

        </div>


        <div class="welcome-card">

            <h2>
                SMS Delivery Monitor
            </h2>

            <p>
                Select an extension from the
                sidebar to view SMS messages.
            </p>

        </div>

    `;

}


// ======================================================
// LOAD MESSAGES
// ======================================================

async function loadMessages() {

    if (
        !currentExtensionId
    ) {

        return;

    }


    const content =
        document.getElementById(
            "content"
        );


    content.innerHTML = `

        <div class="loading">

            Loading messages...

        </div>

    `;


    try {

        const params =
            new URLSearchParams();


        params.set(
            "page",
            currentPage
        );


        params.set(
            "perPage",
            "500"
        );


        params.set(
            "sort",
            currentSort
        );


        if (
            currentDateFrom
        ) {

            params.set(
                "dateFrom",
                currentDateFrom
            );

        }


        if (
            currentDateTo
        ) {

            params.set(
                "dateTo",
                currentDateTo
            );

        }


        const url =
            `/api/extensions/${currentExtensionId}/messages?` +
            params.toString();


        console.log(
            "Loading:",
            url
        );


        const response =
            await fetch(url);


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );

        }


        const data =
            await response.json();


        console.log(
            "Messages:",
            data
        );


        renderMessages(
            data
        );


    } catch (error) {

        console.error(
            "Messages error:",
            error
        );


        content.innerHTML = `

            <div class="error-card">

                <h2>
                    Failed to load messages
                </h2>

                <p>
                    ${escapeHtml(
                        error.message
                    )}
                </p>

            </div>

        `;

    }

}


// ======================================================
// RENDER MESSAGES
// ======================================================

function renderMessages(
    data
) {

    const content =
        document.getElementById(
            "content"
        );


    const messages =
        data.records ||
        [];


    const paging =
        data.paging ||
        {};


    const total =
        paging.totalElements ??
        data.total ??
        messages.length;


    const totalPages =
        paging.totalPages ??
        Math.max(
            1,
            Math.ceil(
                total / 500
            )
        );


    content.innerHTML = `

        <!-- ================================= -->
        <!-- FILTERS -->
        <!-- ================================= -->

        <div class="filters-card">

            <div class="filters-title">

                📅 Message period

            </div>


            <div class="filters">

                <div class="filter-item">

                    <label>
                        From
                    </label>

                    <input
                        id="dateFrom"
                        type="date"
                        value="${escapeHtml(
                            currentDateFrom
                        )}"
                    >

                </div>


                <div class="filter-item">

                    <label>
                        To
                    </label>

                    <input
                        id="dateTo"
                        type="date"
                        value="${escapeHtml(
                            currentDateTo
                        )}"
                    >

                </div>


                <div class="filter-actions">

                    <button
                        class="primary-button"
                        onclick="applyDateFilter()"
                    >

                        Apply

                    </button>


                    <button
                        class="secondary-button"
                        onclick="clearDateFilter()"
                    >

                        Clear

                    </button>

                </div>

            </div>

        </div>


        <!-- ================================= -->
        <!-- STATISTICS -->
        <!-- ================================= -->

        <div class="stats-grid">

            <div class="stat-card">

                <div class="stat-label">
                    Messages
                </div>

                <div class="stat-value">
                    ${formatNumber(total)}
                </div>

            </div>


            <div class="stat-card">

                <div class="stat-label">
                    On page
                </div>

                <div class="stat-value">
                    ${formatNumber(
                        messages.length
                    )}
                </div>

            </div>


            <div class="stat-card">

                <div class="stat-label">
                    Page
                </div>

                <div class="stat-value">
                    ${paging.page || currentPage}
                    /
                    ${totalPages}
                </div>

            </div>

        </div>


        <!-- ================================= -->
        <!-- TOOLBAR -->
        <!-- ================================= -->

        <div class="messages-toolbar">

            <div>

                <h2>
                    Messages
                </h2>

                <div class="toolbar-subtitle">

                    ${currentDateFrom
                        ? `From ${formatDate(
                            currentDateFrom
                        )}`
                        : "All dates"
                    }

                    ${currentDateTo
                        ? ` — ${formatDate(
                            currentDateTo
                        )}`
                        : ""
                    }

                </div>

            </div>


            <div class="sort-control">

                <label>
                    Sort
                </label>


                <select
                    onchange="changeSort(this.value)"
                >

                    <option
                        value="newest"
                        ${
                            currentSort ===
                            "newest"
                            ? "selected"
                            : ""
                        }
                    >
                        Newest first
                    </option>


                    <option
                        value="oldest"
                        ${
                            currentSort ===
                            "oldest"
                            ? "selected"
                            : ""
                        }
                    >
                        Oldest first
                    </option>

                </select>

            </div>

        </div>


        <!-- ================================= -->
        <!-- TABLE -->
        <!-- ================================= -->

        <div class="messages-table-wrapper">

            <table
                class="messages-table"
            >

                <thead>

                    <tr>

                        <th>
                            Date
                        </th>

                        <th>
                            Direction
                        </th>

                        <th>
                            From
                        </th>

                        <th>
                            To
                        </th>

                        <th>
                            Status
                        </th>

                        <th>
                            Message
                        </th>

                    </tr>

                </thead>


                <tbody>

                    ${
                        messages.length

                        ?

                        messages
                            .map(
                                renderMessage
                            )
                            .join("")

                        :

                        `

                        <tr>

                            <td
                                colspan="6"
                                class="empty"
                            >

                                No messages found
                                for selected period.

                            </td>

                        </tr>

                        `
                    }

                </tbody>

            </table>

        </div>


        <!-- ================================= -->
        <!-- PAGINATION -->
        <!-- ================================= -->

        <div class="pagination">

            <button
                class="page-button"
                onclick="
                    changePage(
                        ${currentPage - 1}
                    )
                "
                ${
                    currentPage <= 1
                    ? "disabled"
                    : ""
                }
            >

                ← Previous

            </button>


            <div class="page-info">

                Page

                <strong>
                    ${currentPage}
                </strong>

                of

                <strong>
                    ${totalPages}
                </strong>

            </div>


            <button
                class="page-button"
                onclick="
                    changePage(
                        ${currentPage + 1}
                    )
                "
                ${
                    currentPage >= totalPages
                    ? "disabled"
                    : ""
                }
            >

                Next →

            </button>

        </div>

    `;

}


// ======================================================
// RENDER MESSAGE
// ======================================================

function renderMessage(
    message
) {

    const from =
        getPhoneNumber(
            message.from ||
            message.from_number
        );


    const to =
        getPhoneNumber(
            message.to ||
            message.to_number
        );


    const status =
        message.status ||
        message.messageStatus ||
        message.message_status ||
        "Unknown";


    const statusLower =
        String(
            status
        ).toLowerCase();


    let statusClass =
        "status-pending";


    if (
        statusLower ===
        "delivered"
    ) {

        statusClass =
            "status-delivered";

    }


    if (
        statusLower.includes(
            "fail"
        )
    ) {

        statusClass =
            "status-failed";

    }


    const rawDate =
        message.creationTime ||
        message.creation_time;


    const date =
        rawDate
        ?
        new Date(
            rawDate
        ).toLocaleString()
        :
        "";


    const text =
        message.message ||
        message.subject ||
        "";


    return `

        <tr>

            <td>
                ${escapeHtml(date)}
            </td>


            <td>
                ${escapeHtml(
                    message.direction ||
                    ""
                )}
            </td>


            <td>
                ${escapeHtml(from)}
            </td>


            <td>
                ${escapeHtml(to)}
            </td>


            <td>

                <span
                    class="
                        status-badge
                        ${statusClass}
                    "
                >

                    ${escapeHtml(
                        status
                    )}

                </span>

            </td>


            <td
                class="message-text"
                title="${escapeHtml(text)}"
            >

                ${escapeHtml(text)}

            </td>

        </tr>

    `;

}


// ======================================================
// PHONE NUMBER
// ======================================================

function getPhoneNumber(
    value
) {

    if (!value) {

        return "";

    }


    if (
        typeof value ===
        "string"
    ) {

        return value;

    }


    if (
        Array.isArray(value)
    ) {

        return value
            .map(
                item =>
                    getPhoneNumber(item)
            )
            .filter(Boolean)
            .join(", ");

    }


    if (
        value.phoneNumber
    ) {

        return value.phoneNumber;

    }


    if (
        value.phone
    ) {

        return value.phone;

    }


    return "";

}


// ======================================================
// APPLY DATE FILTER
// ======================================================

function applyDateFilter() {

    const from =
        document.getElementById(
            "dateFrom"
        ).value;


    const to =
        document.getElementById(
            "dateTo"
        ).value;


    if (
        from &&
        to &&
        from > to
    ) {

        alert(
            "The start date cannot be later than the end date."
        );

        return;

    }


    currentDateFrom =
        from;


    currentDateTo =
        to;


    currentPage = 1;


    loadMessages();

}


// ======================================================
// CLEAR DATE FILTER
// ======================================================

function clearDateFilter() {

    currentDateFrom = "";

    currentDateTo = "";

    currentPage = 1;

    loadMessages();

}


// ======================================================
// SORT
// ======================================================

function changeSort(
    sort
) {

    currentSort =
        sort;


    currentPage = 1;


    loadMessages();

}


// ======================================================
// PAGE
// ======================================================

function changePage(
    page
) {

    if (
        page < 1
    ) {

        return;

    }


    currentPage =
        page;


    loadMessages();

}


// ======================================================
// REFRESH
// ======================================================

function refreshCurrentView() {

    if (
        currentExtensionId
    ) {

        loadMessages();

    } else {

        loadExtensions();

        showOverview();

    }

}


// ======================================================
// FORMAT NUMBER
// ======================================================

function formatNumber(
    value
) {

    return Number(
        value || 0
    ).toLocaleString();

}


// ======================================================
// FORMAT DATE
// ======================================================

function formatDate(
    value
) {

    if (!value) {

        return "";

    }


    const date =
        new Date(
            `${value}T00:00:00`
        );


    return date.toLocaleDateString();

}


// ======================================================
// ESCAPE HTML
// ======================================================

function escapeHtml(
    value
) {

    const div =
        document.createElement(
            "div"
        );


    div.textContent =
        value ?? "";


    return div.innerHTML;

}