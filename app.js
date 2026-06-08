const SUPABASE_URL = "https://lpkqtfltpeznuxallrrv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_T2MqV-yW0lnpmDc8x-IGqA_3go3dcfW";
const SCAN_INVENTORY_URL = `${SUPABASE_URL}/functions/v1/scan-inventory`;

let vehicles = [];
let catalog = [];
let dealersCatalog = [];
let colorsCatalog = [];
let rebatesCatalog = [];
let leaseProgramsCatalog = [];
let leaseProgramPreview = null;
let removedVins = new Set();
let favoriteVins = new Set();
let selectedVins = new Set();
let compareVins = new Set();
let lastSearchBody = null;
let resultSort = "closest";
let lastDealersInRadius = [];
let activeResultFilters = {
  dealer: new Set(),
  trim: new Set(),
  exterior: new Set(),
  interior: new Set(),
};

const ALLOWED_SEARCH_RADII = [50, 100, 250, 500, 1000];

const ZIP_COORDS = {
  "29577": { city: "Myrtle Beach", state: "SC", latitude: 33.6891, longitude: -78.8867 },
};

const STATE_TAX_RULES = {
  AL: { name: "Alabama", rate: 0.04 },
  AK: { name: "Alaska", rate: 0 },
  AZ: { name: "Arizona", rate: 0.056 },
  AR: { name: "Arkansas", rate: 0.065 },
  CA: { name: "California", rate: 0.0625 },
  CO: { name: "Colorado", rate: 0.029 },
  CT: { name: "Connecticut", rate: 0.0635 },
  DE: { name: "Delaware", rate: 0 },
  FL: { name: "Florida", rate: 0.06 },
  GA: { name: "Georgia", rate: 0.04, label: "GA base sales tax estimate" },
  HI: { name: "Hawaii", rate: 0.04 },
  ID: { name: "Idaho", rate: 0.06 },
  IL: { name: "Illinois", rate: 0.0625 },
  IN: { name: "Indiana", rate: 0.07 },
  IA: { name: "Iowa", rate: 0.06 },
  KS: { name: "Kansas", rate: 0.065 },
  KY: { name: "Kentucky", rate: 0.06 },
  LA: { name: "Louisiana", rate: 0.05 },
  ME: { name: "Maine", rate: 0.055 },
  MD: { name: "Maryland", rate: 0.06 },
  MA: { name: "Massachusetts", rate: 0.0625 },
  MI: { name: "Michigan", rate: 0.06 },
  MN: { name: "Minnesota", rate: 0.06875 },
  MS: { name: "Mississippi", rate: 0.07 },
  MO: { name: "Missouri", rate: 0.04225 },
  MT: { name: "Montana", rate: 0 },
  NE: { name: "Nebraska", rate: 0.055 },
  NV: { name: "Nevada", rate: 0.0685 },
  NH: { name: "New Hampshire", rate: 0 },
  NJ: { name: "New Jersey", rate: 0.06625 },
  NM: { name: "New Mexico", rate: 0.04875 },
  NY: { name: "New York", rate: 0.04 },
  NC: { name: "North Carolina", rate: 0.0475 },
  ND: { name: "North Dakota", rate: 0.05 },
  OH: { name: "Ohio", rate: 0.0575 },
  OK: { name: "Oklahoma", rate: 0.045 },
  OR: { name: "Oregon", rate: 0 },
  PA: { name: "Pennsylvania", rate: 0.06 },
  RI: { name: "Rhode Island", rate: 0.07 },
  SC: { name: "South Carolina", rate: 0.05, cap: 500, label: "SC Infrastructure Maintenance Fee estimate" },
  SD: { name: "South Dakota", rate: 0.042 },
  TN: { name: "Tennessee", rate: 0.07 },
  TX: { name: "Texas", rate: 0.0625 },
  UT: { name: "Utah", rate: 0.0485 },
  VT: { name: "Vermont", rate: 0.06 },
  VA: { name: "Virginia", rate: 0.043 },
  WA: { name: "Washington", rate: 0.065 },
  WV: { name: "West Virginia", rate: 0.06 },
  WI: { name: "Wisconsin", rate: 0.05 },
  WY: { name: "Wyoming", rate: 0.04 },
  DC: { name: "District of Columbia", rate: 0.06 },
};

const DEALER_ENRICHMENT = {
  "autonation hyundai columbia": {
    phone: "844-931-0114",
    address: "310 Greystone Boulevard, Columbia, SC 29210",
    hours: "Mon-Fri 9:00 AM-7:30 PM; Sat 9:00 AM-6:00 PM; Sun closed",
    email: "Contact form on dealer website",
    source: "dealer_site",
  },
  "pearson hyundai": {
    phone: "(804) 616-4734",
    address: "11701 Midlothian Turnpike, Midlothian, VA 23113",
    hours: "Mon-Fri 8:30 AM-8:00 PM; Sat 9:00 AM-6:00 PM; Sun 12:00 PM-6:00 PM",
    email: "Contact form on dealer website",
    google_rating: "4.2",
    source: "third_party_listing",
  },
  "vaden hyundai of brunswick": {
    address: "5400 Altama Avenue, Brunswick, GA 31525",
    email: "Contact form on dealer website",
    source: "window_sticker",
  },
};

function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function number(value) {
  return Number(value || 0);
}

function selectedRadius() {
  const requested = Number(document.getElementById("radius")?.value || 250);
  return ALLOWED_SEARCH_RADII.includes(requested) ? requested : 250;
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function moneyFactorApr(value) {
  return number(value) ? `${(number(value) * 2400).toFixed(2)}% APR equiv.` : "Verify";
}

function getTradeEquity() {
  const trade = getTradeData();
  if (!trade) return 0;
  return Math.max(0, number(trade.kbb_expected_value) - number(trade.payoff_amount));
}

function calculateTargetDiscount(v, targetPayment) {
  const quote = calculateLeaseQuote(v);
  const target = Math.min(number(targetPayment), number(quote.monthlyPayment));
  const residual = quote.residualValue;
  const term = quote.term || 36;
  const mf = number(quote.moneyFactor);
  const tradeEquity = getTradeEquity();
  const currentCapCost = Math.max(0, quote.publicCapCost - tradeEquity);

  if (!target || !term || !residual || !mf) {
    return {
      tradeEquity,
      currentCapCost,
      requiredDiscount: 0,
      discountPercent: 0,
      risk: "unknown",
      label: "Enter target payment",
    };
  }

  const denominator = 1 / term + mf;
  const neededCapCost = (target + residual / term - residual * mf) / denominator;
  const requiredDiscount = Math.max(0, currentCapCost - neededCapCost);
  const discountPercent = quote.msrp ? requiredDiscount / quote.msrp : 0;
  let risk = "green";
  let label = "Likely realistic";

  if (discountPercent >= 0.12) {
    risk = "red";
    label = "High risk to be denied";
  } else if (discountPercent >= 0.07) {
    risk = "orange";
    label = "Aggressive ask";
  }

  return {
    tradeEquity,
    currentCapCost,
    neededCapCost,
    requiredDiscount,
    discountPercent,
    risk,
    label,
  };
}

function authHeaders(extra = {}) {
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    ...extra,
  };
}

function setConnectionStatus(status, text) {
  const el = document.getElementById("connectionStatus");
  if (!el) return;

  el.className = `connection-status ${status}`;
  el.textContent = text;
}

