// content-script.js
console.log("🔍 [PriceReveal] content script loaded");

// Map ASIN → { list, deal, saved }
const pricingMap = new Map();

// Create a single floating tooltip
const tooltip = document.createElement("div");
tooltip.id = "amz-pricing-tooltip";
tooltip.style.cssText = `
  position: absolute;
  background: rgba(0,0,0,0.8);
  color: #fff;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 11px;
  pointer-events: none;
  z-index: 999999;
  display: none;
  white-space: nowrap;
`;
document.body.appendChild(tooltip);

/**
 * Collect all product items from various config paths.
 */
function collectItems(cfg) {
  const items = [];
  if (Array.isArray(cfg.discountAsins)) items.push(...cfg.discountAsins);
  if (Array.isArray(cfg.asins)) items.push(...cfg.asins);

  const rp = cfg.prefetchedData?.entity?.rankedPromotions;
  if (Array.isArray(rp)) {
    rp.forEach(e => {
      if (e.product?.entity) items.push(e.product);
    });
  }
  return items;
}

/**
 * Parse the config, normalize each item's prices, and store in pricingMap.
 */
function handleConfig(cfg) {
  const items = collectItems(cfg);
  console.log("🔍 [PriceReveal] total items =", items.length);
  items.forEach(item => {
    const asin = item.asin || item.entity?.asin;
    const buyOpts =
      item.buyingOptions || item.entity?.buyingOptions || [];
    buyOpts.forEach(opt => {
      try {
        const p = opt.price.entity;
        const basisPrice = p.basisPrice;
        const priceToPay = p.priceToPay;
        const savings = p.savings;

        const list = basisPrice
          ? parseFloat(
              p.basisPrice.moneyValueOrRange.value.amount
            )
          : NaN;
        const deal = priceToPay
          ? parseFloat(
              p.priceToPay.moneyValueOrRange.value.amount
            )
          : NaN;
        const saved = savings
          ? parseFloat(p.savings.money.amount)
          : NaN;

        if (!isNaN(list) && !isNaN(deal) && !isNaN(saved)) {
          pricingMap.set(asin, { list, deal, saved });
        }
      } catch (e) {
        console.error("🔍 [PriceReveal] price parse error", e, opt);
      }
    });
  });
}

/**
 * Scan inline <script> tags for the JSON passed to assets.mountWidget(...)
 * and invoke handleConfig(cfg).
 */
function scanInlineScripts() {
  document.querySelectorAll("script").forEach(s => {
    const txt = s.textContent;
    if (!txt || !txt.includes("assets.mountWidget")) return;
    let idx = 0;
    while ((idx = txt.indexOf("assets.mountWidget", idx)) !== -1) {
      const braceOpen = txt.indexOf("{", idx);
      if (braceOpen < 0) break;
      let depth = 0, i = braceOpen;
      for (; i < txt.length; i++) {
        if (txt[i] === "{") depth++;
        else if (txt[i] === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      if (depth !== 0) break;
      const jsonText = txt.slice(braceOpen, i + 1);
      try {
        const cfg = JSON.parse(jsonText);
        console.log("🔍 [PriceReveal] parsed config");
        handleConfig(cfg);
      } catch (e) {
        console.error("🔍 [PriceReveal] JSON.parse failed", e);
      }
      idx = i + 1;
    }
  });
}

// Start scanning once the page has fully loaded
window.addEventListener("load", () => {
  console.log("🔍 [PriceReveal] page loaded, scanning scripts...");
  setTimeout(scanInlineScripts, 500);
});

// Show tooltip on hover over any element with data-asin
document.addEventListener("mouseover", ev => {
  const card = ev.target.closest("[data-asin]");
  if (!card) return;
  const asin = card.getAttribute("data-asin");
  const data = pricingMap.get(asin);
  if (!data) return;

  tooltip.innerHTML =
    `<strong>List:</strong> \$${data.list.toFixed(2)}<br>` +
    `<strong>Sale:</strong> \$${data.deal.toFixed(2)}<br>` +
    `<strong>You save:</strong> \$${data.saved.toFixed(2)}`;

  // Temporarily position off-screen to measure
  tooltip.style.display = "block";
  tooltip.style.top = "-9999px";
  tooltip.style.left = "-9999px";
  const tipRect = tooltip.getBoundingClientRect();

  const rect = card.getBoundingClientRect();
  const gap = 2; // smaller vertical gap
  const top = window.scrollY + rect.top + gap;
  const left =
    window.scrollX +
    rect.left;

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
});

// Hide tooltip when the pointer leaves the card
document.addEventListener("mouseout", ev => {
  if (ev.target.closest("[data-asin]")) {
    tooltip.style.display = "none";
  }
});