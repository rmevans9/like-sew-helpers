// ==UserScript==
// @name         LikeSew Inches to Yards Converter
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adds an Inches/Yards toggle to the Change Quantity panel in LikeSew/RainPOS
// @author       You
// @match        https://*.rainadmin.com/pos-app/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let lastInitTime = 0;

    function initQuantityToggle() {
        const modal = document.querySelector('.modal.in');
        if (!modal) return;

        const quantityInput = modal.querySelector('#yardageQtyInput');
        if (!quantityInput) return;

        // Debounce - don't reinitialize if we just did it
        const now = Date.now();
        if (now - lastInitTime < 200) return;
        lastInitTime = now;

        const modalBody = quantityInput.closest('.modal-body');
        if (!modalBody) return;

        // Remove existing toggle if present (ensures fresh state)
        const existingToggle = modal.querySelector('#unitToggle');
        if (existingToggle) existingToggle.remove();

        // Find the Quantity label
        let quantityLabel = null;
        for (const el of modalBody.querySelectorAll('*')) {
            if (el.childNodes.length === 1 && el.textContent.trim() === 'Quantity') {
                quantityLabel = el;
                break;
            }
        }
        if (!quantityLabel) return;

        // Create toggle
        const toggleDiv = document.createElement('div');
        toggleDiv.id = 'unitToggle';
        toggleDiv.style.cssText = 'display:flex;margin-bottom:8px;border-radius:4px;overflow:hidden;border:1px solid #ccc;';
        toggleDiv.innerHTML = `
            <button type="button" id="btnInches" style="flex:1;padding:6px 12px;border:none;background:#fff;color:#333;cursor:pointer;font-size:13px;">Inches</button>
            <button type="button" id="btnYards" style="flex:1;padding:6px 12px;border:none;background:#337ab7;color:white;cursor:pointer;font-size:13px;">Yards</button>
        `;

        quantityLabel.parentNode.insertBefore(toggleDiv, quantityLabel.nextSibling);

        // ALWAYS start in yards mode since system value is always in yards
        modal.dataset.unitMode = 'yards';

        const btnInches = document.getElementById('btnInches');
        const btnYards = document.getElementById('btnYards');

        const setModeUI = (mode) => {
            modal.dataset.unitMode = mode;
            if (mode === 'inches') {
                btnInches.style.background = '#337ab7';
                btnInches.style.color = 'white';
                btnYards.style.background = '#fff';
                btnYards.style.color = '#333';
            } else {
                btnYards.style.background = '#337ab7';
                btnYards.style.color = 'white';
                btnInches.style.background = '#fff';
                btnInches.style.color = '#333';
            }
        };

        btnInches.onclick = () => {
            if (modal.dataset.unitMode === 'yards') {
                const yards = parseFloat(quantityInput.value) || 0;
                quantityInput.value = (yards * 36).toFixed(2);
                setModeUI('inches');
            }
        };

        btnYards.onclick = () => {
            if (modal.dataset.unitMode === 'inches') {
                const inches = parseFloat(quantityInput.value) || 0;
                quantityInput.value = (inches / 36).toFixed(4);
                setModeUI('yards');
            }
        };

        // Find OK button and set up handler
        const okImg = modal.querySelector('img[src*="ok"]');
        if (okImg && typeof angular !== 'undefined') {
            const scope = angular.element(quantityInput).scope();

            // Clone the OK button to remove all existing event listeners
            const newOkImg = okImg.cloneNode(true);
            okImg.parentNode.replaceChild(newOkImg, okImg);

            // Use capturing phase to intercept BEFORE any other handlers
            newOkImg.addEventListener('click', function(e) {
                e.stopImmediatePropagation();
                e.preventDefault();

                // Convert if in inches mode
                if (modal.dataset.unitMode === 'inches') {
                    const inches = parseFloat(quantityInput.value) || 0;
                    const yards = inches / 36;
                    quantityInput.value = yards;
                    angular.element(quantityInput).triggerHandler('input');
                }

                // Reset to yards mode for next time
                modal.dataset.unitMode = 'yards';
                setModeUI('yards');

                // Call Angular's close function
                scope.$apply(function() {
                    scope.closeQuantityInput();
                });
            }, true);
        }
    }

    // Watch for modal visibility changes
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const target = mutation.target;
                if (target.classList.contains('modal') && target.classList.contains('in')) {
                    // Modal just became visible - initialize after a short delay
                    setTimeout(initQuantityToggle, 50);
                }
            }
            // Also check for added nodes that might be modals
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) {
                        if (node.classList && node.classList.contains('modal') && node.classList.contains('in')) {
                            setTimeout(initQuantityToggle, 50);
                        }
                        // Check children
                        const modal = node.querySelector && node.querySelector('.modal.in');
                        if (modal) {
                            setTimeout(initQuantityToggle, 50);
                        }
                    }
                });
            }
        });
    });

    // Start observing
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
    });

    // Also check if modal is already open on page load
    setTimeout(initQuantityToggle, 500);
})();
