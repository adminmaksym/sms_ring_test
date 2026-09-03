// ======================================================
// STATE
// ======================================================

let extensions = [];

let currentExtensionId = null;

let currentPage = 1;

let currentSort = "newest";

let currentDateFrom = "";

let currentDateTo = "";

let currentContactFilter = "all";

let currentSelectedContact = "";

let currentReportFrom = "";

let currentReportTo = "";

let extensionMessagesView = false;

let currentInlineMessageContact = "";

const exportClockValues = {
    from: { hour: null, minute: null, meridiem: null, mode: "hour" },
    to: { hour: null, minute: null, meridiem: null, mode: "hour" }
};

let gamblingAnimation = null;


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

    currentContactFilter = "all";

    currentSelectedContact = "";

    currentReportFrom = "";

    currentReportTo = "";

    extensionMessagesView = false;

    currentInlineMessageContact = "";


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

    document
        .getElementById(
            "exportButton"
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


    loadExtensionOverview();

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

    document
        .getElementById(
            "exportButton"
        )
        .classList.remove(
            "active"
        );

    document.getElementById(
        "page-title"
    ).textContent =
        "SMS Delivery Monitor";

    document.getElementById(
        "page-subtitle"
    ).textContent =
        "Track SMS performance and communication analytics";

    loadOverviewData();

}


// ======================================================
// LOAD EXTENSION OVERVIEW
// ======================================================

