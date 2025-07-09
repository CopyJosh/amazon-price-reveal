// content-script.js
console.log("🔍 [PriceReveal] content script loaded");

// Map ASIN → { list, deal, saved }
const pricingMap = new Map();

// Create a single floating tooltip (wait for body to be available)
let tooltip;

function createTooltip() {
  if (!document.body) {
    setTimeout(createTooltip, 10);
    return;
  }
  
  tooltip = document.createElement("div");
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
  console.log("🔍 [PriceReveal] ✅ Tooltip created");
}

// Create tooltip as soon as possible
createTooltip();

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
 * Parse Amazon API response and extract pricing data
 */
function handleApiResponse(data) {
  try {
    // Extract promotions from the API response structure
    let promotions = [];
    
    // The real structure is data.entity.rankedPromotions
    if (data.entity?.rankedPromotions && Array.isArray(data.entity.rankedPromotions)) {
      promotions = data.entity.rankedPromotions;
    } else if (data.rankedPromotions && Array.isArray(data.rankedPromotions)) {
      promotions = data.rankedPromotions;
    } else if (Array.isArray(data)) {
      promotions = data;
    }

    console.log(`🔍 [PriceReveal] processing ${promotions.length} promotions from API`);

    promotions.forEach(promotion => {
      try {
        // The structure is: promotion.product.entity.asin and promotion.product.entity.buyingOptions
        const productEntity = promotion.product?.entity;
        if (!productEntity) return;
        
        const asin = productEntity.asin;
        if (!asin) return;
        
        const buyOpts = productEntity.buyingOptions || [];
        
        buyOpts.forEach(opt => {
          try {
            // The price structure is in opt.price.entity
            const p = opt.price?.entity;
            if (!p) return;
            
            const basisPrice = p?.basisPrice;
            const priceToPay = p?.priceToPay;
            const savings = p?.savings;

            const list = basisPrice?.moneyValueOrRange?.value?.amount
              ? parseFloat(basisPrice.moneyValueOrRange.value.amount)
              : NaN;
            const deal = priceToPay?.moneyValueOrRange?.value?.amount
              ? parseFloat(priceToPay.moneyValueOrRange.value.amount)
              : NaN;
            const saved = savings?.money?.amount
              ? parseFloat(savings.money.amount)
              : NaN;

            if (!isNaN(list) && !isNaN(deal) && !isNaN(saved)) {
              pricingMap.set(asin, { list, deal, saved });
              console.log(`🔍 [PriceReveal] added pricing for ASIN ${asin}: list=$${list}, deal=$${deal}, saved=$${saved}`);
            }
          } catch (e) {
            console.error("🔍 [PriceReveal] price parse error", e, opt);
          }
        });
      } catch (e) {
        console.error("🔍 [PriceReveal] product parse error", e, promotion);
      }
    });
  } catch (e) {
    console.error("🔍 [PriceReveal] API response parse error", e, data);
  }
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

/**
 * Set up network request interception to catch Amazon's infinite scroll API calls
 */
function setupNetworkInterception() {
  console.log("🔍 [PriceReveal] Setting up network interception...");
  
  // Intercept fetch requests
  const originalFetch = window.fetch;
  if (originalFetch) {
    let fetchCounter = 0;
    window.fetch = function(...args) {
      fetchCounter++;
      const url = args[0];
      console.log(`🔍 [PriceReveal] 🌐 FETCH #${fetchCounter}:`, url);
      
      // Process ALL requests
      const result = originalFetch.apply(this, args);
      
      // Check for ANY Amazon domains or API patterns
      if (typeof url === 'string' && 
          (url.includes('amazon.com') || 
           url.includes('/api/') || 
           url.includes('/promotions') ||
           url.includes('/marketplaces/'))) {
        console.log(`🔍 [PriceReveal] 🎯 AMAZON FETCH #${fetchCounter}:`, url);
        
        return result.then(response => {
          console.log(`🔍 [PriceReveal] 📥 Response for #${fetchCounter}:`, response.status, response.statusText);
          
          // Try to parse as JSON
          const clonedResponse = response.clone();
          clonedResponse.json().then(data => {
            console.log(`🔍 [PriceReveal] 📋 JSON data from #${fetchCounter}:`, data);
            
            // Check if this looks like promotion data
            if (data && (data.entity?.rankedPromotions || data.rankedPromotions)) {
              console.log(`🔍 [PriceReveal] 🎉 PROMOTION DATA FOUND in #${fetchCounter}!`);
              handleApiResponse(data);
            } else {
              console.log(`🔍 [PriceReveal] ℹ️ No promotion data in #${fetchCounter}`);
            }
          }).catch(e => {
            console.log(`🔍 [PriceReveal] ⚠️ Non-JSON response #${fetchCounter}:`, e.message);
          });
          
          return response;
        });
      }
      
      return result;
    };
    console.log("🔍 [PriceReveal] ✅ Enhanced fetch interceptor installed");
  } else {
    console.log("🔍 [PriceReveal] ❌ No fetch API found");
  }

  // Intercept XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._url = url;
    console.log("🔍 [PriceReveal] 📡 EVERY XHR open:", method, url);
    return originalXHROpen.apply(this, [method, url, ...args]);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    console.log("🔍 [PriceReveal] 📡 EVERY XHR send to:", this._url);
    
    // Check for the specific Amazon promotions endpoint
    if (this._url && typeof this._url === 'string' && 
        (this._url.includes('/api/') || 
         this._url.includes('data.amazon.com') || 
         this._url.includes('/promotions') || 
         this._url.includes('/marketplaces/'))) {
      
      console.log("🔍 [PriceReveal] intercepted XHR to:", this._url);
      
      const originalOnReadyStateChange = this.onreadystatechange;
      this.onreadystatechange = function() {
        console.log("🔍 [PriceReveal] XHR state change:", this.readyState, this.status);
        if (this.readyState === 4 && this.status === 200) {
          try {
            const data = JSON.parse(this.responseText);
            console.log("🔍 [PriceReveal] processing XHR response data from:", this._url);
            console.log("🔍 [PriceReveal] XHR response data:", data);
            handleApiResponse(data);
          } catch (e) {
            console.log("🔍 [PriceReveal] non-JSON XHR response from:", this._url);
          }
        }
        
        if (originalOnReadyStateChange) {
          originalOnReadyStateChange.apply(this, arguments);
        }
      };
    }
    
    return originalXHRSend.apply(this, args);
  };

  console.log("🔍 [PriceReveal] Network interception set up for infinite scroll");
}