function showHelpTooltip(target) {
  const text = target?.dataset?.help || "";
  if (!text) return;

  let tooltip = document.getElementById("globalHelpTooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "globalHelpTooltip";
    tooltip.className = "global-help-tooltip";
    document.body.appendChild(tooltip);
  }

  tooltip.textContent = text;
  tooltip.classList.add("visible");

  const rect = target.getBoundingClientRect();
  const margin = 12;
  const width = Math.min(320, window.innerWidth - margin * 2);
  tooltip.style.maxWidth = `${width}px`;

  const tooltipRect = tooltip.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));
  let top = rect.bottom + 9;

  if (top + tooltipRect.height > window.innerHeight - margin) {
    top = rect.top - tooltipRect.height - 9;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.max(margin, top)}px`;
}

function hideHelpTooltip() {
  document.getElementById("globalHelpTooltip")?.classList.remove("visible");
}

function initHelpTooltips() {
  document.addEventListener("mouseover", (event) => {
    const tip = event.target.closest(".help-tip");
    if (tip) showHelpTooltip(tip);
  });

  document.addEventListener("focusin", (event) => {
    const tip = event.target.closest(".help-tip");
    if (tip) showHelpTooltip(tip);
  });

  document.addEventListener("mouseout", (event) => {
    if (event.target.closest(".help-tip")) hideHelpTooltip();
  });

  document.addEventListener("focusout", (event) => {
    if (event.target.closest(".help-tip")) hideHelpTooltip();
  });

  document.addEventListener("scroll", hideHelpTooltip, true);
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function sameText(a, b) {
  return normalizeText(a) === normalizeText(b);
}

function isAnyValue(value) {
  return ["", "any", "all", "all models", "all makes"].includes(normalizeText(value));
}

function setResultsSource(text) {
  const el = document.getElementById("resultsSource");
  if (el) el.textContent = text || "";
}

function setSearchUiState(state) {
  const isIdle = state === "idle";
  const isLoading = state === "loading";
  const isResults = state === "results";

  document.getElementById("emptyState")?.classList.toggle("hidden", !isIdle);
  document.getElementById("loadingPanel")?.classList.toggle("hidden", !isLoading);
  document.getElementById("searchSummary")?.classList.toggle("hidden", !isResults);
  document.getElementById("resultsHead")?.classList.toggle("hidden", !isResults);
}

function setSearchProgress(percent, title, text) {
  const bar = document.getElementById("searchProgressBar");
  const percentEl = document.getElementById("searchProgressPercent");
  const titleEl = document.getElementById("searchProgressTitle");
  const textEl = document.getElementById("searchProgressText");
  const cleanPercent = Math.max(0, Math.min(100, Number(percent || 0)));

  if (bar) bar.style.width = `${cleanPercent}%`;
  if (percentEl) percentEl.textContent = `${cleanPercent}%`;
  if (titleEl) titleEl.textContent = title;
  if (textEl) textEl.textContent = text;
}

function resetSearchProgressLog() {
  const log = document.getElementById("searchProgressLog");
  if (log) log.innerHTML = "";
}

function addSearchProgressLog(percent, title, detail = "") {
  const log = document.getElementById("searchProgressLog");
  if (!log) return;

  const event = document.createElement("div");
  event.className = "progress-event";
  event.innerHTML = `
    <div class="progress-pct">${Math.max(0, Math.min(100, percent))}%</div>
    <div>
      <b>${title}</b>
      ${detail ? `<span>${detail}</span>` : ""}
    </div>
  `;
  log.appendChild(event);
  log.scrollTop = log.scrollHeight;
}

function dedupeVehicles(list = []) {
  const seen = new Set();
  const cleaned = [];

  list.forEach((vehicle) => {
    const key = normalizeText(vehicle.vin || `${vehicle.dealer_name}-${vehicle.stock_number}-${vehicle.listing_url}`);
    if (!key || seen.has(key)) return;
    seen.add(key);
    cleaned.push(vehicle);
  });

  return cleaned;
}

function upsertLiveDealer(dealer) {
  const normalized = normalizeBackendDealer(dealer);
  const key = normalizeText(normalized.name);
  const existingIndex = lastDealersInRadius.findIndex((item) => normalizeText(item.name) === key);

  if (existingIndex >= 0) {
    lastDealersInRadius[existingIndex] = { ...lastDealersInRadius[existingIndex], ...normalized };
  } else {
    lastDealersInRadius.push(normalized);
  }

  lastDealersInRadius.sort((a, b) => number(a.distance_miles) - number(b.distance_miles));
  document.getElementById("dealerCount").textContent = lastDealersInRadius.length;
  renderDealerCoverage(lastSearchBody);
}

function appendLiveVehicles(list = []) {
  const incoming = list.map(normalizeCachedVehicle);
  const existing = new Set(vehicles.map((v) => v.vin || `${v.dealer_name}-${v.stock_number}-${v.listing_url}`));

  incoming.forEach((vehicle) => {
    const key = vehicle.vin || `${vehicle.dealer_name}-${vehicle.stock_number}-${vehicle.listing_url}`;
    if (!existing.has(key)) {
      existing.add(key);
      vehicles.push(vehicle);
    }
  });

  vehicles = dedupeVehicles(vehicles);
  document.getElementById("vehicleCount").textContent = vehicles.length;
}

function applySearchProgressEvent(event = {}, body = lastSearchBody) {
  const percentValue = number(event.percent || event.progress);
  const percentDone = percentValue ? Math.min(99, Math.max(0, percentValue)) : 0;
  const type = event.type || event.event || event.status || "";

  if (percentDone) {
    setSearchProgress(percentDone, event.title || "Searching", event.message || event.detail || "");
  }

  if (type === "dealer_found" && event.dealer) {
    upsertLiveDealer(event.dealer);
    addSearchProgressLog(percentDone || 15, `Found dealer: ${event.dealer.name || event.dealer.dealer_name || "Dealer"}`, event.message || "");
  } else if (type === "inventory_found" && Array.isArray(event.vehicles)) {
    appendLiveVehicles(event.vehicles);
    addSearchProgressLog(percentDone || 60, `Found ${event.vehicles.length} car${event.vehicles.length === 1 ? "" : "s"}`, event.dealer_name || "");
  } else if (event.title || event.message) {
    addSearchProgressLog(percentDone || 0, event.title || "Search update", event.message || event.detail || "");
  }

  if (body && lastDealersInRadius.length) renderDealerCoverage(body);
}

async function readInventorySearchResponse(response, body) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/x-ndjson") && response.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalData = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      lines.filter(Boolean).forEach((line) => {
        const event = JSON.parse(line);
        if (event.type === "done" || event.event === "done") {
          finalData = event.data || event;
        } else if (event.type === "error" || event.event === "error") {
          throw new Error(event.error || event.message || "Backend stream error");
        } else {
          applySearchProgressEvent(event, body);
        }
      });
    }

    if (buffer.trim()) {
      const event = JSON.parse(buffer);
      if (event.type === "error" || event.event === "error") {
        throw new Error(event.error || event.message || "Backend stream error");
      }
      finalData = event.data || event;
    }

    return finalData || { ok: response.ok, dealers: lastDealersInRadius, vehicles };
  }

  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Backend returned non-JSON. Status ${response.status}. ${text}`);
  }
}

function getTaxRule(state) {
  return STATE_TAX_RULES[state] || STATE_TAX_RULES.SC;
}

function calculateTax(taxableAmount, state) {
  const rule = getTaxRule(state);
  const rawTax = Math.max(0, number(taxableAmount) * rule.rate);
  const tax = rule.cap ? Math.min(rawTax, rule.cap) : rawTax;

  return {
    tax,
    govFees: rule.govFees || 0,
    label: rule.label || `${rule.name || state} state sales tax estimate`,
    note: rule.note || `Estimated with ${((rule.rate || 0) * 100).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}% state base rate. Local, county, lease, EV, registration, and dealer document rules can change final tax.`,
    rate: rule.rate,
    cap: rule.cap || null,
    stateName: rule.name || state,
  };
}

function distanceMiles(a, b) {
  if (!a || !b || !a.latitude || !a.longitude || !b.latitude || !b.longitude) return 0;

  const radius = 3958.8;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return Math.round(radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 10) / 10;
}

function selectedZipCoords() {
  const zip = document.getElementById("zipCode")?.value?.trim();
  return ZIP_COORDS[zip] || ZIP_COORDS["29577"];
}

function initRegistrationStates() {
  const select = document.getElementById("registrationState");
  if (!select) return;

  select.innerHTML = Object.entries(STATE_TAX_RULES)
    .map(([code, rule]) => `<option value="${code}" ${code === "SC" ? "selected" : ""}>${rule.name} (${code}) - ${((rule.rate || 0) * 100).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%</option>`)
    .join("");
}

function getDealerDistance(dealer) {
  return distanceMiles(selectedZipCoords(), dealer);
}

function getDealersInRadius(body) {
  const radius = Number(body?.radius || selectedRadius());
  const brand = body?.brand || document.getElementById("brand")?.value || "";

  return dealersCatalog
    .filter((dealer) => dealer.active !== false)
    .filter((dealer) => sameText(dealer.brand, brand))
    .map((dealer) => ({ ...dealer, distance_miles: getDealerDistance(dealer) }))
    .filter((dealer) => !dealer.distance_miles || dealer.distance_miles <= radius)
    .sort((a, b) => number(a.distance_miles) - number(b.distance_miles));
}

function normalizeBackendDealer(dealer = {}) {
  const name = dealer.name || dealer.dealer_name || dealer.dealerName || "Dealer";

  return {
    ...dealer,
    name,
    city: dealer.city || dealer.dealer_city || "",
    state: dealer.state || dealer.dealer_state || "",
    website: dealer.website || dealer.dealer_website || dealer.url || "",
    phone: dealer.phone || dealer.dealer_phone || "",
    email: dealer.email || dealer.dealer_email || "",
    address: dealer.address || dealer.dealer_address || "",
    hours: dealer.hours || dealer.dealer_hours || "",
    google_rating: dealer.google_rating || dealer.rating || "",
    distance_miles: number(dealer.distance_miles || dealer.dealer_distance_miles || dealer.distance || 0),
  };
}

function dealersFromVehicles(list = []) {
  const byDealer = new Map();

  list.forEach((vehicle) => {
    const name = vehicle.dealer_name || "Dealer";
    const key = normalizeText(name);
    if (byDealer.has(key)) return;

    byDealer.set(
      key,
      normalizeBackendDealer({
        name,
        city: vehicle.dealer_city,
        state: vehicle.dealer_state,
        website: vehicle.dealer_website,
        phone: vehicle.dealer_phone,
        email: vehicle.dealer_email,
        address: vehicle.dealer_address,
        hours: vehicle.dealer_hours,
        google_rating: vehicle.google_rating,
        distance_miles: vehicle.dealer_distance_miles,
      })
    );
  });

  return [...byDealer.values()].sort((a, b) => number(a.distance_miles) - number(b.distance_miles));
}

function normalizeBackendDealers(data = {}, list = []) {
  const rawDealers = data.dealers || data.dealerCoverage || data.dealer_coverage || data.dealers_found || [];
  const normalized = Array.isArray(rawDealers) ? rawDealers.map(normalizeBackendDealer) : [];
  return normalized.length ? normalized.sort((a, b) => number(a.distance_miles) - number(b.distance_miles)) : dealersFromVehicles(list);
}

