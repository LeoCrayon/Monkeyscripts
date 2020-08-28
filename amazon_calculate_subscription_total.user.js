// ==UserScript==
// @name         AmazonCalculateSubscriptionTotal
// @namespace    https://github.com/LeoCrayon/Monkeyscripts
// @version      0.1
// @description  Amazon calculate subscription total.
// @author       LeoCrayon
// @license      GNU General Public License v3.0
// @match        https://www.amazon.com/auto-deliveries/*
// @match        https://www.amazon.com/gp/subscribe-and-save/*
// @grant        none
// ==/UserScript==
(function() {
    'use strict';

    const sendRequest = (url) => {
        var xhr = new XMLHttpRequest();
        return new Promise(function(resolve, reject) {
            xhr.onreadystatechange = function() {
                if (xhr.readyState == 4) {
                    if (xhr.status >= 300) {
                        reject("Error, status code = " + xhr.status)
                    } else {
                        resolve(xhr.responseText);
                    }
                }
            }
            xhr.open('get', url, true)
            xhr.send();
        });
    };

    // ==========================================

    const parsePrice = (priceString) => {
        const startPos = priceString.indexOf("$") + 1;
        const leftBracketsPos = priceString.indexOf("(");
        const endPos = leftBracketsPos < 0 ? priceString.length : leftBracketsPos;
        return parseFloat(priceString.substring(startPos, endPos));
    };

    const getDirectPrice = (deliveryCard) => {
        const priceEls = deliveryCard.querySelectorAll(".subscription-price");
        let totalPrice = 0;
        priceEls.forEach((priceEl) => {
            const price = parsePrice(priceEl.innerText);
            if (price) {
            totalPrice += price;
            }
        });
        return totalPrice;
    };

    // ==========================================

    const getPriceFromProductPage = (productPageDom) => {
        const productTitleEl = productPageDom.querySelector("#productTitle");
        const snsContainerEl = productPageDom.querySelector("#snsAccordionRowMiddle");
        let priceEl;
        if (snsContainerEl) {
            const pillContainerEl = snsContainerEl.querySelector(".discountPillWrapper");
            const pillLightedUpEl = pillContainerEl.querySelector(".pillLightUp");
            const tieredPriceEnabled = pillLightedUpEl.classList.contains("discountPillRight");
            priceEl = tieredPriceEnabled ?
                  snsContainerEl.querySelector("#sns-tiered-price") : snsContainerEl.querySelector("#sns-base-price");
        } else {
            priceEl = productPageDom.querySelector("#priceblock_ourprice");
        }
        return {
            price: parsePrice(priceEl.innerText),
            notSns: !snsContainerEl,
            productName: productTitleEl.innerText.trim()
        };
    }

    const getProductPrice = async (productEl) => {
        const productSubEditUrlEl = productEl.querySelector(".a-declarative");
        if (!productSubEditUrlEl) {
            return {price: 0};
        }
        const productSubEditUrlJson = JSON.parse(productSubEditUrlEl.dataset.aModal);
        const productSubEditUrl = productSubEditUrlJson.url;

        const productSubEditHtml = await sendRequest(productSubEditUrl);
        const productSubEditDom = new DOMParser().parseFromString(productSubEditHtml, "text/html");
        const productPageUrlEl = productSubEditDom.querySelector(".a-link-normal"); // First link.
        const productPageUrl = productPageUrlEl.getAttribute("href");

        const productPageHtml = await sendRequest(productPageUrl);
        const productPageDom = new DOMParser().parseFromString(productPageHtml, "text/html");
        const priceObj = getPriceFromProductPage(productPageDom);
        priceObj.productLink = productPageUrl;
        return priceObj;
    };

    const getIndirectPrice = async (deliveryCard) => {
        const productEls = deliveryCard.querySelectorAll(".subscription-card");
        const prices = [];
        const unavailableProducts = [];
        await Promise.all(Array.from(productEls).map(async (productEl) => {
            const priceObj = await getProductPrice(productEl);
            prices.push(priceObj.price);
            if (priceObj.notSns) {
                const unavailableProduct = {};
                unavailableProduct.name = priceObj.productName;
                unavailableProduct.link = priceObj.productLink;
                unavailableProducts.push(unavailableProduct);
            }
        }));
        return {
            price: prices.reduce((total, num) => {
                return total + num;
            }, 0),
            unavailableProducts};
    };

    const process = () => {
        const deliveryCardEls = document.querySelectorAll(".delivery-card");
        console.log(deliveryCardEls.length);
        deliveryCardEls.forEach(async (deliveryCardEl, index) => {
            const informationContainerEl = deliveryCardEl.querySelector(".delivery-information-container");

            const totalPriceContainerEl = document.createElement("DIV");
            informationContainerEl.appendChild(totalPriceContainerEl);
            totalPriceContainerEl.style.marginTop = "8px";

            const totalPriceLabelEl = document.createElement("SPAN");
            totalPriceContainerEl.appendChild(totalPriceLabelEl);
            totalPriceLabelEl.classList.add("a-size-base-plus", "subscription-price");

            const totalPriceEl = document.createElement("SPAN");
            totalPriceContainerEl.appendChild(totalPriceEl);
            totalPriceEl.classList.add("a-size-base-plus", "a-color-price", "subscription-price", "a-text-bold");

            if (index === 0) {
                totalPriceLabelEl.innerText = "Total: ";
                totalPriceEl.innerText = getDirectPrice(deliveryCardEl);
            } else {
                totalPriceLabelEl.innerText = "Total est: "
                const priceObj = await getIndirectPrice(deliveryCardEl);
                totalPriceEl.innerText = priceObj.price;

                if (priceObj.unavailableProducts.length > 0) {
                    const unavailableProductsContainerEl = document.createElement("DIV");
                    informationContainerEl.appendChild(unavailableProductsContainerEl);
                    unavailableProductsContainerEl.style.marginTop = "8px";

                    const unavailableProductsLabelEl = document.createElement("SPAN");
                    unavailableProductsContainerEl.appendChild(unavailableProductsLabelEl);
                    unavailableProductsLabelEl.classList.add("a-size-small", "a-text-bold");

                    unavailableProductsLabelEl.innerText = "Potential unavailable: ";
                    priceObj.unavailableProducts.forEach((unavailableProduct) => {
                        const unavailableProductEl = document.createElement("DIV");
                        unavailableProductsContainerEl.appendChild(unavailableProductEl);
                        unavailableProductEl.classList.add("a-size-small");
                        unavailableProductEl.style.marginTop = "4px";

                        const unavailableProductLinkEl = document.createElement("A");
                        unavailableProductEl.appendChild(unavailableProductLinkEl);
                        unavailableProductLinkEl.classList.add("a-link-normal", "product-title");

                        unavailableProductLinkEl.innerText = unavailableProduct.name;
                        unavailableProductLinkEl.setAttribute("href", unavailableProduct.link);
                    });
                }
            }
        });
    };

    const loadCheck = setInterval(() => {
        const spinnerEl = document.querySelector(".spinner");
        if (!spinnerEl) {
            process();
            clearInterval(loadCheck);
        }
    }, 300);
})();