async function loadExtensionOverview() {

    if (!currentExtensionId) {
        return;
    }

    const content =
        document.getElementById(
            "content"
        );

    content.innerHTML = `

        <div class="loading">
            Loading extension overview...
        </div>

    `;

    try {

        const params =
            new URLSearchParams();

        if (currentReportFrom) {
            params.set(
                "dateFrom",
                currentReportFrom
            );
        }

        if (currentReportTo) {
            params.set(
                "dateTo",
                currentReportTo
            );
        }

        if (
            currentContactFilter ===
            "contact" &&
            currentSelectedContact
        ) {
            params.set(
                "contact",
                currentSelectedContact
            );
        }

        const response =
            await fetch(
                `/api/extensions/${currentExtensionId}/overview?` +
                params.toString()
            );

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}`
            );
        }

        const data =
            await response.json();

        renderExtensionOverview(data);

    } catch (error) {

        console.error(
            "Extension overview error:",
            error
        );

        content.innerHTML = `

            <div class="error-card">
                <h2>Failed to load extension overview</h2>
                <p>${escapeHtml(error.message)}</p>
            </div>

        `;

    }

}


// ======================================================
// RENDER EXTENSION OVERVIEW
// ======================================================

function renderExtensionOverview(data) {

    const content =
        document.getElementById(
            "content"
        );

    const delivered =
        Number(data.delivered || 0);

    const received =
        Number(data.received || 0);

    const failed =
        Number(data.failed || 0);

    const total =
        Number(data.total || 0);

    const uniqueChats =
        Number(data.uniqueChats || 0);

    const rate =
        Number(data.deliveryRate || 0);

    const numbers =
        data.numbers || [];

    const extension =
        getExtension(currentExtensionId) || {};

    const number =
        extension.extensionNumber ||
        currentExtensionId;

    const name =
        extension.name ||
        `Ext. ${number}`;

    const contactOptions =
        numbers.map(
            item => `
                <option value="${escapeHtml(item.number)}">
                    ${escapeHtml(item.number)}
                </option>
            `
        ).join("");

    content.innerHTML = `

        <div class="extension-overview">

            <div class="overview-toolbar">

                <div class="chat-toggle-group">

                    <button
                        class="chat-toggle ${currentContactFilter === "all" ? "active" : ""}"
                        onclick="setContactFilter('all')"
                    >
                        All Chats
                    </button>

                    <button
                        class="chat-toggle ${currentContactFilter === "contact" ? "active" : ""}"
                        onclick="setContactFilter('contact')"
                    >
                        Chats with...
                    </button>

                </div>

                <div class="contact-select-wrap ${currentContactFilter === "contact" ? "visible" : ""}">
                    <select id="contactSelect" onchange="changeSelectedContact(this.value)">
                        <option value="">Choose contact</option>
                        ${contactOptions}
                    </select>
                </div>

                <div class="report-panel">
                    <input type="date" id="extensionReportFrom" value="${escapeHtml(currentReportFrom)}" />
                    <input type="date" id="extensionReportTo" value="${escapeHtml(currentReportTo)}" />
                    <button class="primary-button" onclick="generateExtensionReport()">
                        Generate Report
                    </button>
                    <button class="primary-button" onclick="showExtensionMessages()">
                        View messages
                    </button>
                </div>

            </div>

            <div class="kpi-cards">

                <div class="kpi-card kpi-delivered">
                    <div class="kpi-icon">📤</div>
                    <div class="kpi-content">
                        <div class="kpi-label">Delivered</div>
                        <div class="kpi-value delivered-color">${delivered.toLocaleString()}</div>
                    </div>
                </div>

                <div class="kpi-card kpi-failed">
                    <div class="kpi-icon">❌</div>
                    <div class="kpi-content">
                        <div class="kpi-label">Failed</div>
                        <div class="kpi-value failed-color">${failed.toLocaleString()}</div>
                    </div>
                </div>

                <div class="kpi-card kpi-pending">
                    <div class="kpi-icon">📥</div>
                    <div class="kpi-content">
                        <div class="kpi-label">Received</div>
                        <div class="kpi-value pending-color">${received.toLocaleString()}</div>
                    </div>
                </div>

                <div class="kpi-card kpi-rate">
                    <div class="kpi-icon">👥</div>
                    <div class="kpi-content">
                        <div class="kpi-label">Unique Chats</div>
                        <div class="kpi-value">${uniqueChats.toLocaleString()}</div>
                    </div>
                </div>

                <div class="kpi-card kpi-rate">
                    <div class="kpi-icon">📊</div>
                    <div class="kpi-content">
                        <div class="kpi-label">Success Rate</div>
                        <div class="kpi-value">${rate}%</div>
                    </div>
                </div>

                <div class="kpi-card kpi-rate">
                    <div class="kpi-icon">📨</div>
                    <div class="kpi-content">
                        <div class="kpi-label">Total</div>
                        <div class="kpi-value">${total.toLocaleString()}</div>
                    </div>
                </div>

            </div>

            <div class="chart-section">
                <div class="chart-controls">
                    <label>Show data for:</label>
                    <select id="chartDateFilter" onchange="updateOverviewChart()">
                        <option value="all">All Data</option>
                        <option value="today">Today</option>
                        <option value="week">Last 7 Days</option>
                        <option value="month">Last 30 Days</option>
                        <option value="custom">Custom Date</option>
                    </select>
                    <div id="chartCustomDates" class="chart-custom-dates">
                        <input type="date" id="chartDateFrom" onchange="updateOverviewChart()" />
                        <span>to</span>
                        <input type="date" id="chartDateTo" onchange="updateOverviewChart()" />
                    </div>
                </div>

                <div id="overviewChart" class="chart-container">
                    <canvas id="deliveryChart"></canvas>
                </div>
            </div>

            <div id="extensionDataPanel" class="extension-data-panel"></div>

        </div>
    `;

    storeNumberStatsSnapshot(numbers);
    renderExtensionDataPanel(numbers);

    const chartSelect =
        document.getElementById(
            "chartDateFilter"
        );

    if (chartSelect) {
        chartSelect.value = "all";
    }

    if (document.getElementById("contactSelect")) {
        document.getElementById("contactSelect").value = currentSelectedContact || "";
    }

    loadDeliveryChart(
        "all",
        currentExtensionId,
        currentSelectedContact,
        currentContactFilter
    );

}


function renderExtensionDataPanel(numbers) {
    const panel = document.getElementById("extensionDataPanel");

    if (!panel) {
        return;
    }

    panel.dataset.numbers = JSON.stringify(Array.isArray(numbers) ? numbers : []);

    if (extensionMessagesView) {
        panel.innerHTML = `
            <div class="messages-inline-card">
                <div class="messages-panel-header">
                    <div>
                        <h3>${currentInlineMessageContact ? `Messages with ${escapeHtml(currentInlineMessageContact)}` : "All messages"}</h3>
                        <div class="messages-panel-subtitle">${currentReportFrom || currentReportTo ? `${currentReportFrom ? `From ${escapeHtml(currentReportFrom)}` : "From all dates"}${currentReportTo ? ` to ${escapeHtml(currentReportTo)}` : ""}` : "All dates"}</div>
                    </div>
                    <button class="secondary-button" onclick="backToStatistics()">Back</button>
                </div>
                <div id="extensionMessagesTable" class="messages-inline-table"></div>
            </div>
        `;

        loadExtensionMessagesInline();
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
    }

    panel.innerHTML = `
        <div class="extension-stats-section">
            <h3>Statistics by number</h3>
            <div class="number-stats-list">
                ${numbers.length ? numbers.map(item => `
                    <div class="ext-stat-item"
                        data-number="${escapeHtml(item.number)}"
                        onclick="showMessagesForContact('${String(item.number).replace(/'/g, "\\'")}')"
                        role="button"
                        tabindex="0"
                        onkeydown="if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showMessagesForContact('${String(item.number).replace(/'/g, "\\'")}'); }">
                        <div class="ext-stat-header">
                            <span class="ext-number">${escapeHtml(item.number)}</span>
                            <span class="ext-name">${item.total} messages</span>
                        </div>
                        <div class="ext-stat-metrics">
                            <div class="metric"><span class="metric-label">Delivered</span><span class="metric-value delivered-color">${item.delivered}</span></div>
                            <div class="metric"><span class="metric-label">Received</span><span class="metric-value pending-color">${item.received}</span></div>
                            <div class="metric"><span class="metric-label">Failed</span><span class="metric-value failed-color">${item.failed}</span></div>
                        </div>
                    </div>
                `).join("") : '<div class="empty">No chat statistics available.</div>'}
            </div>
        </div>
    `;
}


function setContactFilter(filter) {
    currentContactFilter = filter;

    if (filter === "all") {
        currentSelectedContact = "";
    }

    extensionMessagesView = false;
    currentInlineMessageContact = "";
    loadExtensionOverview();
}


function changeSelectedContact(value) {
    currentSelectedContact = value;

    if (value) {
        currentContactFilter = "contact";
    }

    extensionMessagesView = false;
    currentInlineMessageContact = "";
    loadExtensionOverview();
}


function showMessagesForContact(number) {
    if (!number) {
        return;
    }

    currentInlineMessageContact = number;
    currentSelectedContact = number;
    currentContactFilter = "contact";
    extensionMessagesView = true;

    const select = document.getElementById("contactSelect");
    if (select) {
        select.value = number;
    }

    renderExtensionDataPanel(getCurrentNumberStats());
}


function getCurrentNumberStats() {
    const panel = document.getElementById("extensionDataPanel");
    if (!panel) {
        return [];
    }

    const stats = panel.dataset.numbers || "[]";
    try {
        return JSON.parse(stats);
    } catch (error) {
        return [];
    }
}


function showExtensionMessages() {
    currentInlineMessageContact = "";
    extensionMessagesView = true;
    renderExtensionDataPanel(currentNumberStatsSnapshot || []);
}


function backToStatistics() {
    extensionMessagesView = false;
    currentInlineMessageContact = "";
    renderExtensionDataPanel(currentNumberStatsSnapshot || []);
}


let currentNumberStatsSnapshot = [];


function storeNumberStatsSnapshot(numbers) {
    currentNumberStatsSnapshot = Array.isArray(numbers) ? numbers : [];
}


function generateExtensionReport() {
    currentReportFrom =
        document.getElementById("extensionReportFrom")?.value || "";

    currentReportTo =
        document.getElementById("extensionReportTo")?.value || "";

    if (
        currentReportFrom &&
        currentReportTo &&
        currentReportFrom > currentReportTo
    ) {
        alert("The start date cannot be later than the end date.");
        return;
    }

    loadExtensionOverview();
}


async function loadExtensionMessagesInline() {
    const container = document.getElementById("extensionMessagesTable");

    if (!container) {
        return;
    }

    container.innerHTML = '<div class="loading">Loading messages...</div>';

    try {
        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("perPage", "500");
        params.set("sort", "newest");

        if (currentReportFrom) {
            params.set("dateFrom", currentReportFrom);
        }

        if (currentReportTo) {
            params.set("dateTo", currentReportTo);
        }

        if (currentInlineMessageContact) {
            params.set("contact", currentInlineMessageContact);
        }

        const response = await fetch(`/api/extensions/${currentExtensionId}/messages?${params.toString()}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const messages = data.records || [];

        if (!messages.length) {
            container.innerHTML = '<div class="empty">No messages found for this view.</div>';
            return;
        }

        container.innerHTML = `
            <table class="messages-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Direction</th>
                        <th>From</th>
                        <th>To</th>
                        <th>Status</th>
                        <th>Message</th>
                    </tr>
                </thead>
                <tbody>
                    ${messages.map(renderMessage).join("")}
                </tbody>
            </table>
        `;

    } catch (error) {
        console.error("Inline messages error:", error);
        container.innerHTML = `
            <div class="error-card">
                <h2>Failed to load messages</h2>
                <p>${escapeHtml(error.message)}</p>
            </div>
        `;
    }
}