function getDealerMeta(vOrDealer = {}) {
  const dealerName = vOrDealer.dealer_name || vOrDealer.name || "";
  const dealer = dealersCatalog.find((item) => sameText(item.name, dealerName)) || {};
  const enrichment = DEALER_ENRICHMENT[normalizeText(dealerName)] || {};

  return {
    ...dealer,
    ...enrichment,
    name: dealerName || dealer.name || "Dealer",
    city: vOrDealer.dealer_city || dealer.city || "",
    state: vOrDealer.dealer_state || dealer.state || "",
    website: vOrDealer.dealer_website || dealer.website || enrichment.website || "",
    phone: vOrDealer.dealer_phone || dealer.phone || enrichment.phone || "",
    email: vOrDealer.dealer_email || dealer.email || enrichment.email || "",
    address: vOrDealer.dealer_address || dealer.address || enrichment.address || "",
    hours: vOrDealer.dealer_hours || dealer.hours || enrichment.hours || "",
    google_rating: vOrDealer.google_rating || dealer.google_rating || enrichment.google_rating || "",
    distance_miles: vOrDealer.dealer_distance_miles || vOrDealer.distance_miles || "",
  };
}

function dealerRatingText(meta) {
  return meta.google_rating ? `Google ${meta.google_rating} stars` : "";
}

function dealerMetaRows(meta) {
  return [
    dealerRatingText(meta),
    meta.phone,
    meta.address,
    meta.hours,
    meta.email,
  ]
    .filter(Boolean)
    .map((item) => `<span>${item}</span>`)
    .join("");
}

function detectDealerAddons(v) {
  const raw = v.raw_data || {};
  const priceLibrary = raw.price_library || {};
  const explicit = number(v.dealer_addons_amount || v.junk_fee || raw.addon_total);
  const accessoryTotal = number(priceLibrary.calc_accoessories || priceLibrary.calc_accessories || priceLibrary.Accessories);
  return Math.max(explicit, accessoryTotal);
}

function vehicleIncentiveRows(v) {
  const raw = v.raw_data || {};
  const rows = [];
  const seen = new Set();

  const addRow = (name, amount, detail = "") => {
    const numericAmount = number(amount);
    const key = `${normalizeText(name)}:${numericAmount}`;
    if (!numericAmount || seen.has(key)) return;
    seen.add(key);
    rows.push({ name, amount: numericAmount, detail });
  };

  addRow("Manufacturer incentive applied", v.manufacturer_rebate || raw.detected_rebate, "Included in the public estimate.");

  rebatesCatalog
    .filter((r) => sameText(r.brand, v.brand) && sameText(r.model, v.model) && Number(r.year) === Number(v.year))
    .forEach((r) => {
      addRow(
        r.rebate_name || "Manufacturer incentive",
        r.amount,
        `${r.customer_must_qualify ? "Must qualify. " : "General public. "}${r.verified ? "Verified." : "Dealer/OEM verification needed."}`
      );
    });

  (v.available_rebates || raw.available_rebates || []).forEach((r) => {
    addRow(
      r.rebate_name || r.name || "Manufacturer incentive",
      r.amount,
      `${r.customer_must_qualify ? "Must qualify. " : ""}${r.verified ? "Verified." : "Dealer/OEM verification needed."}`
    );
  });

  return rows;
}

function rebateStrength(v, quote) {
  const msrp = number(quote?.msrp || v.msrp);
  const incentive = number(quote?.incentive || v.manufacturer_rebate);
  const ratio = msrp ? incentive / msrp : 0;

  if (incentive >= 10000 || ratio >= 0.12) {
    return {
      className: "aggressive",
      label: "Aggressive rebate",
      text: `${money(incentive)} public incentive detected. Strong rebate relative to MSRP.`,
    };
  }

  if (incentive >= 5000 || ratio >= 0.07) {
    return {
      className: "strong",
      label: "Strong rebate",
      text: `${money(incentive)} public incentive detected. Worth comparing against similar cars.`,
    };
  }

  return null;
}

const PRICE_HELP = {
  msrp: "Manufacturer Suggested Retail Price. This is the sticker price from the manufacturer before dealer discount, incentives, taxes, fees, or add-ons.",
  dealerWebsitePrice: "The advertised price shown on the dealer website. Dealers may include, exclude, or condition this price with incentives, add-ons, or fine print, so VINDeal does not use it as the lease cap cost.",
  adjustedCapCost: "Estimated base cap cost before dealer discount: MSRP - verified manufacturer incentive. Bank acquisition fee, dealer fee, add-ons, taxes, registration, and final documents are shown separately.",
  manufacturerIncentive: "Public manufacturer incentive currently attached to this vehicle/program. Extra conditional incentives require buyer qualification and dealer/manufacturer verification.",
  invoice: "Dealer invoice, when verified. This is an internal wholesale-like reference and may not include holdback, marketing support, or other dealer programs.",
  overInvoice: "Difference between the public price reference and verified invoice. Use this only as negotiation context.",
  docFee: "Dealer documentation/processing fee. This is charged by the dealer and should be separated from bank acquisition fee and government fees.",
  bankAcquisitionFee: "Bank acquisition fee charged by the lease lender. It is shown separately so buyers know what the bank charges.",
  dealerAddons: "Dealer accessories or add-ons detected from stored vehicle data. This can include accessories, protection packages, or other dealer-installed products when available.",
  residual: "Residual percentage from the lease program. It estimates what the bank says the vehicle will be worth at lease end.",
  residualValue: "Residual dollar value = MSRP x residual percentage. This is used in the lease depreciation calculation.",
  moneyFactor: "Money factor from the lease program. APR equivalent is estimated as money factor x 2400, but final approval depends on credit and lender decision.",
  baseProgram: "The basic public lease program used for this card, such as 36 months / 10,000 miles or 12,000 miles depending on the stored/loaded program.",
  estimatedMonthly: "Estimated monthly payment from public lease math: depreciation charge plus rent charge, before dealer discount, taxes, government fees, doc fee, add-ons, and final dealer documents.",
  totalPayments: "Estimated monthly payment multiplied by the base lease term. It does not include amount due at signing, taxes, registration, doc fee, dealer add-ons, or final lender/dealer changes.",
  estimatedTax: "Estimated sales/use tax based on the selected registration state and the estimated total base lease payments. Local tax, lease tax rules, EV fees, registration, and dealer documents can change the final tax.",
  taxRule: "The state base tax rule currently used for this estimate. This is not a final tax quote.",
};

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function helpTip(text) {
  return `<button type="button" class="help-tip" data-help="${escapeAttr(text)}" aria-label="Explain this number">?</button>`;
}

function priceItem(label, value, helpKey, className = "") {
  return `
    <div class="${className}">
      <span>${label}${helpTip(PRICE_HELP[helpKey] || "Dealer must verify final numbers.")}</span>
      <b>${value}</b>
    </div>
  `;
}

function moneyOrVerify(value) {
  return number(value) ? money(value) : "Verify";
}

function normalizeStickerUrl(v) {
  const raw = v.raw_data || {};
  const stickerModel =
    raw.card_json?.VehicleCard?.WindowStickerModel ||
    raw.card_json?.VehicleCard?.VehicleFeaturesModel?.WindowStickersModel ||
    raw.card_json?.VehicleCard?.VehicleFeaturesModel?.WindowStickerModel ||
    {};
  const clickEvent = stickerModel.ClickEvent || "";
  const match = clickEvent.match(/OpenWindowSticker\('([^']+)'/);
  const stickerPath = match?.[1];

  if (stickerPath && v.listing_url) {
    try {
      const origin = new URL(v.listing_url).origin;
      return `${origin}${stickerPath}`;
    } catch (error) {
      return stickerPath;
    }
  }

  if (v.window_sticker_url) {
    try {
      const url = new URL(v.window_sticker_url, v.listing_url || window.location.origin);
      url.searchParams.set("_", Date.now().toString());
      return url.toString();
    } catch (error) {
      return v.window_sticker_url;
    }
  }

  return "";
}

function leaseProgramMatchesVehicle(program, v) {
  return (
    sameText(program.brand, v.brand) &&
    sameText(program.model, v.model) &&
    Number(program.year) === Number(v.year) &&
    (sameText(program.trim, v.trim) || sameText(program.trim, "Any"))
  );
}

function findLeaseProgram(v, term, miles) {
  return leaseProgramsCatalog.find((program) => leaseProgramMatchesVehicle(program, v) && Number(program.term) === Number(term) && Number(program.miles) === Number(miles)) || null;
}

function getBaseLeaseProgram(v) {
  const vehicleTerm = number(v.term);
  const vehicleMiles = number(v.miles);

  if (vehicleTerm && vehicleMiles) {
    return {
      term: vehicleTerm,
      miles: vehicleMiles,
      program: findLeaseProgram(v, vehicleTerm, vehicleMiles),
    };
  }

  const program =
    leaseProgramsCatalog
      .filter((candidate) => leaseProgramMatchesVehicle(candidate, v))
      .sort((a, b) => {
        if (programIsVerified(a) !== programIsVerified(b)) return programIsVerified(a) ? -1 : 1;
        if (sameText(a.trim, v.trim) !== sameText(b.trim, v.trim)) return sameText(a.trim, v.trim) ? -1 : 1;
        if (Number(a.term) !== Number(b.term)) return Math.abs(Number(a.term) - 36) - Math.abs(Number(b.term) - 36);
        return Math.abs(Number(a.miles) - 10000) - Math.abs(Number(b.miles) - 10000);
      })[0] || null;

  return {
    term: vehicleTerm || number(program?.term) || 36,
    miles: vehicleMiles || number(program?.miles) || 10000,
    program,
  };
}

function programIsVerified(program) {
  return Boolean(program && program.source && !sameText(program.source, "manual") && !String(program.source_note || "").toLowerCase().includes("temporary"));
}

