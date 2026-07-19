// ==UserScript==
// @name         LikeSew Transaction Presence Client
// @namespace    https://creativepursuitsquilting.com/
// @version      0.3.2
// @description  Shows when a suspended LikeSew transaction may be open on another Creative Pursuits register.
// @match        https://*.rainadmin.com/pos-app/*
// @run-at       document-start
// @inject-into  page
// @weight       999
// @noframes
// @grant        none
// ==/UserScript==

(function () {
    "use strict";
  
    const CONFIG_KEY = "creative-pursuits:likesew-presence:config";
    const ACTIVE_TRANSACTION_KEY =
      "creative-pursuits:likesew-presence:active-transaction";
    const RESUME_ROW_SELECTOR =
      '#modalSuspendedTransactions li[ng-repeat*="getSuspendedTransactions"]';
    const PRESENCE_BADGE_CLASS = "likesew-transaction-presence-badge";
  
    const DASHBOARD_BASE_URL = "https://creative-pursuits-dashboard.vercel.app";
  
    let settingsButton;
    let settingsStatusDot;
    let settingsLabel;
    let dialogBackdrop;
    let decorateTimer;
    const pendingResumeIds = new Set();
    let assignmentsByTransaction = new Map();
  
    function loadConfig() {
      try {
        const parsed = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null");
        if (
          !parsed ||
          typeof parsed !== "object" ||
          typeof parsed.token !== "string" ||
          typeof parsed.deviceId !== "string" ||
          typeof parsed.deviceName !== "string"
        ) {
          return null;
        }
        return parsed;
      } catch (_error) {
        return null;
      }
    }
  
    function saveConfig(config) {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    }
  
    function clearConfig() {
      localStorage.removeItem(CONFIG_KEY);
      localStorage.removeItem(ACTIVE_TRANSACTION_KEY);
    }
  
    function loadActiveTransactionId() {
      return localStorage.getItem(ACTIVE_TRANSACTION_KEY);
    }
  
    function saveActiveTransactionId(transactionId) {
      localStorage.setItem(ACTIVE_TRANSACTION_KEY, transactionId);
    }
  
    function clearActiveTransactionId(transactionId) {
      if (loadActiveTransactionId() === transactionId) {
        localStorage.removeItem(ACTIVE_TRANSACTION_KEY);
      }
    }
  
    async function presenceRequest(path, options = {}) {
      const config = loadConfig();
      if (!config) throw new Error("Transaction presence is not configured");
  
      const response = await fetch(`${DASHBOARD_BASE_URL}${path}`, {
        method: options.method || "GET",
        headers: {
          Authorization: `Bearer ${config.token}`,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        cache: "no-store",
        credentials: "omit",
      });
  
      let body = null;
      try {
        body = await response.json();
      } catch (_error) {
        // A non-JSON response is handled by the status error below.
      }
  
      if (!response.ok) {
        throw new Error(body?.error || `Presence request failed with status ${response.status}`);
      }
      return body;
    }
  
    async function verifyConnection(token) {
      const response = await fetch(`${DASHBOARD_BASE_URL}/api/likesew-presence/me`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
        credentials: "omit",
      });
  
      let body = null;
      try {
        body = await response.json();
      } catch (_error) {
        // A non-JSON response is handled by the status error below.
      }
  
      if (!response.ok) {
        const message = body?.error || `Connection failed with status ${response.status}`;
        throw new Error(message);
      }
  
      if (
        !body ||
        typeof body.deviceId !== "string" ||
        typeof body.deviceName !== "string"
      ) {
        throw new Error("The dashboard returned an invalid device response");
      }
  
      return {
        deviceId: body.deviceId,
        deviceName: body.deviceName,
      };
    }
  
    async function fetchAssignments() {
      const config = loadConfig();
      if (!config) return;
  
      try {
        const body = await presenceRequest("/api/likesew-presence/assignments");
        const assignments = Array.isArray(body?.assignments) ? body.assignments : [];
        assignmentsByTransaction = new Map(
          assignments
            .filter(
              (assignment) =>
                assignment &&
                assignment.deviceId !== config.deviceId &&
                typeof assignment.deviceName === "string" &&
                typeof assignment.transactionId === "string"
            )
            .map((assignment) => [assignment.transactionId, assignment])
        );
        queueDecorateRows();
      } catch (error) {
        console.warn("[Transaction Presence] Unable to load assignments", error);
      }
    }
  
    async function assignTransaction(transactionId) {
      if (!loadConfig()) return;
      saveActiveTransactionId(transactionId);
  
      try {
        await presenceRequest("/api/likesew-presence/assign", {
          method: "POST",
          body: { transactionId },
        });
        await fetchAssignments();
      } catch (error) {
        console.warn("[Transaction Presence] Unable to assign transaction", error);
      }
    }
  
    async function clearTransaction(transactionId) {
      if (!transactionId) return;
      clearActiveTransactionId(transactionId);
      if (!loadConfig()) return;
  
      try {
        await presenceRequest("/api/likesew-presence/clear", {
          method: "POST",
          body: { transactionId },
        });
        await fetchAssignments();
      } catch (error) {
        console.warn("[Transaction Presence] Unable to clear transaction", error);
      }
    }
  
    function parseUrl(url) {
      try {
        return new URL(url, window.location.origin);
      } catch (_error) {
        return null;
      }
    }
  
    function parseJson(value) {
      if (typeof value !== "string" || value.length === 0) return null;
      try {
        return JSON.parse(value);
      } catch (_error) {
        return null;
      }
    }
  
    function transactionIdFromResponse(xhr) {
      return parseJson(xhr.responseText)?.data?.pos_transaction_id ?? null;
    }
  
    function observeSuccessfulLikeSewRequest(xhr, request) {
      if (xhr.status < 200 || xhr.status >= 300) return;
      const url = parseUrl(request.url);
      if (!url) return;
  
      if (url.pathname.endsWith("/api/transaction/transaction_suspended.proc.php")) {
        fetchAssignments();
        return;
      }
  
      if (url.pathname !== "/pos-app/api/till/") return;
  
      const transactionId = url.searchParams.get("id");
      if (
        request.method === "GET" &&
        transactionId &&
        url.searchParams.get("distinctPitrs") === "1"
      ) {
        pendingResumeIds.add(transactionId);
        return;
      }
  
      if (
        request.method === "GET" &&
        transactionId &&
        !url.searchParams.has("distinctPitrs") &&
        pendingResumeIds.has(transactionId)
      ) {
        pendingResumeIds.delete(transactionId);
        assignTransaction(transactionId);
        return;
      }
  
      if (request.method !== "POST" && request.method !== "PUT") return;
      const requestBody = parseJson(request.body);
      if (!requestBody || (requestBody.mode !== "pause" && requestBody.mode !== "finish")) {
        return;
      }
  
      const savedTransactionId = transactionIdFromResponse(xhr);
      const activeTransactionId = loadActiveTransactionId();
      clearTransaction(String(savedTransactionId || activeTransactionId || ""));
    }
  
    function installXhrHooks() {
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
  
      XMLHttpRequest.prototype.open = function (method, url) {
        this.__transactionPresenceRequest = {
          method: String(method).toUpperCase(),
          url: String(url),
          body: null,
        };
        return originalOpen.apply(this, arguments);
      };
  
      XMLHttpRequest.prototype.send = function (body) {
        const request = this.__transactionPresenceRequest;
        if (request) {
          request.body = typeof body === "string" ? body : null;
          this.addEventListener(
            "loadend",
            () => {
              try {
                observeSuccessfulLikeSewRequest(this, request);
              } catch (error) {
                console.warn("[Transaction Presence] Unable to inspect LikeSew request", error);
              }
            },
            { once: true }
          );
        }
        return originalSend.apply(this, arguments);
      };
    }
  
    function element(tag, options = {}) {
      const node = document.createElement(tag);
      if (options.text) node.textContent = options.text;
      if (options.className) node.className = options.className;
      if (options.style) node.style.cssText = options.style;
      return node;
    }
  
    function getRowTransactionId(row) {
      try {
        if (!window.angular || typeof window.angular.element !== "function") return null;
        const wrapped = window.angular.element(row);
        const scope =
          (typeof wrapped.scope === "function" && wrapped.scope()) ||
          (typeof wrapped.inheritedData === "function" && wrapped.inheritedData("$scope"));
        return scope?.t?.id == null ? null : String(scope.t.id);
      } catch (_error) {
        return null;
      }
    }
  
    function createPresenceBadge(deviceName) {
      const badge = element("div", {
        className: PRESENCE_BADGE_CLASS,
        style: [
          "display:flex",
          "align-items:center",
          "gap:5px",
          "width:max-content",
          "max-width:calc(100% - 36px)",
          "margin-top:5px",
          "padding:3px 7px",
          "border:1px solid #d6a000",
          "border-radius:4px",
          "background:#fff4c2",
          "color:#624a00",
          "font-size:11px",
          "font-weight:600",
          "line-height:1.25",
        ].join(";"),
      });
      badge.setAttribute("role", "note");
      badge.setAttribute("aria-label", `This transaction may be open on ${deviceName}`);
      const icon = element("span", { text: "⚠" });
      icon.setAttribute("aria-hidden", "true");
      badge.append(icon, element("span", { text: `May be open on ${deviceName}` }));
      badge.dataset.deviceName = deviceName;
      return badge;
    }
  
    function decorateResumeRows() {
      for (const row of document.querySelectorAll(RESUME_ROW_SELECTOR)) {
        const transactionId = getRowTransactionId(row);
        if (!transactionId) continue;
  
        const assignment = assignmentsByTransaction.get(transactionId);
        const existingBadge = row.querySelector(`:scope > .${PRESENCE_BADGE_CLASS}`);
        if (!assignment) {
          existingBadge?.remove();
        } else if (existingBadge?.dataset.deviceName !== assignment.deviceName) {
          existingBadge?.remove();
          row.append(createPresenceBadge(assignment.deviceName));
        }
      }
    }
  
    function queueDecorateRows() {
      window.clearTimeout(decorateTimer);
      decorateTimer = window.setTimeout(decorateResumeRows, 0);
    }
  
    function installPresenceDomHooks() {
      document.addEventListener(
        "click",
        (event) => {
          const target = event.target instanceof Element ? event.target : null;
          if (!target) return;
  
          if (target.closest('[data-cy="regClearTillConfirm"]')) {
            clearTransaction(loadActiveTransactionId());
            return;
          }
  
          if (target.closest('[data-cy="regCancelTransaction"]')) {
            window.setTimeout(() => {
              const confirmation = document.querySelector("#confirmClearTill");
              const confirmationVisible =
                confirmation?.classList.contains("in") ||
                (confirmation && window.getComputedStyle(confirmation).display !== "none");
              if (!confirmationVisible) clearTransaction(loadActiveTransactionId());
            }, 0);
          }
        },
        true
      );
  
      const observeModal = () => {
        const modal = document.querySelector("#modalSuspendedTransactions");
        if (!modal) return false;
        new MutationObserver(queueDecorateRows).observe(modal, {
          childList: true,
          subtree: true,
        });
        return true;
      };
  
      if (!observeModal()) {
        const discoveryObserver = new MutationObserver(() => {
          if (observeModal()) discoveryObserver.disconnect();
        });
        discoveryObserver.observe(document.documentElement, {
          childList: true,
          subtree: true,
        });
      }
    }
  
    function inputRow(labelText, input) {
      const wrapper = element("label", {
        style: "display:block;margin:0 0 12px;font-weight:600;",
      });
      wrapper.append(
        element("span", { text: labelText, style: "display:block;margin-bottom:4px;" }),
        input
      );
      return wrapper;
    }
  
    function closeDialog() {
      dialogBackdrop?.remove();
      dialogBackdrop = null;
    }
  
    function updateSettingsButton() {
      if (!settingsButton) return;
      const config = loadConfig();
      settingsStatusDot.style.background = config ? "#71d07b" : "#f2c94c";
      settingsStatusDot.style.boxShadow = config
        ? "0 0 0 2px rgba(113,208,123,.2)"
        : "0 0 0 2px rgba(242,201,76,.2)";
      settingsLabel.textContent = "Presence";
      settingsButton.title = config
        ? `Transaction presence: ${config.deviceName}`
        : "Set up transaction presence";
      settingsButton.setAttribute("aria-label", settingsButton.title);
    }
  
    function openSetupDialog(options = {}) {
      closeDialog();
  
      const existingConfig = loadConfig();
      const isRequired = options.required === true && !existingConfig;
  
      dialogBackdrop = element("div", {
        style: [
          "position:fixed",
          "inset:0",
          "z-index:2147483647",
          "display:flex",
          "align-items:center",
          "justify-content:center",
          "padding:20px",
          "background:rgba(0,0,0,.48)",
          "font:14px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
        ].join(";"),
      });
  
      const dialog = element("section", {
        style: [
          "width:min(460px,100%)",
          "padding:20px",
          "border-radius:8px",
          "background:#fff",
          "color:#222",
          "box-shadow:0 12px 45px rgba(0,0,0,.35)",
        ].join(";"),
      });
  
      const headingRow = element("div", {
        style: "display:flex;align-items:start;justify-content:space-between;gap:12px;",
      });
      const heading = element("h2", {
        text: "Transaction Presence Setup",
        style: "margin:0;font-size:20px;",
      });
      headingRow.append(heading);
  
      if (!isRequired) {
        const close = element("button", {
          text: "×",
          style: "border:0;background:transparent;font-size:24px;cursor:pointer;line-height:1;",
        });
        close.type = "button";
        close.setAttribute("aria-label", "Close transaction presence settings");
        close.addEventListener("click", closeDialog);
        headingRow.append(close);
      }
  
      const explanation = element("p", {
        text: "Enter this register's device token. The dashboard will identify which device the token belongs to.",
        style: "margin:8px 0 16px;color:#555;",
      });
  
      const tokenInput = document.createElement("input");
      tokenInput.type = "password";
      tokenInput.required = true;
      tokenInput.autocomplete = "off";
      tokenInput.placeholder = existingConfig
        ? "Enter a token to replace the saved token"
        : "Paste device token";
      tokenInput.style.cssText =
        "width:100%;padding:8px 56px 8px 8px;box-sizing:border-box;border:1px solid #bbb;border-radius:4px;";

      const tokenInputWrapper = element("div", {
        style: "position:relative;",
      });
      const toggleTokenVisibility = element("button", {
        text: "Show",
        style:
          "position:absolute;right:2px;top:2px;bottom:2px;padding:0 9px;border:0;border-left:1px solid #ddd;background:#f7f7f7;color:#286090;font-size:12px;font-weight:600;cursor:pointer;",
      });
      toggleTokenVisibility.type = "button";
      toggleTokenVisibility.setAttribute("aria-label", "Show device token");
      toggleTokenVisibility.setAttribute("aria-pressed", "false");
      toggleTokenVisibility.addEventListener("click", () => {
        const showToken = tokenInput.type === "password";
        tokenInput.type = showToken ? "text" : "password";
        toggleTokenVisibility.textContent = showToken ? "Hide" : "Show";
        toggleTokenVisibility.setAttribute(
          "aria-label",
          `${showToken ? "Hide" : "Show"} device token`
        );
        toggleTokenVisibility.setAttribute("aria-pressed", String(showToken));
        tokenInput.focus();
      });
      tokenInputWrapper.append(tokenInput, toggleTokenVisibility);
  
      const currentDevice = existingConfig
        ? element("div", {
            text: `Currently configured as ${existingConfig.deviceName}`,
            style:
              "margin:-2px 0 14px;padding:8px;border:1px solid #a9d4aa;border-radius:4px;background:#eef8ee;color:#2f5e30;font-weight:600;",
          })
        : null;
  
      const status = element("div", {
        style: "min-height:20px;margin:4px 0 10px;color:#555;",
      });
  
      const actions = element("div", {
        style: "display:flex;align-items:center;justify-content:space-between;gap:8px;",
      });
      const leftActions = element("div", { style: "display:flex;gap:7px;" });
      const rightActions = element("div", { style: "display:flex;gap:7px;" });
  
      const reset = element("button", {
        text: "Reset",
        style:
          "padding:7px 10px;border:1px solid #aaa;border-radius:4px;background:#fff;cursor:pointer;",
      });
      reset.type = "button";
      reset.disabled = !existingConfig;
      reset.addEventListener("click", () => {
        clearConfig();
        updateSettingsButton();
        closeDialog();
        openSetupDialog({ required: true });
      });
  
      const cancel = element("button", {
        text: "Cancel",
        style:
          "padding:7px 10px;border:1px solid #aaa;border-radius:4px;background:#fff;cursor:pointer;",
      });
      cancel.type = "button";
      cancel.addEventListener("click", closeDialog);
  
      const connect = element("button", {
        text: existingConfig ? "Test and save" : "Connect",
        style:
          "padding:8px 12px;border:1px solid #286090;border-radius:4px;background:#337ab7;color:#fff;font-weight:600;cursor:pointer;",
      });
      connect.type = "button";
      connect.addEventListener("click", async () => {
        const token = tokenInput.value.trim() || existingConfig?.token || "";
  
        if (!token) {
          status.textContent = "Device token is required.";
          status.style.color = "#a94442";
          return;
        }
  
        connect.disabled = true;
        connect.textContent = "Connecting…";
        status.textContent = "Testing the dashboard connection…";
        status.style.color = "#555";
  
        try {
          const device = await verifyConnection(token);
          saveConfig({ token, ...device });
          status.textContent = `Connected as ${device.deviceName}.`;
          status.style.color = "#2f5e30";
          updateSettingsButton();
          fetchAssignments();
          window.setTimeout(closeDialog, 700);
        } catch (error) {
          status.textContent =
            error instanceof Error ? error.message : "Unable to connect to the dashboard";
          status.style.color = "#a94442";
        } finally {
          connect.disabled = false;
          connect.textContent = existingConfig ? "Test and save" : "Connect";
        }
      });
  
      leftActions.append(reset);
      if (!isRequired) rightActions.append(cancel);
      rightActions.append(connect);
      actions.append(leftActions, rightActions);
  
      dialog.append(
        headingRow,
        explanation,
        inputRow("Device token", tokenInputWrapper)
      );
      if (currentDevice) dialog.append(currentDevice);
      dialog.append(status, actions);
      dialogBackdrop.append(dialog);
      document.body.append(dialogBackdrop);
      tokenInput.focus();
    }
  
    function installSettingsButton() {
      settingsButton = element("button", {
        style: [
          "position:fixed",
          "left:7px",
          "bottom:8px",
          "z-index:2147483000",
          "display:flex",
          "flex-direction:column",
          "align-items:center",
          "justify-content:center",
          "gap:3px",
          "width:66px",
          "min-height:42px",
          "padding:5px 3px",
          "border:1px solid rgba(255,255,255,.18)",
          "border-radius:5px",
          "background:#173b5f",
          "color:#dceaf5",
          "font:9px/1.15 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
          "font-weight:500",
          "cursor:pointer",
          "box-shadow:0 2px 7px rgba(0,0,0,.2)",
        ].join(";"),
      });
      settingsButton.type = "button";
  
      const iconRow = element("span", {
        style: "display:flex;align-items:center;justify-content:center;gap:5px;font-size:13px;",
      });
      const gear = element("span", { text: "⚙" });
      gear.setAttribute("aria-hidden", "true");
      settingsStatusDot = element("span", {
        style: "display:block;width:7px;height:7px;border-radius:50%;",
      });
      settingsStatusDot.setAttribute("aria-hidden", "true");
      settingsLabel = element("span", { text: "Presence" });
      iconRow.append(gear, settingsStatusDot);
      settingsButton.append(iconRow, settingsLabel);
  
      settingsButton.addEventListener("click", () => openSetupDialog());
      (document.querySelector("#systemNav") || document.body).append(settingsButton);
      updateSettingsButton();
    }
  
    installXhrHooks();
  
    function start() {
      installSettingsButton();
      installPresenceDomHooks();
      if (loadConfig()) {
        fetchAssignments();
      } else {
        openSetupDialog({ required: true });
      }
    }
  
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  })();
  
