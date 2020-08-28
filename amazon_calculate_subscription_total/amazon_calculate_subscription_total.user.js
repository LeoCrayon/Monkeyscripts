// ==UserScript==
// @name         amazon_calculate_subscription_total
// @namespace    https://github.com/LeoCrayon/Monkeyscripts
// @version      0.2
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
        const startPos = priceString.search(/\d/);
        const leftBracketsPos = priceString.indexOf("(");
        const endPos = leftBracketsPos < 0 ? priceString.length : leftBracketsPos;
        return {
            price: parseFloat(priceString.substring(startPos, endPos)),
            currency: startPos - 1 >= 0 ? priceString.charAt(startPos - 1) : ""
        };
    };

    const calculatePriceTotal = (priceObjs) => {
        let totalPrice = 0;
        let currency = "";

        priceObjs.forEach((priceObj) => {
            if (priceObj && priceObj.price) {
                if (!currency) {
                    currency = priceObj.currency;
                }
                totalPrice += priceObj.price;
            }
        });
        return currency + totalPrice.toFixed(2);
    };

    const getDirectPrice = (deliveryCard) => {
        const priceEls = deliveryCard.querySelectorAll(".subscription-price");
        const priceObjs = [];
        priceEls.forEach((priceEl) => {
            priceObjs.push(parsePrice(priceEl.innerText));
        });
        return calculatePriceTotal(priceObjs);
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
            productPrice: parsePrice(priceEl.innerText),
            notSns: !snsContainerEl,
            productName: productTitleEl.innerText.trim()
        };
    }

    const getProductPrice = async (productEl) => {
        const productSubEditUrlEl = productEl.querySelector(".a-declarative");
        if (!productSubEditUrlEl) {
            return {productPrice: {price: 0}};
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
        const priceObjs = [];
        const unavailableProducts = [];
        await Promise.all(Array.from(productEls).map(async (productEl) => {
            const priceObj = await getProductPrice(productEl);
            priceObjs.push(priceObj.productPrice);
            if (priceObj.notSns) {
                const unavailableProduct = {};
                unavailableProduct.name = priceObj.productName;
                unavailableProduct.link = priceObj.productLink;
                unavailableProducts.push(unavailableProduct);
            }
        }));
        return {
            price: calculatePriceTotal(priceObjs),
            unavailableProducts};
    };

    const process = () => {
        const deliveryCardEls = document.querySelectorAll(".delivery-card");
        console.log(deliveryCardEls.length);
        deliveryCardEls.forEach(async (deliveryCardEl, index) => {
            const informationContainerEl = deliveryCardEl.querySelector(".delivery-information-container");

            const totalPriceContainerEl = document.createElement("DIV");
            informationContainerEl.appendChild(totalPriceContainerEl);
            totalPriceContainerEl.classList.add("deliveryTile");
            Object.assign(totalPriceContainerEl.style, {
                marginTop: "8px",
                float: "none",
            });

            const totalPriceLabelEl = document.createElement("SPAN");
            totalPriceContainerEl.appendChild(totalPriceLabelEl);
            totalPriceLabelEl.classList.add("a-size-base-plus", "subscription-price");

            const totalPriceEl = document.createElement("SPAN");
            totalPriceContainerEl.appendChild(totalPriceEl);
            totalPriceEl.classList.add("a-size-base-plus", "a-color-price", "subscription-price", "a-text-bold");

            const spinnerEl = document.createElement("SPAN");
            totalPriceContainerEl.appendChild(spinnerEl);
            spinnerEl.classList.add("deliveryTileContent", "spinner", "cartSpinner");
            Object.assign(spinnerEl.style,{
                backgroundSize: "20px",
                width: "20px",
                height:"20px",
                display: "inline-block",
                verticalAlign: "middle"
            });

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
                        unavailableProductEl.style.marginTop = "6px";

                        const unavailableProductLinkEl = document.createElement("A");
                        unavailableProductEl.appendChild(unavailableProductLinkEl);
                        unavailableProductLinkEl.classList.add("a-link-normal", "product-title");

                        unavailableProductLinkEl.innerText = unavailableProduct.name;
                        unavailableProductLinkEl.setAttribute("href", unavailableProduct.link);
                    });
                }
            }

            spinnerEl.remove();
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