function calculateLeaseQuote(v, options = {}) {
  const msrp = number(v.msrp);
  const baseProgram = getBaseLeaseProgram(v);
  const term = number(options.term || baseProgram.term);
  const miles = number(options.miles || baseProgram.miles);
  const program = options.term || options.miles ? findLeaseProgram(v, term, miles) : baseProgram.program || findLeaseProgram(v, term, miles);
  const verifiedProgram = programIsVerified(program);
  const incentive = number(verifiedProgram && program.manufacturer_rebate ? program.manufacturer_rebate : v.manufacturer_rebate);
  const dealerDocFee = number(v.doc_fee);
  const bankAcquisitionFee = number(v.acquisition_fee);
  const dealerAddons = number(v.dealer_addons_amount || v.junk_fee);
  const fairMarketPrice = number(v.sale_price || v.advertised_price || msrp);
  const adjustedCapCost = Math.max(0, msrp - incentive);
  const publicCapCost = adjustedCapCost;
  const residualPercent = number(program?.residual_percent || v.residual_percent);
  const residualValue = msrp * (residualPercent / 100);
  const moneyFactor = number(program?.money_factor || v.money_factor);
  const depreciation = term ? Math.max(0, publicCapCost - residualValue) / term : 0;
  const financeCharge = (publicCapCost + residualValue) * moneyFactor;
  const monthlyPayment = depreciation + financeCharge;

  return {
    msrp,
    incentive,
    dealerDocFee,
    bankAcquisitionFee,
    dealerAddons,
    fairMarketPrice,
    adjustedCapCost,
    financeAmount: adjustedCapCost,
    publicCapCost,
    residualPercent,
    residualValue,
    moneyFactor,
    monthlyPayment,
    term,
    miles,
    totalPayments: monthlyPayment * term,
    program,
    programFound: Boolean(program),
    programVerified: verifiedProgram,
    programStatus: program
      ? verifiedProgram
        ? "Verified manufacturer program"
        : "Program source pending"
      : "No base program loaded for this vehicle",
  };
}

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: authHeaders(),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || `Supabase request failed: ${res.status}`);
  }

  return Array.isArray(data) ? data : [];
}

async function verifySupabaseConnection() {
  setConnectionStatus("checking", "Checking");
  await supabaseGet("dealers?select=id&limit=1");
  setConnectionStatus("connected", "Connected");
}

async function loadDealers() {
  dealersCatalog = await supabaseGet(
    "dealers?select=id,name,city,state,website,inventory_url,zip_code,brand,active,latitude,longitude,scanner_type&active=eq.true&order=name.asc"
  );
}

function normalizeCachedVehicle(v) {
  const raw = v.raw_data || {};
  const listingUrl = v.listing_url || raw.card_json?.VehicleCard?.VehicleDetailUrl || "";
  const rawImageUrl = v.image_url || raw.card_json?.VehicleCard?.VehicleImageModel?.VehiclePhotoSrc || "";
  let imageUrl = rawImageUrl;

  if (rawImageUrl && rawImageUrl.startsWith("/") && listingUrl) {
    try {
      imageUrl = `${new URL(listingUrl).origin}${rawImageUrl}`;
    } catch (error) {
      imageUrl = rawImageUrl;
    }
  }

  const normalized = {
    ...v,
    dealer_name: v.dealer_name || raw.dealer_name,
    dealer_city: v.dealer_city || raw.dealer_city,
    dealer_state: v.dealer_state || raw.dealer_state,
    dealer_distance_miles: Number(v.dealer_distance_miles || raw.dealer_distance_miles || 0),
    dealer_addons_amount: v.dealer_addons_amount || raw.addon_total || raw.price_library?.calc_accoessories || raw.price_library?.calc_accessories || 0,
    listing_url: listingUrl,
    image_url: imageUrl,
  };

  normalized.window_sticker_url = normalizeStickerUrl(normalized);
  return normalized;
}

function cachedVehicleMatches(v, body) {
  const distance = Number(v.dealer_distance_miles || 0);
  const trimOk = body.trim === "Any" || sameText(v.trim, body.trim);
  const radiusOk = !distance || distance <= Number(body.radius || 0);
  const modelOk = isAnyValue(body.model) || sameText(v.model, body.model);

  return (
    sameText(v.brand, body.brand) &&
    modelOk &&
    Number(v.year) === Number(body.year) &&
    trimOk &&
    radiusOk
  );
}

async function loadCachedVehicles(body) {
  const brand = encodeURIComponent(String(body.brand || "").toUpperCase());
  const year = Number(body.year || 0);
  const path =
    `vehicles?select=*&brand=eq.${brand}&year=eq.${year}` +
    "&order=created_at.desc&limit=100";

  const cached = await supabaseGet(path);
  return cached.map(normalizeCachedVehicle).filter((v) => cachedVehicleMatches(v, body));
}

async function loadCatalog() {
  catalog = await supabaseGet(
    "vehicle_catalog?select=brand,model,trim,year&active=eq.true&order=brand.asc,model.asc,trim.asc"
  );

  updateBrandOptions();
}

async function loadAllColors() {
  colorsCatalog = await supabaseGet(
    "vehicle_color_catalog?select=brand,model,trim,year,color_type,color_name&active=eq.true&order=color_name.asc"
  );
}

async function loadAllLeasePrograms() {
  leaseProgramsCatalog = await supabaseGet(
    "lease_programs?select=*&active=eq.true&order=created_at.desc"
  );
}

function updateBrandOptions() {
  const brandSelect = document.getElementById("brand");
  brandSelect.innerHTML = "";

  unique(catalog.map((x) => x.brand)).forEach((brand) => {
    brandSelect.innerHTML += `<option value="${brand}">${brand}</option>`;
  });

  const hyundaiOption = [...brandSelect.options].find((option) => sameText(option.value, "Hyundai"));
  if (hyundaiOption) brandSelect.value = hyundaiOption.value;

  updateModelOptions();
}

function updateModelOptions() {
  const brand = document.getElementById("brand").value;
  const modelSelect = document.getElementById("model");

  modelSelect.innerHTML = `<option value="Any">All models</option>`;

  unique(catalog.filter((x) => x.brand === brand).map((x) => x.model)).forEach((model) => {
    modelSelect.innerHTML += `<option value="${model}">${model}</option>`;
  });

  updateTrimOptions();
}

function updateTrimOptions() {
  const brand = document.getElementById("brand").value;
  const model = document.getElementById("model").value;
  const trimSelect = document.getElementById("trim");

  trimSelect.innerHTML = `<option value="Any">Any</option>`;
  if (isAnyValue(model)) {
    updateYearOptions();
    refreshModelFilters();
    return;
  }

  unique(
    catalog
      .filter((x) => x.brand === brand && x.model === model)
      .map((x) => x.trim)
  ).forEach((trim) => {
    trimSelect.innerHTML += `<option value="${trim}">${trim}</option>`;
  });

  updateYearOptions();
  refreshModelFilters();
}

function updateYearOptions() {
  const brand = document.getElementById("brand").value;
  const model = document.getElementById("model").value;
  const yearSelect = document.getElementById("year");

  yearSelect.innerHTML = "";

  unique(
    catalog
      .filter((x) => x.brand === brand && (isAnyValue(model) || x.model === model))
      .map((x) => x.year)
  )
    .sort((a, b) => b - a)
    .forEach((year) => {
      yearSelect.innerHTML += `<option value="${year}">${year}</option>`;
    });
}

async function refreshModelFilters() {
  loadColorOptions();
  try {
    await loadProgramsForSelectedCar();
  } catch (error) {
    console.warn("Program/incentive preload failed", error);
  }
}

function buildCheckPills(boxId, values, name, checkedAny = true) {
  const box = document.getElementById(boxId);
  if (!box) return;

  if (!values.length) {
    box.innerHTML = `<span class="muted">No filters loaded.</span>`;
    return;
  }

  box.innerHTML = values
    .map((value) => {
      const checked = checkedAny && value === "Any" ? "checked" : "";

      return `
        <label class="check-pill">
          <input type="checkbox" name="${name}" value="${value}" ${checked} />
          <span>${value}</span>
        </label>
      `;
    })
    .join("");

  box.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => handleAnyCheckbox(boxId, name, input));
  });
}

function handleAnyCheckbox(boxId, name, changedInput) {
  const box = document.getElementById(boxId);
  const inputs = [...box.querySelectorAll(`input[name="${name}"]`)];
  const any = inputs.find((x) => x.value === "Any");

  if (!any) return;

  if (changedInput.value === "Any" && any.checked) {
    inputs.forEach((x) => {
      if (x.value !== "Any") x.checked = false;
    });
  } else if (changedInput.value !== "Any") {
    any.checked = false;
  }

  if (!inputs.some((x) => x.checked)) {
    any.checked = true;
  }
}

function loadColorOptions() {
  if (!document.getElementById("exteriorColorOptions") || !document.getElementById("interiorColorOptions")) {
    return;
  }

  const brand = document.getElementById("brand")?.value || "";
  const model = document.getElementById("model")?.value || "";
  const trim = document.getElementById("trim")?.value || "Any";
  const year = Number(document.getElementById("year")?.value || 0);

  const exterior = unique(
    colorsCatalog
      .filter(
        (x) =>
          x.brand === brand &&
          !isAnyValue(model) &&
          x.model === model &&
          Number(x.year) === year &&
          x.color_type === "exterior" &&
          (x.trim === trim || x.trim === "Any")
      )
      .map((x) => x.color_name)
  );

  const interior = unique(
    colorsCatalog
      .filter(
        (x) =>
          x.brand === brand &&
          !isAnyValue(model) &&
          x.model === model &&
          Number(x.year) === year &&
          x.color_type === "interior" &&
          (x.trim === trim || x.trim === "Any")
      )
      .map((x) => x.color_name)
  );

  buildCheckPills("exteriorColorOptions", exterior.length ? exterior : ["Any"], "exteriorColor", true);
  buildCheckPills("interiorColorOptions", interior.length ? interior : ["Any"], "interiorColor", true);
}

