// ==UserScript==
// @name         RainPOS Invoice Class Date
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Find a scope on an element and log a specific value (and updates) to the console.
// @match        https://*.rainadmin.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  /*******************
   * Config (both modals)
   *******************/
  const ENABLED = { transaction: true, invoice: true };

  // Shared badge visuals
  const BADGE_CLASS = "__tm-start-date-badge";
  const makeDisplay = (text) => (text ? `Date: ${text}` : "");

  // Modal definitions (selectors + per-row accessors)
  const MODALS = {
    transaction: {
      enabled: ENABLED.transaction,
      name: "txn",
      modalSel: "#tran_dialog",
      tableSel: ".modal-body table.table-striped", // unique to txn modal per your DOM
      rowSels: ['tr[ng-repeat*="transaction.classes"]'], // only classes rows
      getLine: (tr) => safeScope(tr)?.line,
      getDate: (line) =>
        line?.start_date ||
        line?.section_info?.start_date ||
        line?.first_start_date ||
        line?.item_details?.start_date ||
        line?.date,
    },
    invoice: {
      enabled: ENABLED.invoice,
      name: "inv",
      modalSel: "#invoice_dialog",
      tableSel: ".modal-body table.table", // adjust if your invoice table differs
      // keep it tight on classes so we don't tag product/repair rows
      rowSels: ['tr[ng-repeat*="invoice.sorted_items.classes"]'],
      getLine: (tr) => safeScope(tr)?.line,
      getDate: (line) =>
        line?.start_date ||
        line?.section_info?.start_date ||
        line?.first_start_date ||
        line?.item_details?.start_date ||
        line?.date,
    },
  };

  /*******************
   * Small utilities
   *******************/
  const log = (m, ...a) => console.log("[start-date]", m, ...a);
  const warn = (m, ...a) => console.warn("[start-date]", m, ...a);

  // Wait for AngularJS
  function waitForAngular(deadline = Date.now() + 15000) {
    return new Promise((resolve, reject) => {
      (function tick() {
        if (window.angular && typeof angular.element === "function")
          return resolve();
        if (Date.now() > deadline)
          return reject(new Error("AngularJS not detected"));
        setTimeout(tick, 100);
      })();
    });
  }

  // ng scope helper (won’t throw on missing)
  function safeScope(el) {
    try {
      const $ = angular.element(el);
      return (
        ($.isolateScope && $.isolateScope()) || ($.scope && $.scope()) || null
      );
    } catch (_) {
      return null;
    }
  }

  // Modal open?
  function isOpen(modal) {
    if (!modal) return false;
    const aria = modal.getAttribute("aria-hidden");
    const disp = modal.style?.display;
    return (
      (/\b(in|show)\b/.test(modal.className) || aria === "false") &&
      disp !== "none"
    );
  }

  // Format: "Oct 10th" or "Oct 10th 2026" if not current year
  function fmt(raw) {
    if (!raw) return "";

    const d = new Date(String(raw).replace(" ", "T"));
    if (isNaN(d)) return String(raw).trim();

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const month = monthNames[d.getMonth()];
    const day = d.getDate();

    // Determine ordinal suffix
    const suffix =
      day % 10 === 1 && day !== 11
        ? "st"
        : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
        ? "rd"
        : "th";

    const currentYear = new Date().getFullYear();
    const year = d.getFullYear();

    // Include year only if it's not the current one
    return `${month} ${day}${suffix}${year !== currentYear ? " " + year : ""}`;
  }

  // Create/update the inline chip in the row’s first (Items) cell
  function upsertBadgeInItemsCell(row, displayText) {
    const td =
      row.querySelector(":scope > td:first-child") ||
      row.querySelector("td.ng-binding");
    if (!td) return;

    let chip = td.querySelector("." + BADGE_CLASS);
    if (!chip) {
      chip = document.createElement("span");
      chip.className = BADGE_CLASS;
      // Inline "pill" styling — minimal + unobtrusive
      chip.style.display = "inline-block";
      chip.style.marginLeft = "8px";
      chip.style.padding = "2px 6px";
      chip.style.borderRadius = "8px";
      chip.style.fontSize = "11px";
      chip.style.lineHeight = "1.2";
      chip.style.verticalAlign = "baseline";
      chip.style.background = "rgba(0,0,0,0.08)";
      chip.style.color = "#333";
      chip.style.whiteSpace = "nowrap";
      chip.style.pointerEvents = "none";
      td.appendChild(chip);
      // Try to avoid clipping
      td.style.overflow = "visible";
    }
    if (chip.textContent !== displayText) {
      chip.textContent = displayText;
      td.title = displayText;
    }
  }

  // Mutation filtering: ignore our own chip edits
  function isOurNode(n) {
    return n && n.nodeType === 1 && n.classList?.contains(BADGE_CLASS);
  }
  function mutationTouchesUs(m) {
    if (isOurNode(m.target)) return true;
    const added = [...(m.addedNodes || [])].some(isOurNode);
    const removed = [...(m.removedNodes || [])].some(isOurNode);
    return added || removed;
  }

  /*******************
   * Per-modal engine
   *******************/
  function processModal(modal, cfg) {
    const table = modal.querySelector(cfg.tableSel);
    if (!table) return;

    // Collect rows from all configured selectors
    const rows = cfg.rowSels.flatMap((sel) => [...table.querySelectorAll(sel)]);
    if (!rows.length) return;

    rows.forEach((tr, i) => {
      const line = cfg.getLine(tr);
      const raw = cfg.getDate(line);
      const out = fmt(raw);
      upsertBadgeInItemsCell(tr, makeDisplay(out));
    });
  }

  function attachModal(modal, cfg) {
    // Initial render
    processModal(modal, cfg);

    // Scoped observer for this modal only
    const obs = new MutationObserver((muts) => {
      // Only react if something under our table changed, and it wasn't our own chip
      const meaningful = muts.some((m) => {
        if (mutationTouchesUs(m)) return false;
        const t = m.target;
        return t && t.closest && t.closest(cfg.tableSel);
      });
      if (meaningful) processModal(modal, cfg);
    });
    obs.observe(modal, { childList: true, subtree: true, attributes: true });
  }

  function wireModal(cfg) {
    if (!cfg.enabled) return;
    const modal = document.querySelector(cfg.modalSel);
    if (!modal) return;

    // Attach when opened
    const maybeAttach = () => {
      if (isOpen(modal)) attachModal(modal, cfg);
    };
    if (isOpen(modal)) attachModal(modal, cfg);

    const attrObs = new MutationObserver(() => maybeAttach());
    attrObs.observe(modal, {
      attributes: true,
      attributeFilter: ["class", "style", "aria-hidden"],
    });
  }

  /*******************
   * Boot
   *******************/
  (async () => {
    try {
      await waitForAngular();
    } catch (e) {
      warn("AngularJS not detected; aborting.");
      return;
    }
    // Wire both modals independently
    Object.values(MODALS).forEach(wireModal);
    log("Start Date Chip loaded (txn+inv).");
  })();
})();
