// ==UserScript==
// @name         LikeSew Work Order Column Hider
// @namespace    https://creativepursuitsquilting.com/
// @version      1.1.0
// @description  Hides unused columns on the LikeSew work orders page.
// @match        https://rainadmin.com/*
// @match        https://*.rainadmin.com/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    if (window.location.pathname !== "/pos-app/repair/work_orders.php") return;

    const STYLE_ID = "likesew-work-order-hidden-columns";
    const TABLE_SELECTOR =
        '.onyx-grid-table-wrapper[data-cy="work-orders-table"]';

    const GRID_COLUMNS = [
        "44px",                            // Selection
        "minmax(86px, 1.1fr)",            // ID
        "minmax(135px, 2.25fr)",          // First Name
        "minmax(135px, 2.25fr)",          // Last Name
        "minmax(225px, 3.75fr)",          // Status
        "minmax(95px, 1.58fr)",           // Make
        "minmax(95px, 1.58fr)",           // Model
        "minmax(120px, 2fr)",             // Serial
        "minmax(99px, 1.65fr)",           // In Date
        "minmax(102px, 1.7fr)",           // Bin Location
        "minmax(48px, 0.8fr)",            // Tag
        "minmax(72px, 1.2fr)",            // Deposit
        "minmax(86px, 1.43fr)",           // Price
    ].join(" ");

    const HIDDEN_SELECTORS = [
        '[data-cy="wo-sort-upc"]',
        '.table-cell:has([data-cy="work-orders-upc"])',
        '[data-cy="wo-sort-sku"]',
        '.table-cell:has([data-cy="work-orders-sku"])',
        '[data-cy="wo-sort-department"]',
        '.table-cell:has([data-cy="work-orders-department"])',
        '[data-cy="wo-sort-target-date"]',
        '.table-cell:has([data-cy="work-orders-target-date"])',
        '[data-cy="wo-sort-pickup-date"]',
        '.table-cell:has([data-cy="work-orders-pickup-date"])',
        '[data-cy="wo-sort-completed-date"]',
        '.table-cell:has([data-cy="work-orders-completed-date"])',
        '[data-cy="wo-sort-location"]',
        '.table-cell:has([data-cy="work-orders-location"])',
        '[data-cy="wo-sort-technician"]',
        '.table-cell:has([data-cy="work-orders-technician"])',
    ].map((selector) => `${TABLE_SELECTOR} ${selector}`);

    function installStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const parent = document.head || document.documentElement;
        if (!parent) {
            setTimeout(installStyles, 0);
            return;
        }

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
${TABLE_SELECTOR} {
    --grid-table-columns: ${GRID_COLUMNS} !important;
    --grid-row-width: 1342px !important;
}

${HIDDEN_SELECTORS.join(",\n")} {
    display: none !important;
}
`;

        parent.appendChild(style);
        console.info("[LikeSew Column Hider] Active on the work orders page.");
    }

    installStyles();
})();