function buildResultFilters() {
  const panel = document.getElementById("resultFilters");
  const box = document.getElementById("filterChips");
  if (!panel) return;

  if (!vehicles.length) {
    panel.classList.add("hidden");
    if (box) box.innerHTML = "";
    return;
  }

  const groups = [
    ["dealer", "Dealer", vehicles.map((v) => v.dealer_name || "Dealer")],
    ["trim", "Trim", vehicles.map((v) => v.trim)],
    ["exterior", "Exterior", vehicles.map((v) => v.exterior_color)],
    ["interior", "Interior", vehicles.map((v) => v.interior_color)],
  ];

  if (box) {
    box.innerHTML = `
      ${groups
        .map(([key, label, values]) => {
          const options = unique(values.filter(Boolean)).sort();
          if (!options.length) return "";

          return `
            <div class="chip-group">
              <b>${label}</b>
              <div class="chip-row">
                ${options
                  .map((value) => {
                    const checked = activeResultFilters[key].has(value);
                    return `
                      <label class="filter-chip ${checked ? "active" : ""}">
                        <input type="checkbox" ${checked ? "checked" : ""} onchange="toggleResultFilter('${key}', '${encodeURIComponent(value)}', this.checked)" />
                        ${value}
                      </label>
                    `;
                  })
                  .join("")}
              </div>
            </div>
          `;
        })
        .join("")}
      <div class="filter-actions">
        <button type="button" class="secondary-btn" onclick="sendSelectedBidRequests()">Invite Selected Dealers</button>
        <button type="button" class="ghost-btn" onclick="clearResultFilters()">Clear Filters</button>
      </div>
    `;
  }

  panel.classList.remove("hidden");
}

function clearResultFilters() {
  Object.keys(activeResultFilters).forEach((key) => {
    activeResultFilters[key] = new Set();
  });
  buildResultFilters();
  renderVehicles();
}

function toggleResultFilter(key, encodedValue, checked) {
  const value = decodeURIComponent(encodedValue);
  if (!activeResultFilters[key]) return;

  if (checked) {
    activeResultFilters[key].add(value);
  } else {
    activeResultFilters[key].delete(value);
  }

  buildResultFilters();
  renderVehicles();
}

async function loadProgramsForSelectedCar() {
  const brand = document.getElementById("brand")?.value || "";
  const model = document.getElementById("model")?.value || "";
  const trim = document.getElementById("trim")?.value || "Any";
  const year = Number(document.getElementById("year")?.value || 2026);
  const term = Number(document.getElementById("term")?.value || 36);
  const miles = Number(document.getElementById("miles")?.value || 10000);

  if (isAnyValue(model)) {
    rebatesCatalog = [];
    leaseProgramPreview = null;
    renderRebateOptions();
    renderProgramPreview();
    return;
  }

  rebatesCatalog = await supabaseGet(
    `manufacturer_rebate_programs?select=*&active=eq.true&brand=eq.${encodeURIComponent(brand)}&model=eq.${encodeURIComponent(model)}&year=eq.${year}&order=amount.desc`
  );

  const leasePrograms = await supabaseGet(
    `lease_programs?select=*&active=eq.true&brand=eq.${encodeURIComponent(brand)}&model=eq.${encodeURIComponent(model)}&year=eq.${year}&term=eq.${term}&miles=eq.${miles}&order=created_at.desc`
  );

  leaseProgramPreview =
    leasePrograms.find((x) => x.trim === trim) ||
    leasePrograms.find((x) => x.trim === "Any") ||
    null;

  renderRebateOptions();
  renderProgramPreview();
}

function renderRebateOptions() {
  const box = document.getElementById("rebateOptions");
  if (!box) return;

  if (!rebatesCatalog.length) {
    box.innerHTML = `<span class="muted">No manufacturer incentives available for this car.</span>`;
    return;
  }

  box.innerHTML = rebatesCatalog
    .map((r) => {
      const mustQualify = r.customer_must_qualify ? "Must qualify" : "General";
      const checked = r.customer_must_qualify ? "" : "checked";
      const verified = r.verified ? "Verified" : "Needs source verification";

      return `
        <label class="rebate-pill">
          <input type="checkbox" value="${r.id}" ${checked} />
          <span>
            <b>${r.rebate_name}</b>
            <em>${money(r.amount)} - ${mustQualify} - ${verified} - Expires ${r.expires_at || "Unknown"}</em>
          </span>
        </label>
      `;
    })
    .join("");
}

function renderProgramPreview() {
  const box = document.getElementById("programPreview");
  if (!box) return;

  box.classList.remove("hidden");

  if (!leaseProgramPreview) {
    box.innerHTML = `<b>Lease Program:</b> <span>Residual and Tier 1 MF not loaded yet.</span>`;
    return;
  }

  const verified = leaseProgramPreview.verified ? "Verified" : "Needs source verification";

  box.innerHTML = `
    <b>Lease Program:</b>
    <span>Residual ${leaseProgramPreview.residual_percent}%</span>
    <span>Tier 1 MF ${leaseProgramPreview.money_factor}</span>
    <span>${verified}</span>
    <span>${leaseProgramPreview.source_note || leaseProgramPreview.source || "Source pending"}</span>
    <span>Expires ${leaseProgramPreview.expires_at || "Unknown"}</span>
  `;
}

function getCheckedValues(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((x) => x.value);
}

function getSelectedExteriorColors() {
  return getCheckedValues("exteriorColor");
}

function getSelectedInteriorColors() {
  return getCheckedValues("interiorColor");
}

function getSelectedRebates() {
  return [...document.querySelectorAll("#rebateOptions input[type='checkbox']:checked")]
    .map((input) => rebatesCatalog.find((r) => r.id === input.value))
    .filter(Boolean);
}

function getBuyerQualifications() {
  return [...document.querySelectorAll("input[name='buyerQualification']:checked")].map((input) => input.value);
}

function countVehicleDealers(list = vehicles) {
  return new Set(list.map((v) => normalizeText(v.dealer_name || v.dealer_id || "Dealer")).filter(Boolean)).size;
}

function applyFilters() {
  renderVehicles();
}

function vehicleDiscount(v) {
  return Math.max(0, number(v.msrp) - number(v.sale_price || v.advertised_price || v.msrp)) + number(v.manufacturer_rebate);
}

function vehicleDealScore(v) {
  const msrp = number(v.msrp);
  if (!msrp) return 0;
  return vehicleDiscount(v) / msrp;
}

function sortVehicleList(list) {
  return [...list].sort((a, b) => {
    if (resultSort === "price_low") return number(a.sale_price || a.advertised_price || a.msrp) - number(b.sale_price || b.advertised_price || b.msrp);
    if (resultSort === "price_high") return number(b.sale_price || b.advertised_price || b.msrp) - number(a.sale_price || a.advertised_price || a.msrp);
    if (resultSort === "discount") return vehicleDiscount(b) - vehicleDiscount(a);
    if (resultSort === "deal") return vehicleDealScore(b) - vehicleDealScore(a);
    return number(a.dealer_distance_miles) - number(b.dealer_distance_miles);
  });
}

function updateResultSort(value) {
  resultSort = value || "closest";
  renderVehicles();
}

function matchesLocalFilters(v) {
  const dealerOk = !activeResultFilters.dealer.size || activeResultFilters.dealer.has(v.dealer_name || "Dealer");
  const trimOk = !activeResultFilters.trim.size || activeResultFilters.trim.has(v.trim);
  const extOk = !activeResultFilters.exterior.size || activeResultFilters.exterior.has(v.exterior_color);
  const intOk = !activeResultFilters.interior.size || activeResultFilters.interior.has(v.interior_color);

  return dealerOk && trimOk && extOk && intOk;
}

