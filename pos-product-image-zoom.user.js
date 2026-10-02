// ==UserScript==
// @name         LikeSew POS Product Image Zoom
// @namespace    https://creativepursuitsquilting.com/
// @version      1.0.0
// @description  Opens product images at a larger size when clicked in the LikeSew POS cart.
// @match        https://*.rainadmin.com/pos-app/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    const PRODUCT_IMAGE_SELECTOR = 'img[data-cy="till-line-image"]';
    const OVERLAY_ID = "likesew-product-image-zoom";
    const STYLE_ID = "likesew-product-image-zoom-styles";

    function getLargeImageUrl(image) {
        const url = new URL(image.currentSrc || image.src, window.location.href);

        if (url.hostname === "media.rainpos.com") {
            url.pathname = url.pathname.replace("/THUMB_", "/");
        }

        return url.href;
    }

    function getProductName(image) {
        const row = image.closest('[data-cy="till-line"]');
        if (!row) return "Product image";

        const names = row.querySelectorAll('[data-cy="till-line-name"]');
        const visibleName = Array.from(names).find(
            (name) => name.getClientRects().length > 0 && name.textContent.trim()
        );

        return visibleName?.textContent.trim() || "Product image";
    }

    function installStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
${PRODUCT_IMAGE_SELECTOR} {
    cursor: zoom-in !important;
}

${PRODUCT_IMAGE_SELECTOR}:focus-visible {
    outline: 3px solid #337ab7;
    outline-offset: 2px;
}

#${OVERLAY_ID} {
    align-items: center;
    background: rgba(0, 0, 0, 0.78);
    display: flex;
    inset: 0;
    justify-content: center;
    padding: 24px;
    position: fixed;
    z-index: 2147483647;
}

#${OVERLAY_ID}[hidden] {
    display: none !important;
}

#${OVERLAY_ID} .likesew-image-zoom-dialog {
    align-items: center;
    display: flex;
    flex-direction: column;
    max-height: 100%;
    max-width: 100%;
    position: relative;
}

#${OVERLAY_ID} .likesew-image-zoom-image {
    background: #fff;
    border-radius: 4px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
    max-height: calc(100vh - 110px);
    max-width: calc(100vw - 48px);
    object-fit: contain;
}

#${OVERLAY_ID} .likesew-image-zoom-caption {
    color: #fff;
    font-size: 18px;
    font-weight: 600;
    margin: 12px 52px 0;
    text-align: center;
    text-shadow: 0 1px 2px #000;
}

#${OVERLAY_ID} .likesew-image-zoom-close {
    align-items: center;
    background: #fff;
    border: 0;
    border-radius: 50%;
    color: #222;
    cursor: pointer;
    display: flex;
    font-size: 28px;
    height: 42px;
    justify-content: center;
    line-height: 1;
    padding: 0 0 3px;
    position: absolute;
    right: -16px;
    top: -16px;
    width: 42px;
}

#${OVERLAY_ID} .likesew-image-zoom-close:focus-visible {
    outline: 3px solid #5bc0de;
    outline-offset: 3px;
}
`;
        (document.head || document.documentElement).appendChild(style);
    }

    function createOverlay() {
        const overlay = document.createElement("div");
        overlay.id = OVERLAY_ID;
        overlay.hidden = true;
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-label", "Enlarged product image");
        overlay.innerHTML = `
            <div class="likesew-image-zoom-dialog">
                <button class="likesew-image-zoom-close" type="button" aria-label="Close enlarged image">&times;</button>
                <img class="likesew-image-zoom-image" alt="">
                <div class="likesew-image-zoom-caption"></div>
            </div>
        `;

        overlay.addEventListener("click", (event) => {
            if (event.target === overlay || event.target.closest(".likesew-image-zoom-close")) {
                closeOverlay();
            }
        });

        document.body.appendChild(overlay);
        return overlay;
    }

    function closeOverlay() {
        const overlay = document.getElementById(OVERLAY_ID);
        if (!overlay || overlay.hidden) return;

        overlay.hidden = true;
        overlay.querySelector(".likesew-image-zoom-image").removeAttribute("src");

        const returnFocus = overlay.returnFocus;
        overlay.returnFocus = null;
        returnFocus?.focus({ preventScroll: true });
    }

    function openOverlay(image) {
        const overlay = document.getElementById(OVERLAY_ID) || createOverlay();
        const largeImage = overlay.querySelector(".likesew-image-zoom-image");
        const caption = overlay.querySelector(".likesew-image-zoom-caption");
        const closeButton = overlay.querySelector(".likesew-image-zoom-close");
        const productName = getProductName(image);
        const thumbnailUrl = image.currentSrc || image.src;

        largeImage.alt = productName;
        largeImage.onerror = () => {
            if (largeImage.src !== thumbnailUrl) largeImage.src = thumbnailUrl;
        };
        largeImage.src = getLargeImageUrl(image);
        caption.textContent = productName;
        overlay.returnFocus = image;
        overlay.hidden = false;
        closeButton.focus({ preventScroll: true });
    }

    function prepareImages(root = document) {
        const images = [];
        if (root.nodeType === Node.ELEMENT_NODE && root.matches(PRODUCT_IMAGE_SELECTOR)) {
            images.push(root);
        }
        images.push(...root.querySelectorAll(PRODUCT_IMAGE_SELECTOR));

        for (const image of images) {
            image.tabIndex = 0;
            image.setAttribute("role", "button");
            image.setAttribute("aria-label", `Enlarge ${getProductName(image)}`);
            image.title = "Click to enlarge";
        }
    }

    document.addEventListener("click", (event) => {
        if (!(event.target instanceof Element)) return;

        const image = event.target.closest(PRODUCT_IMAGE_SELECTOR);
        if (!image) return;

        event.preventDefault();
        event.stopPropagation();
        openOverlay(image);
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeOverlay();
            return;
        }

        if (!(event.target instanceof Element)) return;

        const image = event.target.closest(PRODUCT_IMAGE_SELECTOR);
        if (image && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            openOverlay(image);
        }
    });

    installStyles();
    prepareImages();

    new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) prepareImages(node);
            }
        }
    }).observe(document.body, { childList: true, subtree: true });

    console.info("[LikeSew Image Zoom] Product image zoom is active.");
})();