// ======================================================
// LOAD OVERVIEW DATA
// ======================================================

async function loadOverviewData() {

    const content =
        document.getElementById(
            "content"
        );

    content.innerHTML = `

        <div class="loading">

            Loading overview...

        </div>

    `;

    try {

        const response =
            await fetch(
                "/api/overview"
            );

        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );

        }

        const data =
            await response.json();

        renderOverview(data);

    } catch (error) {

        console.error(
            "Overview error:",
            error
        );

        content.innerHTML = `

            <div class="error-card">

                <h2>
                    Failed to load overview
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
// RENDER OVERVIEW
// ======================================================

function renderOverview(
    data
) {

    const content =
        document.getElementById(
            "content"
        );

    const delivered =
        data.delivered || 0;

    const failed =
        data.failed || 0;

    const received =
        data.received || 0;

    const total =
        data.total || 0;

    const successRate =
        data.delivery_rate || 0;

    content.innerHTML = `

        <div class="overview-container">

            <!-- KPI CARDS -->

            <div class="kpi-cards">

                <div class="kpi-card kpi-delivered">

                    <div class="kpi-icon">📤</div>

                    <div class="kpi-content">

                        <div class="kpi-label">
                            Delivered
                        </div>

                        <div class="kpi-value delivered-color">
                            ${delivered.toLocaleString()}
                        </div>

                    </div>

                </div>

                <div class="kpi-card kpi-failed">

                    <div class="kpi-icon">❌</div>

                    <div class="kpi-content">

                        <div class="kpi-label">
                            Failed
                        </div>

                        <div class="kpi-value failed-color">
                            ${failed.toLocaleString()}
                        </div>

                    </div>

                </div>

                <div class="kpi-card kpi-pending">

                    <div class="kpi-icon">📥</div>

                    <div class="kpi-content">

                        <div class="kpi-label">
                            Received
                        </div>

                        <div class="kpi-value pending-color">
                            ${received.toLocaleString()}
                        </div>

                    </div>

                </div>

                <div class="kpi-card kpi-rate">

                    <div class="kpi-icon">📊</div>

                    <div class="kpi-content">

                        <div class="kpi-label">
                            Success Rate
                        </div>

                        <div class="kpi-value">
                            ${successRate}%
                        </div>

                    </div>

                </div>

            </div>

            <!-- CHART SECTION -->

            <div class="chart-section">

                <div class="chart-controls">

                    <label>Show data for:</label>

                    <select id="chartDateFilter" 
                        onchange="updateOverviewChart()">

                        <option value="all">
                            All Data
                        </option>

                        <option value="today">
                            Today
                        </option>

                        <option value="week">
                            Last 7 Days
                        </option>

                        <option value="month">
                            Last 30 Days
                        </option>

                        <option value="custom">
                            Custom Date
                        </option>

                    </select>

                    <div id="chartCustomDates" 
                        class="chart-custom-dates">

                        <input 
                            type="date" 
                            id="chartDateFrom"
                            onchange="updateOverviewChart()"
                        />

                        <span>to</span>

                        <input 
                            type="date" 
                            id="chartDateTo"
                            onchange="updateOverviewChart()"
                        />

                    </div>

                </div>

                <div id="overviewChart" 
                    class="chart-container">

                    <canvas id="deliveryChart"></canvas>

                </div>

            </div>

            <!-- EXTENSIONS STATISTICS -->

            <div class="extension-stats-section">

                <h3>Extension Statistics</h3>

                <div id="extensionStats" 
                    class="extension-stats-list">

                    Loading...

                </div>

            </div>

        </div>

    `;

    renderExtensionStats(
        data.extensions || []
    );

    loadDeliveryChart();

}


// ======================================================
// RENDER EXTENSION STATS
// ======================================================

function renderExtensionStats(
    extensions
) {

    const container =
        document.getElementById(
            "extensionStats"
        );

    if (!extensions.length) {

        container.innerHTML = `

            <div class="empty">

                No extension data

            </div>

        `;

        return;

    }

    let html = "";

    extensions.forEach(
        ext => {

            const rate =
                ext.deliveryRate || 0;

            const rateClass =
                rate >= 80
                    ? "rate-good"
                    : rate >= 50
                        ? "rate-medium"
                        : "rate-poor";

            html += `

                <div class="ext-stat-item">

                    <div class="ext-stat-header">

                        <span class="ext-number">
                            Ext. ${escapeHtml(
                                ext.extensionNumber
                            )}
                        </span>

                        <span class="ext-name">
                            ${escapeHtml(
                                ext.name || ""
                            )}
                        </span>

                    </div>

                    <div class="ext-stat-metrics">

                        <div class="metric">

                            <span class="metric-label">
                                Delivered
                            </span>

                            <span class="metric-value delivered-color">
                                ${ext.delivered}
                            </span>

                        </div>

                        <div class="metric">

                            <span class="metric-label">
                                Failed
                            </span>

                            <span class="metric-value failed-color">
                                ${ext.failed}
                            </span>

                        </div>

                        <div class="metric">

                            <span class="metric-label">
                                Received
                            </span>

                            <span class="metric-value pending-color">
                                ${ext.received}
                            </span>

                        </div>

                        <div class="metric">

                            <span class="metric-label">
                                Total
                            </span>

                            <span class="metric-value">
                                ${ext.total}
                            </span>

                        </div>

                        <div class="metric rate ${rateClass}">

                            <span class="metric-label">
                                Success Rate
                            </span>

                            <span class="metric-value">
                                ${rate}%
                            </span>

                        </div>

                    </div>

                </div>

            `;

        }
    );

    container.innerHTML = html;

}


// ======================================================
// LOAD DELIVERY CHART
// ======================================================

async function loadDeliveryChart(
    dateFilter = "all",
    extensionId = null,
    selectedContact = "",
    contactFilter = "all"
) {

    const canvas =
        document.getElementById(
            "deliveryChart"
        );

    if (!canvas) {
        return;
    }

    // Set canvas size to match container
    const container =
        canvas.parentElement;

    canvas.width =
        container.clientWidth - 40;

    canvas.height =
        container.clientHeight - 40;

    const ctx =
        canvas.getContext("2d");

    // Get date range
    let startDate = null;
    let endDate = null;

    const today = new Date();

    switch(dateFilter) {

        case "today":
            startDate = new Date(today);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(today);
            endDate.setHours(23, 59, 59, 999);
            break;

        case "week":
            startDate = new Date(today);
            startDate.setDate(
                today.getDate() - 7
            );
            endDate = new Date(today);
            break;

        case "month":
            startDate = new Date(today);
            startDate.setDate(
                today.getDate() - 30
            );
            endDate = new Date(today);
            break;

        case "custom":
            const dateFromInput =
                document
                    .getElementById(
                        "chartDateFrom"
                    ).value;

            const dateToInput =
                document
                    .getElementById(
                        "chartDateTo"
                    ).value;

            if (
                dateFromInput &&
                dateToInput
            ) {

                startDate =
                    new Date(
                        dateFromInput
                    );

                endDate =
                    new Date(
                        dateToInput
                    );

            }
            break;

        case "all":
        default:
            break;

    }

    // Fetch data from API
    try {

        const params =
            new URLSearchParams();

        if (startDate) {

            params.set(
                "dateFrom",
                formatDate(startDate)
            );

        }

        if (endDate) {

            params.set(
                "dateTo",
                formatDate(endDate)
            );

        }

        if (extensionId) {
            params.set(
                "extensionId",
                String(extensionId)
            );
        }

        if (
            contactFilter === "contact" &&
            selectedContact
        ) {
            params.set(
                "contact",
                selectedContact
            );
        }

        const url =
            "/api/chart-data?" +
            params.toString();

        const response =
            await fetch(url);

        if (!response.ok) {

            throw new Error(
                `HTTP ${
                    response.status
                }`
            );

        }

        const data =
            await response.json();

        drawChart(
            ctx,
            data.labels,
            data.sent,
            data.received
        );

    } catch (error) {

        console.error(
            "Chart error:",
            error
        );

        ctx.fillStyle = "white";
        ctx.fillRect(
            0, 0,
            ctx.canvas.width,
            ctx.canvas.height
        );

        ctx.fillStyle = "#ef4444";
        ctx.font = "16px Arial";
        ctx.textAlign = "center";
        ctx.fillText(
            "Failed to load chart data",
            ctx.canvas.width / 2,
            ctx.canvas.height / 2
        );

    }

}


// ======================================================
// FORMAT DATE
// ======================================================

function formatDate(date) {

    const year =
        date.getFullYear();

    const month =
        String(date.getMonth() + 1)
            .padStart(2, "0");

    const day =
        String(date.getDate())
            .padStart(2, "0");

    return `${year}-${month}-${day}`;

}


// ======================================================
// UPDATE OVERVIEW CHART
// ======================================================

async function updateOverviewChart() {

    const filter =
        document
            .getElementById(
                "chartDateFilter"
            ).value;

    const customDates =
        document
            .getElementById(
                "chartCustomDates"
            );

    // Show/hide custom date inputs
    if (filter === "custom") {

        customDates.classList.add(
            "active"
        );

    } else {

        customDates.classList.remove(
            "active"
        );

    }

    // Load chart data
    loadDeliveryChart(filter);

}


// ======================================================
// DRAW CHART
// ======================================================

function drawChart(
    ctx, 
    labels, 
    sentData,
    receivedData
) {

    // Handle empty data
    if (
        !labels ||
        !labels.length
    ) {

        ctx.fillStyle = "white";
        ctx.fillRect(
            0, 0,
            ctx.canvas.width,
            ctx.canvas.height
        );

        ctx.fillStyle = "#9ca3af";
        ctx.font = "16px Arial";
        ctx.textAlign = "center";
        ctx.fillText(
            "No data available",
            ctx.canvas.width / 2,
            ctx.canvas.height / 2
        );

        return;

    }

    const padding = 55;
    const width =
        ctx.canvas.width - 
        padding - 25;
    const height =
        ctx.canvas.height - 
        padding * 2;

    // Find max value
    const allValues = [
        ...sentData,
        ...receivedData
    ];

    const maxValue =
        Math.max(
            1,
            Math.max(...allValues)
        );

    const numPoints =
        labels.length;

    const spacing = width / Math.max(1, numPoints - 1);

    // Clear canvas
    ctx.fillStyle = "white";
    ctx.fillRect(
        0, 0, 
        ctx.canvas.width, 
        ctx.canvas.height
    );

    // Draw grid lines
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1;

    for (
        let i = 0; 
        i <= 5; 
        i++
    ) {

        const y =
            padding + 
            (height / 5) * i;

        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(
            ctx.canvas.width - 
            padding, y
        );
        ctx.stroke();

    }

    // Draw axes
    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(
        padding, padding
    );
    ctx.lineTo(
        padding, 
        ctx.canvas.height - 
        padding
    );
    ctx.lineTo(
        ctx.canvas.width - 
        padding,
        ctx.canvas.height - 
        padding
    );
    ctx.stroke();

    // Draw count labels on the vertical axis.
    ctx.fillStyle = "#6b7280";
    ctx.font = "11px Arial";
    ctx.textAlign = "right";
    for (let tick = 0; tick <= 5; tick++) {
        const value = Math.round((maxValue / 5) * (5 - tick));
        const y = padding + (height / 5) * tick;
        ctx.fillText(String(value), padding - 10, y + 4);
    }

    function drawLine(data, color) {
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();

        data.forEach((value, index) => {
            const x = padding + spacing * index;
            const y = ctx.canvas.height - padding - (value / maxValue) * height;
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        ctx.stroke();
        data.forEach((value, index) => {
            const x = padding + spacing * index;
            const y = ctx.canvas.height - padding - (value / maxValue) * height;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    drawLine(sentData, "#3b82f6");
    drawLine(receivedData, "#10b981");

    // Draw labels
    ctx.fillStyle = "#6b7280";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";

    const step = Math.ceil(
        labels.length / 12
    );

    labels.forEach(
        (label, index) => {

            if (index % step !== 0) {
                return;
            }

            const x =
                padding + 
                (spacing * index) + 
                (spacing / 2);

            const y =
                ctx.canvas.height - 
                padding + 25;

            ctx.fillText(label.slice(11, 13), x, y);

        }
    );

    // Draw legend
    const legendY = padding - 20;
    const legendX = padding;

    // Sent (blue)
    ctx.fillStyle = "#3b82f6";
    ctx.fillRect(
        legendX,
        legendY,
        12,
        12
    );

    ctx.fillStyle = "#374151";
    ctx.font = "12px Arial";
    ctx.textAlign = "left";
    ctx.fillText(
        "Sent",
        legendX + 18,
        legendY + 10
    );

    // Received (green)
    ctx.fillStyle = "#10b981";
    ctx.fillRect(
        legendX + 100,
        legendY,
        12,
        12
    );

    ctx.fillText(
        "Received",
        legendX + 118,
        legendY + 10
    );

    const chartContainer = ctx.canvas.parentElement;
    let tooltip = chartContainer.querySelector(".chart-tooltip");

    if (!tooltip) {
        tooltip = document.createElement("div");
        tooltip.className = "chart-tooltip";
        chartContainer.appendChild(tooltip);
    }

    ctx.canvas.onmousemove = event => {
        const bounds = ctx.canvas.getBoundingClientRect();
        const scaleX = ctx.canvas.width / bounds.width;
        const scaleY = ctx.canvas.height / bounds.height;
        const mouseX = (event.clientX - bounds.left) * scaleX;
        const mouseY = (event.clientY - bounds.top) * scaleY;
        const index = Math.max(0, Math.min(
            numPoints - 1,
            Math.round((mouseX - padding) / spacing)
        ));
        const pointX = padding + spacing * index;
        const nearPoint = Math.abs(mouseX - pointX) <= 28;

        if (!nearPoint) {
            tooltip.classList.remove("visible");
            return;
        }

        tooltip.innerHTML = `
            <strong>${escapeHtml(labels[index])}</strong>
            <span class="tooltip-sent">Sent: ${sentData[index]} SMS</span>
            <span class="tooltip-received">Received: ${receivedData[index]} SMS</span>
        `;
        tooltip.style.left = `${(event.clientX - bounds.left) / (bounds.width / chartContainer.clientWidth) + 12}px`;
        tooltip.style.top = `${(event.clientY - bounds.top) / (bounds.height / chartContainer.clientHeight) + 12}px`;
        tooltip.classList.add("visible");
    };

    ctx.canvas.onmouseleave = () => {
        tooltip.classList.remove("visible");
    };

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


// ======================================================
// EXPORT PANEL
// ======================================================

function showExportPanel() {

    exportClockValues.from = { hour: null, minute: null, meridiem: null, mode: "hour" };
    exportClockValues.to = { hour: null, minute: null, meridiem: null, mode: "hour" };

    currentExtensionId =
        null;

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
        .classList.remove(
            "active"
        );

    document
        .getElementById(
            "exportButton"
        )
        .classList.add(
            "active"
        );

    document.getElementById(
        "page-title"
    ).textContent =
        "Export SMS Messages";

    document.getElementById(
        "page-subtitle"
    ).textContent =
        "Select extensions and date range";

    const content =
        document.getElementById(
            "content"
        );

    content.innerHTML = `

        <div class="export-panel">

            <div class="export-section">

                <h2>Select Extensions</h2>

                <div id="exportExtensions" 
                    class="export-extensions">

                    <div class="export-loading">
                        Loading extensions...
                    </div>

                </div>

                <button
                    class="button-select-all"
                    onclick="selectAllExtensions()"
                >

                    ✓ Select All

                </button>

                <button
                    class="button-clear-all"
                    onclick="clearAllExtensions()"
                >

                    ✗ Clear All

                </button>

            </div>

            <div class="export-section">

                <h2>Date and Time Range (Kyiv time, optional)</h2>

                <div class="date-inputs">

                    <div class="date-group">

                        <label for="exportDateFromDate">
                            From:
                        </label>

                        <input
                            type="date"
                            id="exportDateFromDate"
                            class="date-input"
                            onchange="updateExportDateTime('from')"
                        />

                        <div id="exportClockFrom" class="analog-clock-picker"></div>
                        <input type="hidden" id="exportDateFrom" />

                    </div>

                    <div class="date-group">

                        <label for="exportDateToDate">
                            To:
                        </label>

                        <input
                            type="date"
                            id="exportDateToDate"
                            class="date-input"
                            onchange="updateExportDateTime('to')"
                        />

                        <div id="exportClockTo" class="analog-clock-picker"></div>
                        <input type="hidden" id="exportDateTo" />

                    </div>

                </div>

            </div>

            <div class="export-actions">

                <button
                    class="button-export"
                    onclick="performExport()"
                >

                    📥 Export to Excel

                </button>

                <div id="exportStatus" 
                    class="export-status">

                </div>

            </div>

        </div>

    `;

    renderExportExtensions();
    renderAnalogClock("from");
    renderAnalogClock("to");

}


function renderAnalogClock(which) {
    const container = document.getElementById(
        which === "from" ? "exportClockFrom" : "exportClockTo"
    );
    const state = exportClockValues[which];

    if (!container) {
        return;
    }

    const isHourMode = state.mode === "hour";
    const values = isHourMode
        ? Array.from({ length: 12 }, (_, index) => index + 1)
        : Array.from({ length: 12 }, (_, index) => index * 5);

    container.innerHTML = `
        <div class="analog-clock-header">
            <span>${isHourMode ? "Choose hour" : "Choose minutes"}</span>
            <div class="clock-time-controls">
                <strong>${formatExportClockTime(state)}</strong>
                <button type="button" class="clock-period${state.meridiem === "AM" ? " selected" : ""}" onclick="selectExportPeriod('${which}', 'AM')">AM</button>
                <button type="button" class="clock-period${state.meridiem === "PM" ? " selected" : ""}" onclick="selectExportPeriod('${which}', 'PM')">PM</button>
            </div>
        </div>
        <div class="analog-clock-face">
            <div class="clock-center"></div>
            <div class="clock-hand hour-hand" style="transform: rotate(${getClockHandAngle(state.hour, 12)}deg);"></div>
            <div class="clock-hand minute-hand" style="transform: rotate(${getClockHandAngle(state.minute, 60)}deg);"></div>
            ${values.map((value, index) => {
                const angle = index * 30;
                const label = isHourMode ? value : String(value).padStart(2, "0");
                const selected = isHourMode
                    ? state.hour === value
                    : state.minute === value;
                return `<button type="button" class="clock-number${selected ? " selected" : ""}" style="--angle:${angle}deg" onclick="selectExportClockValue('${which}', ${value})">${label}</button>`;
            }).join("")}
        </div>
        <button type="button" class="clock-clear" onclick="clearExportClock('${which}')">Clear time</button>
    `;
}


function getClockHandAngle(value, divisor) {
    return value === null ? 0 : (value / divisor) * 360;
}


function formatExportClockTime(state) {
    if (state.hour === null || state.minute === null) {
        return "--:--";
    }
    return `${String(state.hour).padStart(2, "0")}:${String(state.minute).padStart(2, "0")} ${state.meridiem || "--"}`;
}


function selectExportClockValue(which, value) {
    const state = exportClockValues[which];

    if (state.mode === "hour") {
        state.hour = value;
        state.mode = "minute";
    } else {
        state.minute = value;
        state.mode = "hour";
    }

    updateExportDateTime(which);
    renderAnalogClock(which);
}


function clearExportClock(which) {
    exportClockValues[which] = { hour: null, minute: null, meridiem: null, mode: "hour" };
    updateExportDateTime(which);
    renderAnalogClock(which);
}


function selectExportPeriod(which, meridiem) {
    exportClockValues[which].meridiem = meridiem;
    updateExportDateTime(which);
    renderAnalogClock(which);
}


function updateExportDateTime(which) {
    const state = exportClockValues[which];
    const dateInput = document.getElementById(
        which === "from" ? "exportDateFromDate" : "exportDateToDate"
    );
    const hiddenInput = document.getElementById(
        which === "from" ? "exportDateFrom" : "exportDateTo"
    );

    if (!dateInput || !hiddenInput || state.hour === null || state.minute === null || !state.meridiem) {
        if (hiddenInput) {
            hiddenInput.value = "";
        }
        return;
    }

    let hour = state.hour % 12;
    if (state.meridiem === "PM") {
        hour += 12;
    }
    hiddenInput.value = `${dateInput.value}T${String(hour).padStart(2, "0")}:${String(state.minute).padStart(2, "0")}`;
}


// ======================================================
// RENDER EXPORT EXTENSIONS
// ======================================================

function renderExportExtensions() {

    const container =
        document.getElementById(
            "exportExtensions"
        );

    if (!extensions.length) {

        container.innerHTML = `

            <div class="empty">

                No extensions available

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

            const label =
                document.createElement(
                    "label"
                );

            label.className =
                "export-extension-item";

            const checkbox =
                document.createElement(
                    "input"
                );

            checkbox.type =
                "checkbox";

            checkbox.value =
                id;

            checkbox.dataset.id =
                id;

            checkbox.className =
                "export-checkbox";

            const labelText =
                document.createElement(
                    "span"
                );

            labelText.textContent = `
                Ext. ${escapeHtml(
                    number
                )} - ${escapeHtml(
                    name
                )}
            `;

            label.appendChild(
                checkbox
            );

            label.appendChild(
                labelText
            );

            container.appendChild(
                label
            );

        }
    );

}