function renderDealerCoverage(body) {
  const box = document.getElementById("dealerCoverage");
  if (!box) return;

  const dealers = lastDealersInRadius;
  if (vehicles.length) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }

  const carsByDealer = vehicles.reduce((acc, v) => {
    const key = normalizeText(v.dealer_name || "Dealer");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  if (!dealers.length) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }

  box.classList.remove("hidden");
  box.innerHTML = `
    <div class="dealer-chip-grid">
      ${dealers
        .map((dealer) => {
          const count = carsByDealer[normalizeText(dealer.name)] || 0;
          const meta = getDealerMeta(dealer);
          return `
            <div class="dealer-chip ${count ? "has-cars" : ""}">
              <b>${dealer.name}</b>
              <span>${dealer.city || ""}${dealer.state ? ", " + dealer.state : ""}${dealer.distance_miles ? " - " + dealer.distance_miles + " miles" : ""}</span>
              ${meta.phone ? `<span>${meta.phone}</span>` : ""}
              ${meta.website ? `<span>${meta.website}</span>` : ""}
              <em>${count ? `${count} car${count === 1 ? "" : "s"} found` : "Dealer found"}</em>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

async function scanBackendInventory() {
  const btn = document.getElementById("scanBtn");

  btn.disabled = true;
  btn.textContent = "Searching...";

  vehicles = [];
  lastDealersInRadius = [];
  document.getElementById("vehicleList").innerHTML = "";
  document.getElementById("dealerCount").textContent = "0";
  document.getElementById("vehicleCount").textContent = "0";
  document.getElementById("programStatus").textContent = "Checking";
  document.getElementById("resultFilters")?.classList.add("hidden");
  document.getElementById("dealerCoverage")?.classList.add("hidden");
  setSearchUiState("loading");
  setSearchProgress(0, "Starting search", "Preparing Hyundai dealer and inventory search.");
  resetSearchProgressLog();
  addSearchProgressLog(0, "Search started", "Preparing request.");
  setResultsSource("");

  const body = {
    zipCode: document.getElementById("zipCode").value.trim(),
    radius: selectedRadius(),
    registrationState: document.getElementById("registrationState").value,

    dealType: "lease",
    creditScoreRange: document.getElementById("creditScoreRange").value,

    brand: document.getElementById("brand").value,
    model: document.getElementById("model").value,
    trim: document.getElementById("trim").value,
    year: Number(document.getElementById("year").value),

    term: Number(document.getElementById("term").value || 0),
    miles: Number(document.getElementById("miles").value || 0),

    exteriorColors: getSelectedExteriorColors(),
    interiorColors: getSelectedInteriorColors(),

    selectedRebates: getSelectedRebates(),
    searchScope: "all_dealers_in_radius",
    progressMode: "ndjson",
    useCachedInventoryFallback: false,
    ignoreSeedDealerLimit: true,
  };
  lastSearchBody = body;
  setSearchProgress(10, "Finding dealers", `Searching Hyundai dealers within ${body.radius} miles from ${body.zipCode}.`);
  addSearchProgressLog(10, "Finding dealers", `${body.brand} dealers near ${body.zipCode}.`);

  try {
    const modelText = isAnyValue(body.model) ? "all models" : body.model;
    setSearchProgress(35, "Searching inventory", `Checking dealer inventory for ${body.year} ${body.brand} ${modelText}.`);
    addSearchProgressLog(35, "Searching inventory", "Waiting for backend dealer scanner.");
    const response = await fetch(SCAN_INVENTORY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson, application/json",
        ...authHeaders(),
      },
      body: JSON.stringify(body),
    });

    const data = await readInventorySearchResponse(response, body);

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Backend error");
    }

    vehicles = data.vehicles ? dedupeVehicles(data.vehicles.map(normalizeCachedVehicle)) : dedupeVehicles(vehicles);
    lastDealersInRadius = normalizeBackendDealers(data, vehicles);
    data.count = vehicles.length;
    setResultsSource(data.search_source ? `Source: ${data.search_source}` : "");
    setSearchProgress(
      85,
      "Inventory found",
      `${lastDealersInRadius.length} dealer${lastDealersInRadius.length === 1 ? "" : "s"} checked, ${vehicles.length} car${vehicles.length === 1 ? "" : "s"} found within ${body.radius} miles from ${body.zipCode}.`
    );
    addSearchProgressLog(
      85,
      "Search response received",
      `${lastDealersInRadius.length} dealer${lastDealersInRadius.length === 1 ? "" : "s"} and ${vehicles.length} car${vehicles.length === 1 ? "" : "s"} returned.`
    );

    removedVins = new Set();
    selectedVins = new Set();
    compareVins = new Set();
    activeResultFilters = {
      dealer: new Set(),
      trim: new Set(),
      exterior: new Set(),
      interior: new Set(),
    };
    updateSelectedCount();
    buildResultFilters();
    renderDealerCoverage(body);

    document.getElementById("dealerCount").textContent = lastDealersInRadius.length || countVehicleDealers(vehicles);
    document.getElementById("vehicleCount").textContent = data.count || 0;

    renderProgramStatus(data);
    setSearchProgress(100, "Results ready", `${vehicles.length} car${vehicles.length === 1 ? "" : "s"} ready to review.`);
    setSearchUiState("results");
    renderVehicles();
  } catch (error) {
    alert("Search failed: " + error.message);
    document.getElementById("programStatus").textContent = "Error";
    setSearchUiState("idle");
  } finally {
    btn.disabled = false;
    btn.textContent = "Find My Car";
  }
}

function renderProgramStatus(data) {
  const status = document.getElementById("programStatus");
  const program = data.lease_program;

  if (!program) {
    status.textContent = "Checked";
    return;
  }

  if (!program.verified) {
    status.textContent = "Source pending";
    return;
  }

  status.textContent = "Checked";
}

function groupByDealer(list) {
  const grouped = {};

  list
    .filter((v) => !removedVins.has(v.vin))
    .filter(matchesLocalFilters)
    .forEach((v) => {
      const dealerName = v.dealer_name || "Dealer";
      if (!grouped[dealerName]) grouped[dealerName] = [];
      grouped[dealerName].push(v);
    });

  return grouped;
}

function renderVehicles() {
  const list = document.getElementById("vehicleList");
  const visibleVehicles = sortVehicleList(vehicles.filter((v) => !removedVins.has(v.vin)).filter(matchesLocalFilters));
  const visibleVins = new Set(vehicles.filter((v) => !removedVins.has(v.vin)).map((v) => v.vin));
  selectedVins = new Set([...selectedVins].filter((vin) => visibleVins.has(vin)));
  compareVins = new Set([...compareVins].filter((vin) => visibleVins.has(vin)));
  updateSelectedCount();

  if (!visibleVehicles.length) {
    list.innerHTML = `<div class="empty-box">No live inventory returned for this search.</div>`;
    if (lastSearchBody) renderDealerCoverage(lastSearchBody);
    renderComparePanel();
    return;
  }

  const grouped = groupByDealer(visibleVehicles);
  const groupedEntries = Object.entries(grouped).sort(([, a], [, b]) => {
    const firstA = a[0] || {};
    const firstB = b[0] || {};

    if (resultSort === "closest") {
      return number(firstA.dealer_distance_miles) - number(firstB.dealer_distance_miles);
    }

    return 0;
  });

  list.innerHTML = `
    ${groupedEntries
    .map(([dealerName, dealerVehicles]) => {
      const first = dealerVehicles[0];
      const meta = getDealerMeta(first);

      return `
        <div class="dealer-box">
          <div class="dealer-box-head">
            <div>
              <h3>${dealerName}</h3>
              <p>${first.dealer_city || ""}${first.dealer_state ? ", " + first.dealer_state : ""} ${first.dealer_distance_miles ? " - " + first.dealer_distance_miles + " miles away" : ""}</p>
              <div class="dealer-meta">
                ${dealerMetaRows(meta)}
              </div>
            </div>
            <strong>${dealerVehicles.length} cars</strong>
          </div>

          <div class="vehicle-grid">
            ${sortVehicleList(dealerVehicles).map((v) => renderVehicleCard(v)).join("")}
          </div>
        </div>
      `;
    })
    .join("")}
    <section id="comparePanel" class="compare-panel hidden"></section>
  `;

  renderComparePanel();
}

