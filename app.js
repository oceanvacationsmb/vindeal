const SUPABASE_URL = "https://lpkqtfltpeznuxallrrv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_T2MqV-yW0lnpmDc8x-IGqA_3go3dcfW";
const SCAN_INVENTORY_URL = `${SUPABASE_URL}/functions/v1/scan-inventory`;

let vehicles = [];
let catalog = [];
let colorsCatalog = [];
let rebatesCatalog = [];
let leaseProgramPreview = null;
let removedVins = new Set();
let favoriteVins = new Set();

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

function normalizeCachedVehicle(v) {
  const raw = v.raw_data || {};

  return {
    ...v,
    dealer_name: v.dealer_name || raw.dealer_name,
    dealer_city: v.dealer_city || raw.dealer_city,
    dealer_state: v.dealer_state || raw.dealer_state,
    dealer_distance_miles: Number(v.dealer_distance_miles || raw.dealer_distance_miles || 0),
    dealer_addons_amount: v.dealer_addons_amount || raw.addon_total || 0,
    listing_url: v.listing_url || raw.card_json?.VehicleCard?.VehicleDetailUrl || "",
    window_sticker_url: v.window_sticker_url || raw.window_sticker_url || "",
    image_url:
      v.image_url ||
      raw.card_json?.VehicleCard?.VehicleImageModel?.VehiclePhotoSrc ||
      "",
  };
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
    box.innerHTML = `<span class="muted">No manufacturer rebates loaded yet.</span>`;
    return;
  }

  box.innerHTML = rebatesCatalog
    .map((r) => {
      const mustQualify = r.customer_must_qualify ? "Must qualify" : "General";
      const checked = r.customer_must_qualify ? "" : "checked";
      const verified = r.verified ? "Verified" : "Not verified";

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

  const verified = leaseProgramPreview.verified ? "Verified" : "Not verified";

  box.innerHTML = `
    <b>Lease Program:</b>
    <span>Residual ${leaseProgramPreview.residual_percent}%</span>
    <span>Tier 1 MF ${leaseProgramPreview.money_factor}</span>
    <span>${verified}</span>
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
  const exterior = getSelectedExteriorColors();
  const interior = getSelectedInteriorColors();

  const extOk =
    !exterior.length ||
    exterior.includes("Any") ||
    exterior.some((c) => String(v.exterior_color || "").toLowerCase().includes(c.toLowerCase()));

  const intOk =
    !interior.length ||
    interior.includes("Any") ||
    interior.some((c) => String(v.interior_color || "").toLowerCase().includes(c.toLowerCase()));

  return extOk && intOk;
}

async function scanBackendInventory() {
  const btn = document.getElementById("scanBtn");

  btn.disabled = true;
  btn.textContent = "Searching...";

  document.getElementById("vehicleList").innerHTML = "";
  document.getElementById("dealerCount").textContent = "0";
  document.getElementById("vehicleCount").textContent = "0";
  document.getElementById("programStatus").textContent = "Checking";
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
        data.dealer_count = unique(cachedVehicles.map((v) => v.dealer_name || v.dealer_id)).length;
        setResultsSource("Showing cached Supabase inventory because the live dealer scan returned no cars.");
      }
    } else {
      setResultsSource("Showing fresh live scan results.");
    }

    removedVins = new Set();

    document.getElementById("dealerCount").textContent = data.dealer_count || 0;
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
        <span>Residual / Tier 1 MF not verified from source yet.</span>
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
  const basePayment = Number(v.base_monthly_payment || v.estimated_payment || 0);
  const dealerAddons = Number(v.dealer_addons_amount || v.junk_fee || raw.addon_total || 0);
  const docFeeHigh = Number(v.doc_fee || 0) >= 700;
  const isFavorite = favoriteVins.has(v.vin);
  const showInvoice = v.invoice_verified && Number(v.invoice_price || 0) > 0;
  const downInputId = `down_${v.vin}`;

  return `
    <div class="vehicle-card" draggable="true" data-vin="${v.vin}">
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
          </div>
        </div>

        <div class="color-row">
          <span>Ext: ${v.exterior_color || "Unknown"}</span>
          <span>Int: ${v.interior_color || "Unknown"}</span>
        </div>

        <div class="price-box">
          <div><span>MSRP</span><b>${money(v.msrp)}</b></div>
          <div><span>Dealer Price</span><b>${money(v.sale_price)}</b></div>
          <div><span>Dealer Discount</span><b>${money(v.dealer_discount || 0)}</b></div>
          <div><span>Rebates Applied</span><b>${money(v.manufacturer_rebate || 0)}</b></div>
          ${showInvoice ? `<div><span>Invoice</span><b>${money(v.invoice_price)}</b></div>` : ""}
          ${showInvoice ? `<div><span>Over Invoice</span><b>${money(v.profit_over_invoice)}</b></div>` : ""}
          <div><span>Sales Tax Est.</span><b>${money(v.estimated_tax || 0)}</b></div>
          <div><span>Tax Rule</span><b>${v.tax_rule || "Estimate"}</b></div>
          <div class="${docFeeHigh ? "fee-bad" : ""}"><span>Doc Fee</span><b>${money(v.doc_fee || 0)}</b></div>
          <div><span>Acquisition Fee</span><b>${money(v.acquisition_fee || 0)}</b></div>
          <div><span>Residual</span><b>${v.residual_percent ? `${v.residual_percent}%` : "Verify"}</b></div>
          <div><span>Tier 1 MF</span><b>${v.money_factor ? v.money_factor : "Verify"}</b></div>
          <div><span>Est. Payment</span><b id="pay_${v.vin}">${basePayment ? money(basePayment) + "/mo" : "Verify"}</b></div>
          <div><span>Due at Signing</span><b id="due_${v.vin}">${money(v.due_at_signing || basePayment || 0)}</b></div>
        </div>

        <div class="down-box">
          <label>Adjust Down Payment</label>
          <div>
            <input id="${downInputId}" type="number" value="0" min="0" oninput="recalculatePayment('${v.vin}')" />
            <button onclick="recalculatePayment('${v.vin}')">Recalculate</button>
          </div>
          <small>$0 down shows payment with first payment due at signing.</small>
        </div>

        <div class="formula-box">
          <b>Lease Calculation Basis</b>
          <span>${v.lease_calc?.explanation || "MSRP, dealer price, rebates, residual, MF, tax, acquisition fee, doc fee, and add-ons are used when available."}</span>
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
            raw.available_rebates?.length
              ? raw.available_rebates
                  .map((r) => `<span>${r.rebate_name}: ${money(r.amount)}${r.customer_must_qualify ? " · must qualify" : ""}${r.verified ? " · verified" : " · not verified"}</span>`)
                  .join("")
              : `<span>No rebate programs loaded.</span>`
          }
        </div>

        <div class="action-row">
          ${v.listing_url ? `<a href="${v.listing_url}" target="_blank">Dealer Listing</a>` : ""}
          ${
            v.window_sticker_url
              ? `<a href="${v.window_sticker_url}" target="_blank">Window Sticker PDF</a>`
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
  const term = Number(v.term || 36);
  const base = Number(v.base_monthly_payment || v.estimated_payment || 0);

  if (!base || !term) return;

  const newPayment = Math.max(0, base - down / term);
  const due = newPayment + down;

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
  renderVehicles();
}

function getTradeData() {
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

async function sendBidRequest(vin) {
  const v = vehicles.find((x) => x.vin === vin);

  if (!v) return;

  const tradeIn = getTradeData();

  const payload = {
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

  try {
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

    alert("Bid request saved. Dealer dashboard is next.");
  } catch (error) {
    alert("Could not save bid request: " + error.message);
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
    await loadCatalog();
    await loadAllColors();
    await refreshModelFilters();
    renderVehicles();
  } catch (error) {
    setConnectionStatus("error", "Error");
    document.getElementById("vehicleList").innerHTML = `<div class="empty-box">Connection failed: ${error.message}</div>`;
  }
});
