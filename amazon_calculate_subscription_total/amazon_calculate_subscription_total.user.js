// ==UserScript==
// @name         amazon_calculate_subscription_total
// @namespace    https://github.com/LeoCrayon/Monkeyscripts
// @version      0.5
// @description  Amazon calculate subscription total.
// @author       LeoCrayon
// @license      GPL-3.0-or-later; https://www.gnu.org/licenses/gpl-3.0.txt
// @match        https://www.amazon.com/auto-deliveries/*
// @match        https://www.amazon.com/gp/subscribe-and-save/*
// @grant        none
// ==/UserScript==
/*jshint esversion: 8 */
(function() {
    'use strict';

    // =========================================
    // Ajax utils.

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
    // Price utils.

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
                totalPrice += priceObj.price * (priceObj.quantity || 1);
            }
        });
        return currency + totalPrice.toFixed(2);
    };

    const parseQuantity = (quantityString) => {
        const startPos = quantityString.search(/\d/);
        return parseInt(quantityString.substring(startPos));
    }

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
            productPrice: priceEl ? parsePrice(priceEl.innerText) : {price: 0},
            notSns: !snsContainerEl,
            unavailable: !priceEl,
            productName: productTitleEl.innerText.trim()
        };
    }

    const getProductPrice = async (productEl) => {
        const subEditUrlEl = productEl.querySelector(".a-declarative");
        if (!subEditUrlEl) {
            return {productPrice: {price: 0}};
        }
        const subEditUrlJson = JSON.parse(subEditUrlEl.dataset.aModal);
        const productSubEditUrl = subEditUrlJson.url;
        const quantityEl = productEl.querySelector(".subscription-quantity-message");
        const quantity = quantityEl ? parseQuantity(quantityEl.innerText) : 1;

        const productSubEditHtml = await sendRequest(productSubEditUrl);
        const productSubEditDom = new DOMParser().parseFromString(productSubEditHtml, "text/html");
        const productPageUrlEl = productSubEditDom.querySelector(".a-link-normal"); // First link.
        const productPageUrl = productPageUrlEl.getAttribute("href");

        const productPageHtml = await sendRequest(productPageUrl);
        const productPageDom = new DOMParser().parseFromString(productPageHtml, "text/html");
        const priceObj = getPriceFromProductPage(productPageDom);
        priceObj.productLink = productPageUrl;
        priceObj.productPrice.quantity = quantity;
        return priceObj;
    };

    const getIndirectPrice = async (deliveryCard) => {
        const productEls = deliveryCard.querySelectorAll(".subscription-card");
        const priceObjs = [];
        const notSnsProducts = [];
        const unavailableProducts = [];
        await Promise.all(Array.from(productEls).map(async (productEl) => {
            const priceObj = await getProductPrice(productEl);
            priceObjs.push(priceObj.productPrice);
            if (priceObj.notSns) {
                const notSnsProduct = {
                    name: priceObj.productName,
                    link: priceObj.productLink
                };
                notSnsProducts.push(notSnsProduct);
            }
            if (priceObj.unavailable) {
                const unavailableProduct = {
                    name: priceObj.productName,
                    link: priceObj.productLink
                };
                unavailableProducts.push(unavailableProduct);
            }
        }));
        return {
            price: calculatePriceTotal(priceObjs),
            notSnsProducts,
            unavailableProducts};
    };

    const getDirectPrice = (deliveryCard) => {
        const priceEls = deliveryCard.querySelectorAll(".subscription-price");
        const priceObjs = [];
        priceEls.forEach((priceEl) => {
            priceObjs.push(parsePrice(priceEl.innerText));
        });
        return calculatePriceTotal(priceObjs);
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

                const createProductList = (products, label) => {
                    if (products.length === 0) {
                        return;
                    }
                    const productsContainerEl = document.createElement("DIV");
                    informationContainerEl.appendChild(productsContainerEl);
                    productsContainerEl.style.marginTop = "8px";

                    const productsLabelEl = document.createElement("SPAN");
                    productsContainerEl.appendChild(productsLabelEl);
                    productsLabelEl.classList.add("a-size-small", "a-text-bold");

                    productsLabelEl.innerText = label;
                    products.forEach((product) => {
                        const productEl = document.createElement("DIV");
                        productsContainerEl.appendChild(productEl);
                        productEl.classList.add("a-size-small");
                        productEl.style.marginTop = "6px";

                        const productLinkEl = document.createElement("A");
                        productEl.appendChild(productLinkEl);
                        productLinkEl.classList.add("a-link-normal", "product-title");

                        productLinkEl.innerText = product.name;
                        productLinkEl.setAttribute("href", product.link);
                    });

                };

                createProductList(priceObj.notSnsProducts, "Potential not Sns: ");
                createProductList(priceObj.unavailableProducts, "Potential unavailable: ");
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