function renderVehicleCard(v) {
  const raw = v.raw_data || {};
  const quote = calculateLeaseQuote(v);
  const basePayment = quote.monthlyPayment || Number(v.base_monthly_payment || v.estimated_payment || 0);
  const registrationState = document.getElementById("registrationState")?.value || lastSearchBody?.registrationState || "SC";
  const taxEstimate = calculateTax(quote.totalPayments || basePayment * quote.term || quote.adjustedCapCost, registrationState);
  const dealerAddons = detectDealerAddons(v);
  const incentiveRows = vehicleIncentiveRows(v);
  const rebateBadge = rebateStrength(v, quote);
  const docFeeHigh = Number(v.doc_fee || 0) >= 700;
  const isFavorite = favoriteVins.has(v.vin);
  const isSelected = selectedVins.has(v.vin);
  const isCompared = compareVins.has(v.vin);
  const showInvoice = v.invoice_verified && Number(v.invoice_price || 0) > 0;
  const stickerUrl = normalizeStickerUrl(v);
  const targetInputId = `target_${v.vin}`;
  const targetResult = calculateTargetDiscount(v, 0);

  return `
    <div class="vehicle-card ${isSelected ? "selected-card" : ""}" draggable="true" data-vin="${v.vin}">
      <div class="image-box">
        ${
          v.image_url
            ? `<img src="${escapeAttr(v.image_url)}" alt="vehicle" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'), { className: 'no-image', textContent: 'No Image' }))" />`
            : `<div class="no-image">No Image</div>`
        }

        <button class="heart-btn ${isFavorite ? "active" : ""}" aria-label="Favorite" onclick="toggleFavorite('${v.vin}')">+</button>
        <button class="remove-btn" aria-label="Remove" onclick="removeVehicle('${v.vin}')">x</button>
      </div>

      <div class="vehicle-body">
        <div class="vehicle-top">
          <div>
            <h3>${v.year || ""} ${v.brand || ""} ${v.model || ""}</h3>
            <p class="trim-line">${v.trim || ""}</p>
            <p class="trim-line">${v.dealer_name || "Dealer"}${v.dealer_distance_miles ? " - " + v.dealer_distance_miles + " miles" : ""}</p>
          </div>
          <label class="select-car">
            <input type="checkbox" ${isSelected ? "checked" : ""} onchange="toggleSelected('${v.vin}', this.checked)" />
            Invite
          </label>
        </div>

        <div class="vehicle-facts">
          <span><b>VIN</b>${v.vin || "Verify"}</span>
          <span><b>Stock</b>${v.stock_number || "Verify"}</span>
          <span><b>Model</b>${v.model || "Verify"}</span>
          <span><b>Trim</b>${v.trim || "Verify"}</span>
        </div>

        <div class="color-row">
          <span>Exterior: ${v.exterior_color || "Verify with dealer"}</span>
          <span>Interior: ${v.interior_color || "Verify with dealer"}</span>
        </div>

        <div class="price-box">
          ${priceItem("MSRP", moneyOrVerify(v.msrp), "msrp")}
          ${priceItem("Dealer Website Price", moneyOrVerify(v.sale_price), "dealerWebsitePrice")}
          ${priceItem("Base Cap Cost Est.", quote.adjustedCapCost ? money(quote.adjustedCapCost) : "Verify", "adjustedCapCost")}
          ${priceItem("Manufacturer Incentive", quote.incentive ? money(quote.incentive) : "None found", "manufacturerIncentive")}
          ${showInvoice ? priceItem("Invoice", money(v.invoice_price), "invoice") : ""}
          ${showInvoice ? priceItem("Over Invoice", money(v.profit_over_invoice), "overInvoice") : ""}
          ${priceItem("Doc Fee", money(v.doc_fee || 0), "docFee", docFeeHigh ? "fee-bad" : "")}
          ${priceItem("Bank Acquisition Fee", money(v.acquisition_fee || 0), "bankAcquisitionFee")}
          ${priceItem("Known Add-ons", dealerAddons ? money(dealerAddons) : "None found", "dealerAddons")}
          ${priceItem("Residual", quote.residualPercent ? `${quote.residualPercent}%` : "Verify", "residual")}
          ${priceItem("Residual Value", quote.residualValue ? money(quote.residualValue) : "Verify", "residualValue")}
          ${priceItem("Money Factor", quote.monthlyPayment ? `${quote.program?.money_factor || v.money_factor} (${moneyFactorApr(quote.program?.money_factor || v.money_factor)})` : "Verify", "moneyFactor")}
          ${priceItem("Base Program", `${quote.term} mo / ${Number(quote.miles || 0).toLocaleString()} mi`, "baseProgram")}
          ${priceItem("Estimated Monthly", basePayment ? money(basePayment) + "/mo" : "Verify", "estimatedMonthly")}
          ${priceItem("Total Payments", basePayment ? money(basePayment * quote.term) : "Verify", "totalPayments")}
        </div>

        <div class="tax-box">
          <div>
            <span>Estimated State Tax ${helpTip(PRICE_HELP.estimatedTax)}</span>
            <b>${money(taxEstimate.tax)}</b>
          </div>
          <div>
            <span>State Rule ${helpTip(PRICE_HELP.taxRule)}</span>
            <b>${registrationState} - ${((taxEstimate.rate || 0) * 100).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%${taxEstimate.cap ? ` capped at ${money(taxEstimate.cap)}` : ""}</b>
          </div>
          <p>${taxEstimate.note}</p>
        </div>

        <div class="lease-scenario">
          <b>Basic Lease Program</b>
          <span>${quote.term} months / ${Number(quote.miles || 0).toLocaleString()} miles per year. This is the public estimate basis for the card.</span>
          <span id="program_status_${v.vin}" class="program-note ${quote.programVerified ? "good" : "warn"}">${quote.programStatus}</span>
        </div>

        <div class="target-box">
          <label>Target Monthly Payment</label>
          <div class="target-row">
            <input id="${targetInputId}" type="number" min="0" max="${Math.floor(basePayment || 0)}" step="25" placeholder="Example 599" oninput="updateTargetPayment('${v.vin}')" />
            <button type="button" onclick="updateTargetPayment('${v.vin}')">Calculate</button>
          </div>
          <div id="target_result_${v.vin}" class="target-result risk-${targetResult.risk}">
            <b>${targetResult.label}</b>
            <span>Enter the buyer's target payment to estimate the dealer discount needed.</span>
          </div>
        </div>

        <div class="formula-box">
          <b>Estimate Disclaimer</b>
          <span>Lease structure: base cap cost = MSRP - manufacturer incentive. Bank acquisition fee, dealer fee, taxes, and add-ons are shown separately.</span>
          <span>Depreciation: (adjusted cap cost - residual value) / term. Rent charge: (adjusted cap cost + residual value) x money factor.</span>
          <span>Before dealer discount, taxes, registration/government fees, doc fee, dealer add-ons, and final dealer documents.</span>
        </div>

        ${
          dealerAddons > 0
            ? `<div class="addon-total danger">Dealer Add-ons / Accessories Detected: ${money(dealerAddons)}</div>`
            : `<div class="addon-total good">No clear dealer add-ons detected</div>`
        }

        ${
          docFeeHigh
            ? `<div class="addon-total danger">High Dealer Doc Fee: ${money(v.doc_fee || 0)}</div>`
            : ""
        }

        <div class="rebate-list">
          <b>Available Manufacturer Incentives</b>
          ${rebateBadge ? `<div class="rebate-badge ${rebateBadge.className}"><strong>${rebateBadge.label}</strong><span>${rebateBadge.text}</span></div>` : ""}
          <span>You may be eligible for additional manufacturer or dealer rebates based on qualifications such as loyalty, conquest, military, first responder, education, healthcare, location, or lender approval. Dealer must verify.</span>
          ${
            incentiveRows.length
              ? incentiveRows
                  .map((r) => `<span>${r.name}: ${money(r.amount)}${r.detail ? " - " + r.detail : ""}</span>`)
                  .join("")
              : `<span>No manufacturer incentives available for this car.</span>`
          }
        </div>

        <div class="action-row">
          ${v.listing_url ? `<a href="${v.listing_url}" target="_blank">Dealer Listing</a>` : ""}
          ${
            stickerUrl
              ? `<a href="${stickerUrl}" target="_blank" rel="noopener">Window Sticker PDF</a>`
              : `<button disabled>Sticker PDF N/A</button>`
          }
          <button onclick="sendBidRequest('${v.vin || ""}')">Send Bid Request</button>
          <button class="${isCompared ? "active-action" : ""}" onclick="toggleCompare('${v.vin || ""}')">${isCompared ? "Remove Compare" : "Add to Compare"}</button>
          <button onclick="copyMessage('${v.vin || ""}')">Copy Message</button>
        </div>
      </div>
    </div>
  `;
}

function updateTargetPayment(vin) {
  const v = vehicles.find((x) => x.vin === vin);
  if (!v) return null;

  const quote = calculateLeaseQuote(v);
  const targetInput = document.getElementById(`target_${vin}`);
  const maxTarget = Math.floor(quote.monthlyPayment || 0);
  let target = Number(targetInput?.value || 0);
  let capped = false;

  if (targetInput) {
    targetInput.max = String(maxTarget);
    if (target > maxTarget && maxTarget > 0) {
      target = maxTarget;
      targetInput.value = String(maxTarget);
      capped = true;
    }
  }

  const result = calculateTargetDiscount(v, target);
  const box = document.getElementById(`target_result_${vin}`);

  if (box) {
    box.className = `target-result risk-${result.risk}`;
    box.innerHTML = target
      ? `
        <b>${result.label}</b>
        ${capped ? `<span>Target payment cannot be higher than the current estimated monthly payment, so it was capped at ${money(maxTarget)}/mo.</span>` : ""}
        <span>Dealer needs about ${money(result.requiredDiscount)} additional discount to reach ${money(target)}/mo.</span>
        <span>${(result.discountPercent * 100).toFixed(1)}% of MSRP. Trade equity applied: ${money(result.tradeEquity)}.</span>
      `
      : `
        <b>${result.label}</b>
        <span>Enter the buyer's target payment to estimate the dealer discount needed.</span>
      `;
  }

  return {
    target_monthly_payment: target,
    required_dealer_discount: result.requiredDiscount,
    required_discount_percent: result.discountPercent,
    target_risk: result.risk,
    target_label: result.label,
    trade_equity_applied: result.tradeEquity,
    cap_cost_after_trade_before_discount: result.currentCapCost,
  };
}

function renderComparePanel() {
  const panel = document.getElementById("comparePanel");
  if (!panel) return;

  const compared = vehicles.filter((v) => compareVins.has(v.vin));

  if (!compared.length) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }

  panel.classList.remove("hidden");
  panel.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Compare Cars</h2>
        <p>${compared.length} selected for side-by-side comparison.</p>
      </div>
      <button type="button" class="ghost-btn" onclick="clearCompare()">Clear Compare</button>
    </div>
    <div class="compare-grid">
      ${compared
        .map((v) => {
          const quote = calculateLeaseQuote(v);
          const addons = detectDealerAddons(v);
          return `
            <div class="compare-card">
              <b>${v.year || ""} ${v.brand || ""} ${v.model || ""}</b>
              <span>${v.trim || ""}</span>
              <span>${v.dealer_name || "Dealer"}</span>
              <div><small>MSRP</small><strong>${money(v.msrp)}</strong></div>
              <div><small>Website Price</small><strong>${money(v.sale_price)}</strong></div>
              <div><small>Base Cap Cost</small><strong>${money(quote.adjustedCapCost)}</strong></div>
              <div><small>Incentive</small><strong>${quote.incentive ? money(quote.incentive) : "None"}</strong></div>
              <div><small>Estimated Monthly</small><strong>${quote.monthlyPayment ? `${money(quote.monthlyPayment)}/mo` : "Verify"}</strong></div>
              <div><small>Total Payments</small><strong>${quote.totalPayments ? money(quote.totalPayments) : "Verify"}</strong></div>
              <div><small>Base Program</small><strong>${quote.term} mo / ${Number(quote.miles || 0).toLocaleString()} mi</strong></div>
              <div><small>Residual</small><strong>${quote.residualPercent ? `${quote.residualPercent}%` : "Verify"}</strong></div>
              <div><small>Residual Value</small><strong>${quote.residualValue ? money(quote.residualValue) : "Verify"}</strong></div>
              <div><small>MF</small><strong>${quote.moneyFactor ? `${quote.moneyFactor} / ${moneyFactorApr(quote.moneyFactor)}` : "Verify"}</strong></div>
              <div><small>Doc Fee</small><strong>${money(v.doc_fee || 0)}</strong></div>
              <div><small>Bank Acquisition</small><strong>${money(v.acquisition_fee || 0)}</strong></div>
              <div><small>Add-ons</small><strong>${addons ? money(addons) : "None found"}</strong></div>
              <div><small>Sticker</small><strong>${v.window_sticker_url ? "PDF available" : "N/A"}</strong></div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function toggleCompare(vin) {
  if (compareVins.has(vin)) {
    compareVins.delete(vin);
  } else {
    compareVins.add(vin);
  }

  renderVehicles();
}

function clearCompare() {
  compareVins = new Set();
  renderVehicles();
}

function recalculatePayment(vin) {
  return vin;
}

function toggleFavorite(vin) {
  if (favoriteVins.has(vin)) {
    favoriteVins.delete(vin);
  } else {
    favoriteVins.add(vin);
  }

  renderVehicles();
}

function removeVehicle(vin) {
  removedVins.add(vin);
  selectedVins.delete(vin);
  renderVehicles();
}

function updateSelectedCount() {
  const count = document.getElementById("selectedCount");
  if (count) count.textContent = selectedVins.size;
}

function toggleSelected(vin, checked) {
  if (checked) {
    selectedVins.add(vin);
  } else {
    selectedVins.delete(vin);
  }

  updateSelectedCount();
  const card = document.querySelector(`[data-vin="${vin}"]`);
  if (card) card.classList.toggle("selected-card", checked);
}

function toggleTradeIn(enabled) {
  const box = document.getElementById("tradeBox");
  if (!box) return;

  box.classList.toggle("hidden", !enabled);
  const addBtn = document.getElementById("addTradeBtn");
  const removeBtn = document.getElementById("removeTradeBtn");
  const status = document.getElementById("tradeStatus");

  if (addBtn) addBtn.classList.toggle("hidden", enabled);
  if (removeBtn) removeBtn.classList.toggle("hidden", !enabled);
  if (status) status.textContent = enabled ? "Trade added" : "Tell dealers what to expect.";

  if (!enabled) {
    ["tradeVin", "tradePlate", "tradePlateState", "tradeMileage", "tradeKbbValue", "tradePayoff", "tradePaymentsLeft", "tradeMonthlyPayment"].forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.value = "";
    });

    const condition = document.getElementById("tradeCondition");
    if (condition) condition.value = "";
    const loanType = document.getElementById("tradeLoanType");
    if (loanType) loanType.value = "";
  }
}