// ======================================================
// SELECT ALL EXTENSIONS
// ======================================================

function selectAllExtensions() {

    document
        .querySelectorAll(
            ".export-checkbox"
        )
        .forEach(
            checkbox => {

                checkbox.checked = true;

            }
        );

}


// ======================================================
// CLEAR ALL EXTENSIONS
// ======================================================

function clearAllExtensions() {

    document
        .querySelectorAll(
            ".export-checkbox"
        )
        .forEach(
            checkbox => {

                checkbox.checked = false;

            }
        );

}


// ======================================================
// PERFORM EXPORT
// ======================================================

async function performExport() {

    const checkboxes =
        document.querySelectorAll(
            ".export-checkbox:checked"
        );

    const extensionIds =
        Array.from(
            checkboxes
        ).map(
            cb =>
                parseInt(
                    cb.value
                )
        );

    const dateFrom =
        document
            .getElementById(
                "exportDateFrom"
            ).value;

    const dateTo =
        document
            .getElementById(
                "exportDateTo"
            ).value;

    const statusDiv =
        document
            .getElementById(
                "exportStatus"
            );

    if (
        !extensionIds.length
    ) {

        statusDiv.innerHTML = `

            <div class="export-error">

                Please select at least 
                one extension
                
            </div>

        `;

        return;

    }

    statusDiv.innerHTML = `

        <div class="export-loading">

            Preparing export...

        </div>

    `;

    try {

        const response =
            await fetch(
                "/api/export",
                {

                    method: "POST",

                    headers: {

                        "Content-Type":
                            "application/json"

                    },

                    body: JSON.stringify({

                        extensionIds,

                        dateFrom: (
                            dateFrom || null
                        ),

                        dateTo: (
                            dateTo || null
                        )

                    })

                }
            );

        if (!response.ok) {

            const error =
                await response
                    .json();

            throw new Error(
                error.error ||
                "Export failed"
            );

        }

        const blob =
            await response.blob();

        const url =
            URL.createObjectURL(
                blob
            );

        const link =
            document
                .createElement("a");

        link.href = url;

        link.download = (

            `SMS_Export_${
                new Date()
                    .toISOString()
                    .split("T")[0]
            }.xlsx`

        );

        document
            .body
            .appendChild(
                link
            );

        link.click();

        document
            .body
            .removeChild(
                link
            );

        URL.revokeObjectURL(
            url
        );

        statusDiv.innerHTML = `

            <div class="export-success">

                ✓ Export completed 
                successfully!
                
            </div>

        `;

    } catch (error) {

        console.error(
            "Export error:",
            error
        );

        statusDiv.innerHTML = `

            <div class="export-error">

                ❌ Export failed: ${
                    escapeHtml(
                        error.message
                    )
                }
                
            </div>

        `;

    }

}


