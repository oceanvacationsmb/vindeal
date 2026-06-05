const SUPABASE_URL = "https://lpkqtfltpeznuxallrrv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_T2MqV-yW0lnpmDc8x-IGqA_3go3dcfW";
const SCAN_INVENTORY_URL = `${SUPABASE_URL}/functions/v1/scan-inventory`;

let vehicles = [];
let catalog = [];
let dealersCatalog = [];
let colorsCatalog = [];
let rebatesCatalog = [];
let leaseProgramPreview = null;
let removedVins = new Set();
let favoriteVins = new Set();
let selectedVins = new Set();
let lastSearchBody = null;

const ZIP_COORDS = {
  "29577": { city: "Myrtle Beach", state: "SC", latitude: 33.6891, longitude: -78.8867 },
};

const STATE_TAX_RULES = {
  SC: {
    label: "SC Infrastructure Maintenance Fee",
    rate: 0.05,
    cap: 500,
    govFees: 45,
    note: "Estimate: 5% IMF capped at $500, plus estimated registration/title fees.",
  },
  NC: {
    label: "NC Highway Use Tax",
    rate: 0.03,
    cap: null,
    govFees: 90,
    note: "Estimate: 3% highway use tax plus estimated title/registration fees.",
  },
  GA: {
    label: "GA TAVT estimate",
    rate: 0.07,
    cap: null,
    govFees: 120,
    note: "Estimate: TAVT-like 7% calculation plus estimated registration fees.",
  },
  FL: {
    label: "FL sales tax estimate",
    rate: 0.06,
    cap: null,
    govFees: 400,
    note: "Estimate: 6% state tax before local surtax, plus estimated tag/title fees.",
  },
  VA: {
    label: "VA motor vehicle sales/use tax",
    rate: 0.0415,
    cap: null,
    govFees: 120,
    note: "Estimate: 4.15% motor vehicle sales/use tax plus estimated registration fees.",
  },
  NY: {
    label: "NY state sales tax estimate",
    rate: 0.04,
    cap: null,
    govFees: 175,
    note: "Estimate: 4% state tax before county/city rates, plus estimated DMV fees.",
  },
  NJ: {
    label: "NJ sales tax estimate",
    rate: 0.06625,
    cap: null,
    govFees: 175,
    note: "Estimate: 6.625% sales tax plus estimated registration/title fees.",
  },
  CA: {
    label: "CA base sales/use tax estimate",
    rate: 0.0725,
    cap: null,
    govFees: 450,
    note: "Estimate: 7.25% base rate before district taxes, plus estimated DMV fees.",
  },
  TX: {
    label: "TX motor vehicle sales tax",
    rate: 0.0625,
    cap: null,
    govFees: 150,
    note: "Estimate: 6.25% motor vehicle sales tax plus estimated title/registration fees.",
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

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
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

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function sameText(a, b) {
  return normalizeText(a) === normalizeText(b);
}

function setResultsSource(text) {
  const el = document.getElementById("resultsSource");
  if (el) el.textContent = text || "";
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
    govFees: rule.govFees,
    label: rule.label,
    note: rule.note,
    rate: rule.rate,
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

function getDealerDistance(dealer) {
  return distanceMiles(selectedZipCoords(), dealer);
}

function getDealersInRadius(body) {
  const radius = Number(body?.radius || document.getElementById("radius")?.value || 0);
  const brand = body?.brand || document.getElementById("brand")?.value || "";

  return dealersCatalog
    .filter((dealer) => dealer.active !== false)
    .filter((dealer) => sameText(dealer.brand, brand))
    .map((dealer) => ({ ...dealer, distance_miles: getDealerDistance(dealer) }))
    .filter((dealer) => !dealer.distance_miles || dealer.distance_miles <= radius)
    .sort((a, b) => number(a.distance_miles) - number(b.distance_miles));
}

function normalizeStickerUrl(v) {
  if (v.window_sticker_url) return v.window_sticker_url;

  const raw = v.raw_data || {};
  const clickEvent = raw.card_json?.VehicleCard?.WindowStickerModel?.ClickEvent || "";
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

  return "";
}

function calculateLeaseQuote(v) {
  const state = document.getElementById("registrationState")?.value || "SC";
  const msrp = number(v.msrp);
  const rebate = number(v.manufacturer_rebate);
  const projectedDealerDiscount = number(v.projected_dealer_discount);
  const dealerFees = number(v.doc_fee) + number(v.acquisition_fee) + number(v.dealer_addons_amount || v.junk_fee);
  const preTaxPrice = Math.max(0, msrp - projectedDealerDiscount - rebate + dealerFees);
  const taxInfo = calculateTax(preTaxPrice, state);
  const residualPercent = number(v.residual_percent);
  const residualValue = msrp * (residualPercent / 100);
  const term = number(v.term || document.getElementById("term")?.value || 36);
  const moneyFactor = number(v.money_factor);
  const adjustedCapCost = preTaxPrice + taxInfo.tax + taxInfo.govFees;
  const depreciation = term ? Math.max(0, adjustedCapCost - residualValue) / term : 0;
  const financeCharge = (adjustedCapCost + residualValue) * moneyFactor;
  const monthlyPayment = depreciation + financeCharge;

  return {
    msrp,
    rebate,
    projectedDealerDiscount,
    dealerFees,
    govFees: taxInfo.govFees,
    tax: taxInfo.tax,
    taxRule: taxInfo.label,
    taxNote: taxInfo.note,
    taxRate: taxInfo.rate,
    preTaxPrice,
    projectedPrice: adjustedCapCost,
    residualPercent,
    residualValue,
    monthlyPayment,
    dueAtSigning: monthlyPayment,
    term,
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
    dealer_addons_amount: v.dealer_addons_amount || raw.addon_total || 0,
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

  return (
    sameText(v.brand, body.brand) &&
    sameText(v.model, body.model) &&
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

  modelSelect.innerHTML = "";

  unique(catalog.filter((x) => x.brand === brand).map((x) => x.model)).forEach((model) => {
    modelSelect.innerHTML += `<option value="${model}">${model}</option>`;
  });

  updateTrimOptions();
}

function updateTrimOptions() {
  const brand = document.getElementById("brand").value;
  const model = document.getElementById("model").value;
  const trimSelect = document.getElementById("trim");

  trimSelect.innerHTML = "";

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
      .filter((x) => x.brand === brand && x.model === model)
      .map((x) => x.year)
  )
    .sort((a, b) => b - a)
    .forEach((year) => {
      yearSelect.innerHTML += `<option value="${year}">${year}</option>`;
    });
}

async function refreshModelFilters() {
  loadColorOptions();
  await loadProgramsForSelectedCar();
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

function setSelectOptions(selectId, values) {
  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = [`<option value="Any">Any</option>`]
    .concat(unique(values.filter(Boolean)).sort().map((value) => `<option value="${value}">${value}</option>`))
    .join("");
}

function buildResultFilters() {
  const panel = document.getElementById("resultFilters");
  const offerPanel = document.getElementById("offerPanel");
  if (!panel) return;

  if (!vehicles.length) {
    panel.classList.add("hidden");
    if (offerPanel) offerPanel.classList.add("hidden");
    return;
  }

  setSelectOptions("dealerFilter", vehicles.map((v) => v.dealer_name || "Dealer"));
  setSelectOptions("trimFilter", vehicles.map((v) => v.trim));
  setSelectOptions("exteriorFilter", vehicles.map((v) => v.exterior_color));
  setSelectOptions("interiorFilter", vehicles.map((v) => v.interior_color));
  panel.classList.remove("hidden");
  if (offerPanel) offerPanel.classList.remove("hidden");
}

function clearResultFilters() {
  ["dealerFilter", "trimFilter", "exteriorFilter", "interiorFilter"].forEach((id) => {
    const select = document.getElementById(id);
    if (select) select.value = "Any";
  });
  renderVehicles();
}

async function loadProgramsForSelectedCar() {
  const brand = document.getElementById("brand")?.value || "";
  const model = document.getElementById("model")?.value || "";
  const trim = document.getElementById("trim")?.value || "Any";
  const year = Number(document.getElementById("year")?.value || 2026);
  const term = Number(document.getElementById("term")?.value || 36);
  const miles = Number(document.getElementById("miles")?.value || 10000);

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

  if (!rebatesCatalog.length) {
    box.innerHTML = `<span class="muted">No manufacturer rebates available for this car.</span>`;
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
            <em>${money(r.amount)} · ${mustQualify} · ${verified} · Expires ${r.expires_at || "Unknown"}</em>
          </span>
        </label>
      `;
    })
    .join("");
}

function renderProgramPreview() {
  const box = document.getElementById("programPreview");
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

function applyFilters() {
  renderVehicles();
}

function matchesLocalFilters(v) {
  const dealer = document.getElementById("dealerFilter")?.value || "Any";
  const trim = document.getElementById("trimFilter")?.value || "Any";
  const exterior = document.getElementById("exteriorFilter")?.value || "Any";
  const interior = document.getElementById("interiorFilter")?.value || "Any";

  const dealerOk = dealer === "Any" || sameText(v.dealer_name || "Dealer", dealer);
  const trimOk = trim === "Any" || sameText(v.trim, trim);
  const extOk = exterior === "Any" || sameText(v.exterior_color, exterior);
  const intOk = interior === "Any" || sameText(v.interior_color, interior);

  return dealerOk && trimOk && extOk && intOk;
}

function renderDealerCoverage(body) {
  const box = document.getElementById("dealerCoverage");
  if (!box) return;

  const dealers = getDealersInRadius(body);
  const dealersWithCars = new Set(vehicles.map((v) => normalizeText(v.dealer_name)));

  if (!dealers.length) {
    box.classList.add("hidden");
    return;
  }

  box.classList.remove("hidden");
  box.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Dealers In Radius</h2>
        <p>${dealers.length} active ${body.brand} dealers found within ${body.radius} miles. Cars shown below depend on scanned or cached inventory.</p>
      </div>
    </div>
    <div class="dealer-chip-grid">
      ${dealers
        .map((dealer) => {
          const hasCars = dealersWithCars.has(normalizeText(dealer.name));
          return `
            <div class="dealer-chip ${hasCars ? "has-cars" : ""}">
              <b>${dealer.name}</b>
              <span>${dealer.city || ""}${dealer.state ? ", " + dealer.state : ""}${dealer.distance_miles ? " - " + dealer.distance_miles + " miles" : ""}</span>
              <em>${hasCars ? "Inventory matched" : "No matching cars loaded yet"}</em>
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

  document.getElementById("vehicleList").innerHTML = "";
  document.getElementById("dealerCount").textContent = "0";
  document.getElementById("vehicleCount").textContent = "0";
  document.getElementById("programStatus").textContent = "Checking";
  document.getElementById("resultFilters")?.classList.add("hidden");
  document.getElementById("offerPanel")?.classList.add("hidden");
  document.getElementById("dealerCoverage")?.classList.add("hidden");
  setResultsSource("");

  const body = {
    zipCode: document.getElementById("zipCode").value.trim(),
    radius: Number(document.getElementById("radius").value),
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
  };
  lastSearchBody = body;

  try {
    const response = await fetch(SCAN_INVENTORY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Backend returned non-JSON. Status ${response.status}. ${text}`);
    }

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Backend error");
    }

    vehicles = data.vehicles || [];

    if (!vehicles.length) {
      const cachedVehicles = await loadCachedVehicles(body);

      if (cachedVehicles.length) {
        vehicles = cachedVehicles;
        data.count = cachedVehicles.length;
        data.dealer_count = getDealersInRadius(body).length;
        setResultsSource("Showing cached Supabase inventory because the live dealer scan returned no cars.");
      }
    } else {
      setResultsSource("Showing fresh live scan results.");
    }

    removedVins = new Set();
    selectedVins = new Set();
    updateSelectedCount();
    buildResultFilters();
    renderDealerCoverage(body);

    document.getElementById("dealerCount").textContent = getDealersInRadius(body).length || data.dealer_count || 0;
    document.getElementById("vehicleCount").textContent = data.count || 0;

    renderProgramStatus(data);
    renderVehicles();
  } catch (error) {
    alert("Search failed: " + error.message);
    document.getElementById("programStatus").textContent = "Error";
  } finally {
    btn.disabled = false;
    btn.textContent = "Search Lease Deals";
  }
}

function renderProgramStatus(data) {
  const box = document.getElementById("programBox");
  const status = document.getElementById("programStatus");
  const program = data.lease_program;

  box.classList.remove("hidden");

  if (!program || !program.verified) {
    status.textContent = "Not verified";
    box.innerHTML = `
      <div>
        <b>Lease Program</b>
        <span>Residual ${program?.residual_percent ? program.residual_percent + "%" : "not available"}</span>
        <span>Tier 1 MF ${program?.money_factor || "not available"}</span>
        <span>Expires ${program?.expires_at || "Unknown"}</span>
        <span>Not verified from manufacturer/finance source yet.</span>
      </div>
    `;
    return;
  }

  status.textContent = "Verified";

  box.innerHTML = `
    <div>
      <b>Lease Program Verified</b>
      <span>Residual ${program.residual_percent}%</span>
      <span>Tier 1 MF ${program.money_factor}</span>
      <span>Expires ${program.expires_at || "Unknown"}</span>
    </div>
  `;
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
  const visibleVehicles = vehicles.filter((v) => !removedVins.has(v.vin)).filter(matchesLocalFilters);
  const visibleVins = new Set(vehicles.filter((v) => !removedVins.has(v.vin)).map((v) => v.vin));
  selectedVins = new Set([...selectedVins].filter((vin) => visibleVins.has(vin)));
  updateSelectedCount();

  if (!visibleVehicles.length) {
    list.innerHTML = `<div class="empty-box">No vehicles found.</div>`;
    return;
  }

  const grouped = groupByDealer(visibleVehicles);

  list.innerHTML = Object.entries(grouped)
    .map(([dealerName, dealerVehicles]) => {
      const first = dealerVehicles[0];

      return `
        <div class="dealer-box">
          <div class="dealer-box-head">
            <div>
              <h3>${dealerName}</h3>
              <p>${first.dealer_city || ""}${first.dealer_state ? ", " + first.dealer_state : ""} ${first.dealer_distance_miles ? " · " + first.dealer_distance_miles + " miles away" : ""}</p>
            </div>
            <strong>${dealerVehicles.length} cars</strong>
          </div>

          <div class="vehicle-grid">
            ${dealerVehicles.map((v) => renderVehicleCard(v)).join("")}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderVehicleCard(v) {
  const raw = v.raw_data || {};
  const quote = calculateLeaseQuote(v);
  const basePayment = quote.monthlyPayment || Number(v.base_monthly_payment || v.estimated_payment || 0);
  const dealerAddons = Number(v.dealer_addons_amount || v.junk_fee || raw.addon_total || 0);
  const docFeeHigh = Number(v.doc_fee || 0) >= 700;
  const isFavorite = favoriteVins.has(v.vin);
  const isSelected = selectedVins.has(v.vin);
  const showInvoice = v.invoice_verified && Number(v.invoice_price || 0) > 0;
  const downInputId = `down_${v.vin}`;
  const stickerUrl = normalizeStickerUrl(v);

  return `
    <div class="vehicle-card ${isSelected ? "selected-card" : ""}" draggable="true" data-vin="${v.vin}">
      <div class="image-box">
        ${
          v.image_url
            ? `<img src="${v.image_url}" alt="vehicle" />`
            : `<div class="no-image">No Image</div>`
        }

        <button class="heart-btn ${isFavorite ? "active" : ""}" onclick="toggleFavorite('${v.vin}')">♥</button>
        <button class="remove-btn" onclick="removeVehicle('${v.vin}')">×</button>
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

        <div class="color-row">
          <span>Ext: ${v.exterior_color || "Unknown"}</span>
          <span>Int: ${v.interior_color || "Unknown"}</span>
        </div>

        <div class="price-box">
          <div><span>MSRP</span><b>${money(v.msrp)}</b></div>
          <div><span>Dealer Advertised Price</span><b>${money(v.sale_price)}</b></div>
          <div><span>Projected Dealer Discount</span><b>${money(quote.projectedDealerDiscount)}</b></div>
          <div><span>Rebates Applied</span><b>${money(quote.rebate)}</b></div>
          ${showInvoice ? `<div><span>Invoice</span><b>${money(v.invoice_price)}</b></div>` : ""}
          ${showInvoice ? `<div><span>Over Invoice</span><b>${money(v.profit_over_invoice)}</b></div>` : ""}
          <div><span>Projected Price</span><b>${money(quote.projectedPrice)}</b></div>
          <div><span>Sales Tax Est.</span><b>${money(quote.tax)}</b></div>
          <div class="${docFeeHigh ? "fee-bad" : ""}"><span>Doc Fee</span><b>${money(v.doc_fee || 0)}</b></div>
          <div><span>Gov Fees Est.</span><b>${money(quote.govFees)}</b></div>
          <div><span>Dealer / Acq Fees</span><b>${money(quote.dealerFees)}</b></div>
          <div><span>Residual</span><b>${quote.residualPercent ? `${quote.residualPercent}%` : "Verify"}</b></div>
          <div><span>Residual Value</span><b>${quote.residualValue ? money(quote.residualValue) : "Verify"}</b></div>
          <div><span>Tier 1 MF</span><b>${v.money_factor ? v.money_factor : "Verify"}</b></div>
          <div><span>Est. Payment</span><b id="pay_${v.vin}">${basePayment ? money(basePayment) + "/mo" : "Verify"}</b></div>
          <div><span>Due at Signing</span><b id="due_${v.vin}">${money(basePayment || 0)}</b></div>
        </div>

        <div class="down-box">
          <label>Adjust Down Payment</label>
          <div class="down-slider-row">
            <input id="${downInputId}" type="range" value="0" min="0" max="10000" step="250" oninput="recalculatePayment('${v.vin}')" />
            <b id="down_value_${v.vin}">$0</b>
          </div>
          <small>$0 down shows payment with first payment due at signing.</small>
        </div>

        <div class="formula-box">
          <b>Projected Lease Basis</b>
          <span>MSRP - projected dealer discount - rebates + dealer/acquisition fees + estimated government fees + estimated sales tax. Dealer advertised price is shown for reference, not used as the negotiation baseline.</span>
          <span>Filing, electronic registration, and dealer-specific state fees may be added or corrected by the dealer bid.</span>
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
          <b>Available Manufacturer Offers</b>
          ${
            (v.available_rebates?.length || raw.available_rebates?.length)
              ? (v.available_rebates || raw.available_rebates)
                  .map((r) => `<span>${r.rebate_name}: ${money(r.amount)}${r.customer_must_qualify ? " · must qualify" : ""}${r.verified ? " · verified" : " · not verified"}</span>`)
                  .join("")
              : `<span>No manufacturer rebates available for this car.</span>`
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
          <button onclick="copyMessage('${v.vin || ""}')">Copy Message</button>
        </div>
      </div>
    </div>
  `;
}

function recalculatePayment(vin) {
  const v = vehicles.find((x) => x.vin === vin);
  if (!v) return;

  const down = Number(document.getElementById(`down_${vin}`)?.value || 0);
  const quote = calculateLeaseQuote(v);
  const term = Number(quote.term || v.term || 36);
  const base = Number(quote.monthlyPayment || v.base_monthly_payment || v.estimated_payment || 0);

  if (!base || !term) return;

  const newPayment = Math.max(0, base - down / term);
  const due = newPayment + down;

  const downValue = document.getElementById(`down_value_${vin}`);
  if (downValue) downValue.textContent = money(down);

  document.getElementById(`pay_${vin}`).textContent = money(newPayment) + "/mo";
  document.getElementById(`due_${vin}`).textContent = money(due);
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
  if (status) status.textContent = enabled ? "Trade added" : "No trade added";

  if (!enabled) {
    ["tradeVin", "tradePlate", "tradePlateState", "tradeMileage", "tradePayoff", "tradePaymentsLeft", "tradeMonthlyPayment"].forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.value = "";
    });

    const condition = document.getElementById("tradeCondition");
    if (condition) condition.value = "";
  }
}

function validateContactInfo() {
  const name = document.getElementById("customerName")?.value.trim();
  const phone = document.getElementById("customerPhone")?.value.trim();
  const email = document.getElementById("customerEmail")?.value.trim();
  const missing = [];

  if (!name) missing.push("name");
  if (!phone) missing.push("phone");
  if (!email) missing.push("email");

  if (missing.length) {
    alert(`Please add buyer ${missing.join(", ")} before inviting a dealer.`);
    document.getElementById("customerName")?.focus();
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
    condition: document.getElementById("tradeCondition").value,
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

  return {
    customer_name: document.getElementById("customerName").value.trim(),
    customer_phone: document.getElementById("customerPhone").value.trim(),
    customer_email: document.getElementById("customerEmail").value.trim(),

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
      selected_rebates: getSelectedRebates(),
      vin: v.vin,
      dealer_name: v.dealer_name,
      listing_url: v.listing_url,
      favorite: favoriteVins.has(v.vin),
      trade_in: tradeIn,
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

  const message = `
Hello,

I am interested in this vehicle:

${v.year || ""} ${v.brand || ""} ${v.model || ""} ${v.trim || ""}
VIN: ${v.vin}
Exterior: ${v.exterior_color || ""}
Interior: ${v.interior_color || ""}
Dealer listing: ${v.listing_url || ""}

Lease term: ${document.getElementById("term").value} months
Miles: ${document.getElementById("miles").value} miles/year
Credit score range: ${document.getElementById("creditScoreRange").value}

Please send your best lease offer and break out:
Selling price before rebates
Dealer discount
All rebates
Dealer add-ons/accessories
Doc fee
Acquisition fee
Residual
Tier 1 money factor
Taxes and registration
Total due at signing
Monthly payment

Thank you.
`.trim();

  navigator.clipboard.writeText(message);
  alert("Message copied.");
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await verifySupabaseConnection();
    await loadDealers();
    await loadCatalog();
    await loadAllColors();
    await refreshModelFilters();
    renderVehicles();
  } catch (error) {
    setConnectionStatus("error", "Error");
    document.getElementById("vehicleList").innerHTML = `<div class="empty-box">Connection failed: ${error.message}</div>`;
  }
});