function openProfileModal() {
  document.getElementById("profileModal")?.classList.remove("hidden");
  document.getElementById("customerFirstName")?.focus();
}

function closeProfileModal() {
  document.getElementById("profileModal")?.classList.add("hidden");
}

function validateContactInfo() {
  const firstName = document.getElementById("customerFirstName")?.value.trim();
  const lastName = document.getElementById("customerLastName")?.value.trim();
  const phone = document.getElementById("customerPhone")?.value.trim();
  const email = document.getElementById("customerEmail")?.value.trim();
  const missing = [];

  if (!firstName) missing.push("first name");
  if (!lastName) missing.push("last name");
  if (!phone) missing.push("phone");
  if (!email) missing.push("email");

  if (missing.length) {
    alert(`Please add buyer ${missing.join(", ")} before inviting a dealer.`);
    openProfileModal();
    return false;
  }

  return true;
}

function getTradeData() {
  const tradeBox = document.getElementById("tradeBox");
  if (!tradeBox || tradeBox.classList.contains("hidden")) return null;

  return {
    trade_vin: document.getElementById("tradeVin").value.trim(),
    license_plate: document.getElementById("tradePlate").value.trim(),
    plate_state: document.getElementById("tradePlateState").value.trim(),
    mileage: Number(document.getElementById("tradeMileage").value || 0),
    kbb_expected_value: Number(document.getElementById("tradeKbbValue").value || 0),
    condition: document.getElementById("tradeCondition").value,
    loan_type: document.getElementById("tradeLoanType").value,
    payoff_amount: Number(document.getElementById("tradePayoff").value || 0),
    payments_left: Number(document.getElementById("tradePaymentsLeft").value || 0),
    monthly_payment: Number(document.getElementById("tradeMonthlyPayment").value || 0),
    kbb_low: 0,
    kbb_average: 0,
    kbb_high: 0,
    kbb_verified: false,
    kbb_source: "pending_kbb_api",
  };
}

function buildBidPayload(v) {
  const tradeIn = getTradeData();
  const firstName = document.getElementById("customerFirstName").value.trim();
  const lastName = document.getElementById("customerLastName").value.trim();
  const selectedRebates = getSelectedRebates();
  const buyerQualifications = getBuyerQualifications();
  const targetDetails = updateTargetPayment(v.vin);

  return {
    customer_name: `${firstName} ${lastName}`.trim(),
    customer_phone: document.getElementById("customerPhone").value.trim(),
    customer_email: document.getElementById("customerEmail").value.trim(),
    customer_address: document.getElementById("customerAddress")?.value.trim() || "",
    preferred_communication: document.getElementById("preferredCommunication")?.value || "text",

    zip_code: document.getElementById("zipCode").value.trim(),
    registration_state: document.getElementById("registrationState").value,
    deal_type: "lease",
    credit_score_range: document.getElementById("creditScoreRange").value,

    brand: v.brand,
    model: v.model,
    trim: v.trim,
    exterior_color: v.exterior_color,
    interior_color: v.interior_color,

    selected_features: {
      selected_rebates: selectedRebates,
      buyer_qualifications: buyerQualifications,
      customer_profile: {
        first_name: firstName,
        last_name: lastName,
        address: document.getElementById("customerAddress")?.value.trim() || "",
        preferred_communication: document.getElementById("preferredCommunication")?.value || "text",
        credit_score_range: document.getElementById("creditScoreRange").value,
        preferred_term: Number(document.getElementById("term").value || 0),
        preferred_miles: Number(document.getElementById("miles").value || 0),
      },
      vin: v.vin,
      dealer_name: v.dealer_name,
      listing_url: v.listing_url,
      favorite: favoriteVins.has(v.vin),
      trade_in: tradeIn,
      target_payment: targetDetails,
    },

    selected_vins: [v.vin],
    trade_in: tradeIn,

    term: Number(document.getElementById("term").value || 0),
    miles: Number(document.getElementById("miles").value || 0),
    status: "open",
  };
}

async function saveBidPayload(payload) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/bid_requests`, {
    method: "POST",
    headers: authHeaders({
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    }),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
}

async function sendBidRequest(vin) {
  const v = vehicles.find((x) => x.vin === vin);

  if (!v) return;
  if (!validateContactInfo()) return;

  try {
    await saveBidPayload(buildBidPayload(v));
    alert("Bid request saved. Dealer dashboard is next.");
  } catch (error) {
    alert("Could not save bid request: " + error.message);
  }
}

async function sendSelectedBidRequests() {
  if (!validateContactInfo()) return;

  const selectedVehicles = vehicles.filter((v) => selectedVins.has(v.vin));

  if (!selectedVehicles.length) {
    alert("Select at least one car to invite dealers.");
    return;
  }

  try {
    for (const v of selectedVehicles) {
      await saveBidPayload(buildBidPayload(v));
    }

    alert(`${selectedVehicles.length} dealer bid request${selectedVehicles.length === 1 ? "" : "s"} saved.`);
  } catch (error) {
    alert("Could not save selected bid requests: " + error.message);
  }
}

function copyMessage(vin) {
  const v = vehicles.find((x) => x.vin === vin);

  if (!v) return;

  const firstName = document.getElementById("customerFirstName")?.value.trim() || "";
  const lastName = document.getElementById("customerLastName")?.value.trim() || "";
  const address = document.getElementById("customerAddress")?.value.trim() || "";
  const phone = document.getElementById("customerPhone")?.value.trim() || "";
  const email = document.getElementById("customerEmail")?.value.trim() || "";
  const preferredCommunication = document.getElementById("preferredCommunication")?.value || "text";
  const selectedRebates = getSelectedRebates();
  const selectedRebateText = selectedRebates.length
    ? selectedRebates.map((r) => `${r.rebate_name} (${money(r.amount)})`).join(", ")
    : "Please verify available manufacturer incentives.";
  const qualificationText = getBuyerQualifications().length ? getBuyerQualifications().join(", ") : "None selected";

  const message = `
Hello,

My name is ${`${firstName} ${lastName}`.trim() || "[buyer name]"}.
Address: ${address || "[address]"}
Phone: ${phone || "[phone]"}
Email: ${email || "[email]"}
Preferred communication: ${preferredCommunication}

I am interested in this vehicle:

${v.year || ""} ${v.brand || ""} ${v.model || ""} ${v.trim || ""}
VIN: ${v.vin}
Exterior: ${v.exterior_color || ""}
Interior: ${v.interior_color || ""}
Dealer listing: ${v.listing_url || ""}

Lease term: ${document.getElementById("term").value} months
Miles: ${document.getElementById("miles").value} miles/year
Credit score range: ${document.getElementById("creditScoreRange").value}
Buyer incentive qualifications: ${qualificationText}
Available manufacturer incentives selected: ${selectedRebateText}

Please send your best lease offer and break out:
Selling price before incentives
Dealer discount
Available manufacturer incentives
Dealer add-ons/accessories
Doc fee
Bank acquisition fee
Residual
Money factor and APR equivalent based on my credit score, subject to lender approval
Taxes and registration
Monthly payment

Thank you.
`.trim();

  navigator.clipboard.writeText(message);
  alert("Message copied.");
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    initHelpTooltips();
    initRegistrationStates();
    await verifySupabaseConnection();
    await loadDealers();
    await loadCatalog();
    await loadAllColors();
    await loadAllLeasePrograms();
    await refreshModelFilters();
    setSearchUiState("idle");
  } catch (error) {
    setConnectionStatus("error", "Error");
    setSearchUiState("idle");
    setResultsSource(`Connection failed: ${error.message}`);
  }
});