// ======================================================
// GAMBLING SLOT MACHINE
// ======================================================

function showGamblingModal() {
    closeGamblingModal();

    const modal = document.createElement("div");
    modal.id = "gamblingModal";
    modal.className = "gambling-modal";
    modal.innerHTML = `
        <div class="gambling-window" role="dialog" aria-modal="true" aria-labelledby="gamblingTitle">
            <button class="gambling-close" type="button" onclick="closeGamblingModal()" aria-label="Close">&times;</button>
            <div class="gambling-kicker">Lucky break</div>
            <h2 id="gamblingTitle">Безрукий поганец</h2>
            <p class="gambling-subtitle">Полный демикс транспортейшн.</p>

            <div class="slot-machine" aria-live="polite">
                <div class="slot-topline"><span>SMS JACKPOT</span><span id="gamblingStatus">Ready to roll</span></div>
                <div class="slot-stage">
                    <div class="slot-reels">
                        <div class="slot-reel"><span id="slotOne">7</span></div>
                        <div class="slot-reel"><span id="slotTwo">★</span></div>
                        <div class="slot-reel"><span id="slotThree">7</span></div>
                    </div>
                    <button class="slot-lever" type="button" onclick="startGambling()" aria-label="Pull slot machine lever">
                        <span class="lever-arm"><span class="lever-ball"></span></span>
                    </button>
                </div>
                <div class="slot-payline"></div>
                <div class="slot-bottomline">GOOD LUCK, HAVE FUN</div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener("click", event => {
        if (event.target === modal) {
            closeGamblingModal();
        }
    });
}


function startGambling() {
    const status = document.getElementById("gamblingStatus");
    const reels = ["slotOne", "slotTwo", "slotThree"];
    const symbols = ["7", "★", "♦", "BAR", "🍒", "☘"];

    if (!status) {
        return;
    }

    window.cancelAnimationFrame(gamblingAnimation);
    const lever = document.querySelector(".slot-lever");
    if (lever) {
        lever.classList.remove("pulled");
        void lever.offsetWidth;
        lever.classList.add("pulled");
    }
    status.textContent = "Reels rolling...";
    document.querySelectorAll(".slot-reel").forEach(reel => reel.classList.add("rolling"));
    const startedAt = Date.now();
    const roll = () => {
        reels.forEach((id, index) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = symbols[Math.floor(Math.random() * symbols.length)];
                element.style.transform = `translateY(${Math.sin(Date.now() / 50 + index) * 5}px)`;
            }
        });

        if (Date.now() - startedAt < 2600) {
            gamblingAnimation = window.requestAnimationFrame(roll);
            return;
        }

        document.querySelectorAll(".slot-reel").forEach(reel => reel.classList.remove("rolling"));
        reels.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.style.transform = "";
            }
        });
        status.textContent = "The house says: enjoy the spin";
    };
    roll();
}


function closeGamblingModal() {
    window.cancelAnimationFrame(gamblingAnimation);
    const modal = document.getElementById("gamblingModal");
    if (modal) {
        modal.remove();
    }
}