// Set up network interception immediately when script loads
setupNetworkInterception();

// Alternative: Watch for new product elements being added
function setupProductObserver() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if new product containers were added
                         const newProducts = node.querySelectorAll ? node.querySelectorAll('[data-asin]') : [];
             if (newProducts.length > 0) {
               const newAsins = Array.from(newProducts).map(p => p.getAttribute('data-asin'));
               console.log(`🔍 [PriceReveal] 🆕 Detected ${newProducts.length} new products:`, newAsins);
               
               // Check if we already have pricing for these
               const missingPricing = newAsins.filter(asin => !pricingMap.has(asin));
               console.log(`🔍 [PriceReveal] 📊 Missing pricing for ${missingPricing.length} ASINs:`, missingPricing);
               
               // Re-scan for new script tags with pricing data
                                setTimeout(() => {
                  scanInlineScripts();
                  // Check again after scan
                  const stillMissing = newAsins.filter(asin => !pricingMap.has(asin));
                  console.log(`🔍 [PriceReveal] 📊 After re-scan, still missing ${stillMissing.length} ASINs:`, stillMissing);
                }, 100);
             }
            
            // Also check if the node itself has data-asin
            if (node.hasAttribute && node.hasAttribute('data-asin')) {
              console.log(`🔍 [PriceReveal] 🆕 New product detected:`, node.getAttribute('data-asin'));
              setTimeout(scanInlineScripts, 100);
            }
          }
        });
      }
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  console.log("🔍 [PriceReveal] 👀 Product observer set up");
}

// Set up product observer when DOM is ready
if (document.body) {
  setupProductObserver();
} else {
  setTimeout(setupProductObserver, 100);
}

// Test our interception with a dummy request
setTimeout(() => {
  console.log("🔍 [PriceReveal] 🧪 Testing network interception...");
  fetch("https://httpbin.org/json")
    .then(r => r.json())
    .then(data => console.log("🔍 [PriceReveal] 🧪 Test successful - interception working!"))
    .catch(e => console.log("🔍 [PriceReveal] 🧪 Test failed:", e));
}, 2000);



// Start scanning once the page has fully loaded
window.addEventListener("load", () => {
  console.log("🔍 [PriceReveal] page loaded, scanning scripts...");
  setTimeout(() => {
    scanInlineScripts();
  }, 500);
});

// Show tooltip on hover over any element with data-asin
document.addEventListener("mouseover", ev => {
  const card = ev.target.closest("[data-asin]");
  if (!card || !tooltip) return;
  
  const asin = card.getAttribute("data-asin");
  const data = pricingMap.get(asin);
  
  let tooltipContent;
  if (!data) {
    // Show debug tooltip for missing data
    tooltipContent = `<strong style="color: #ff6b6b;">🔍 DEBUG</strong><br>` +
                    `<strong>ASIN:</strong> ${asin}<br>` +
                    `<strong>Status:</strong> No pricing data<br>` +
                    `<em style="color: #ffd43b;">Extension working, data missing</em>`;
  } else {
    // Show normal pricing tooltip
    tooltipContent = `<strong>List:</strong> \$${data.list.toFixed(2)}<br>` +
                    `<strong>Sale:</strong> \$${data.deal.toFixed(2)}<br>` +
                    `<strong>You save:</strong> \$${data.saved.toFixed(2)}`;
  }

  tooltip.innerHTML = tooltipContent;

  // Temporarily position off-screen to measure
  tooltip.style.display = "block";
  tooltip.style.top = "-9999px";
  tooltip.style.left = "-9999px";

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
  if (ev.target.closest("[data-asin]") && tooltip) {
    tooltip.style.display = "none";
  }
});