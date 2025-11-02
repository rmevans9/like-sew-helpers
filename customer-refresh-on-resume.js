// ==UserScript==
// @name         RainPOS - Auto Refresh Customer on Resume Transaction
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Automatically clears and re-selects customer when resuming a transaction to fix invoice loading issue
// @author       Your Name
// @match        https://*.rainadmin.com/pos-app/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    /**
     * Gets the currently selected customer's name
     * @returns {string|null} The customer's full name or null if no customer selected
     */
    function getSelectedCustomerName() {
        const clearBtn = document.querySelector('.fa-remove');
        if (!clearBtn) {
            return null; // No customer selected
        }

        // Find the customer name span (it's a .btn-link.ng-binding element near the clear button)
        const parentDiv = clearBtn.closest('div[ng-if], div[ng-show]')?.parentElement;
        if (!parentDiv) return null;

        // Look for the span with class "btn-link ng-binding" that contains the customer name
        const nameSpan = parentDiv.querySelector('span.btn-link.ng-binding:not(.ng-hide)');
        if (!nameSpan) return null;

        // Clean up the name (remove extra whitespace/newlines)
        return nameSpan.textContent.trim().replace(/\s+/g, ' ');
    }

    /**
     * Clears the currently selected customer
     * @returns {boolean} True if customer was cleared, false otherwise
     */
    function clearCustomer() {
        const clearBtn = document.querySelector('.fa-remove');
        if (!clearBtn) {
            console.log('[Customer Refresh] No customer to clear');
            return false;
        }

        console.log('[Customer Refresh] Clearing customer...');
        clearBtn.click();
        return true;
    }

    /**
     * Waits for an element to appear in the DOM
     * @param {string} selector - CSS selector
     * @param {number} timeout - Maximum time to wait in ms
     * @returns {Promise<Element|null>}
     */
    function waitForElement(selector, timeout = 5000) {
        return new Promise((resolve) => {
            const startTime = Date.now();

            const checkElement = () => {
                const element = document.querySelector(selector);
                if (element) {
                    resolve(element);
                } else if (Date.now() - startTime > timeout) {
                    resolve(null);
                } else {
                    setTimeout(checkElement, 100);
                }
            };

            checkElement();
        });
    }

    /**
     * Waits for the search results to appear
     * @param {number} timeout - Maximum time to wait in ms
     * @returns {Promise<Element|null>}
     */
    function waitForSearchResults(timeout = 10000) {
        return new Promise((resolve) => {
            const startTime = Date.now();

            const checkResults = () => {
                const elapsed = Date.now() - startTime;

                // Look for the Angular UI Bootstrap typeahead dropdown
                // It's a ul.dropdown-menu with [typeahead-popup] attribute
                const dropdown = document.querySelector('ul.dropdown-menu[typeahead-popup]');

                if (dropdown) {
                    // Check if it's visible
                    const isVisible = dropdown.style.display === 'block';

                    if (isVisible) {
                        // Get the first result li element
                        const firstResult = dropdown.querySelector('li.ng-scope');

                        if (firstResult) {
                            console.log(`[Customer Refresh] Found search results after ${elapsed}ms`);
                            resolve(firstResult);
                            return;
                        }
                    }
                }

                // Check for timeout
                if (elapsed > timeout) {
                    console.error(`[Customer Refresh] Timeout waiting for search results after ${elapsed}ms`);
                    resolve(null);
                } else {
                    // Check every 100ms
                    setTimeout(checkResults, 100);
                }
            };

            // Start checking after 700ms to account for the typeahead-wait-ms="600" delay
            setTimeout(checkResults, 700);
        });
    }

    /**
     * Searches for and selects a customer by name
     * @param {string} customerName - The customer's full name
     * @returns {Promise<boolean>} True if customer was selected, false otherwise
     */
    async function searchAndSelectCustomer(customerName) {
        // Wait for the search input to appear
        const searchInput = await waitForElement('#customerSearchTill', 2000);
        if (!searchInput) {
            console.error('[Customer Refresh] Search input not found');
            return false;
        }

        console.log(`[Customer Refresh] Searching for customer: ${customerName}`);

        // Focus on the input
        searchInput.focus();

        // Set the value and trigger Angular's digest cycle
        searchInput.value = customerName;

        // Trigger multiple events to ensure Angular picks it up
        const inputEvent = new Event('input', { bubbles: true, cancelable: true });
        const changeEvent = new Event('change', { bubbles: true, cancelable: true });

        searchInput.dispatchEvent(inputEvent);
        searchInput.dispatchEvent(changeEvent);

        // Also trigger Angular's scope update if available
        try {
            const scope = angular.element(searchInput).scope();
            if (scope) {
                scope.customerSearch = customerName;
                scope.$apply();
            }
        } catch (e) {
            console.log('[Customer Refresh] Could not trigger Angular scope update:', e.message);
        }

        // Wait for search results to appear (accounting for 600ms typeahead delay)
        const firstResult = await waitForSearchResults();
        if (!firstResult) {
            console.error('[Customer Refresh] No search results found');
            return false;
        }

        console.log('[Customer Refresh] Selecting customer from search results...');
        firstResult.click();

        return true;
    }

    /**
     * Main function to refresh the customer
     */
    async function refreshCustomer() {
        console.log('[Customer Refresh] Starting customer refresh...');

        // Step 1: Get the current customer name
        const customerName = getSelectedCustomerName();
        if (!customerName) {
            console.log('[Customer Refresh] No customer selected, nothing to refresh');
            return;
        }

        console.log(`[Customer Refresh] Current customer: ${customerName}`);

        // Step 2: Clear the customer
        if (!clearCustomer()) {
            console.error('[Customer Refresh] Failed to clear customer');
            return;
        }

        // Step 3: Wait a moment for the UI to update
        await new Promise(resolve => setTimeout(resolve, 300));

        // Step 4: Search for and re-select the customer
        const success = await searchAndSelectCustomer(customerName);
        if (success) {
            console.log('[Customer Refresh] Customer successfully refreshed!');
        } else {
            console.error('[Customer Refresh] Failed to re-select customer');
        }
    }

    /**
     * Monitor for the Resume button click to trigger the refresh
     */
    function setupResumeButtonListener() {
        // The resume button has a generic element with role and cursor pointer
        // We'll use event delegation on the document to catch the click

        document.addEventListener('click', async function(event) {
            // Check if the clicked element or its parent is the Resume button
            const target = event.target;
            const resumeBtn = target.closest('[title*="Resume"], [aria-label*="Resume"]') ||
                            (target.textContent && target.textContent.trim() === 'Resume' ? target : null);

            if (resumeBtn) {
                console.log('[Customer Refresh] Resume button clicked, waiting for transaction to load...');

                // Wait a moment for the transaction to resume
                setTimeout(async () => {
                    // Check if a customer is selected
                    const customerName = getSelectedCustomerName();
                    if (customerName) {
                        console.log('[Customer Refresh] Customer detected after resume, refreshing...');
                        await refreshCustomer();
                    }
                }, 1000);
            }
        }, true); // Use capture phase to catch the event early

        console.log('[Customer Refresh] Resume button listener installed');
    }

    /**
     * Add a manual refresh button to the UI (optional - for testing)
     */
    function addManualRefreshButton() {
        // Wait for the page to be ready
        const checkAndAdd = () => {
            const customerSection = document.querySelector('.fa-remove')?.closest('div');
            if (customerSection) {
                // Check if button already exists
                if (document.querySelector('#manual-customer-refresh-btn')) {
                    return;
                }

                const btn = document.createElement('i');
                btn.id = 'manual-customer-refresh-btn';
                btn.className = 'fa fa-refresh';
                btn.title = 'Refresh Customer (reload invoices)';
                btn.style.cssText = 'margin-left: 8px; cursor: pointer; color: #337ab7; font-size: 14px;';
                btn.onclick = refreshCustomer;

                // Add hover effect
                btn.onmouseenter = () => { btn.style.color = '#23527c'; };
                btn.onmouseleave = () => { btn.style.color = '#337ab7'; };

                customerSection.appendChild(btn);
                console.log('[Customer Refresh] Manual refresh button added');
            } else {
                setTimeout(checkAndAdd, 1000);
            }
        };

        checkAndAdd();
    }

    // Initialize the script
    console.log('[Customer Refresh] Script loaded');

    // Wait for the page to be fully loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setupResumeButtonListener();
            addManualRefreshButton();
        });
    } else {
        setupResumeButtonListener();
        addManualRefreshButton();
    }

    // Expose the refresh function globally for manual testing in console
    window.refreshCustomer = refreshCustomer;
    console.log('[Customer Refresh] You can manually trigger refresh by typing: window.refreshCustomer()');

})();
