const SUPABASE_URL = "https://lpkqtfltpeznuxallrrv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_T2MqV-yW0lnpmDc8x-IGqA_3go3dcfW";
const SCAN_INVENTORY_URL = `${SUPABASE_URL}/functions/v1/scan-inventory`;

let vehicles = [];
let catalog = [];
let featuresCatalog = [];
let colorsCatalog = [];
let rebatesCatalog = [];
let financeProgram = null;
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

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
  });

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function loadCatalog() {
  catalog = await supabaseGet(
    "vehicle_catalog?select=brand,model,trim,year&active=eq.true&order=brand.asc,model.asc,trim.asc"
  );

  updateBrandOptions();
}

async function loadAllFeatures() {
  featuresCatalog = await supabaseGet(
    "vehicle_features_catalog?select=brand,model,feature_name&active=eq.true&order=feature_name.asc"
  );
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
  loadFeatureOptions();
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
    input.addEventListener("change", () => handleAnyCheckbox(boxId, name));
  });
}

function handleAnyCheckbox(boxId, name) {
  const box = document.getElementById(boxId);
  const inputs = [...box.querySelectorAll(`input[name="${name}"]`)];
  const any = inputs.find((x) => x.value === "Any");

  if (!any) return;

  if (event?.target?.value === "Any" && any.checked) {
    inputs.forEach((x) => {
      if (x.value !== "Any") x.checked = false;
    });
  } else if (event?.target?.value !== "Any") {
    any.checked = false;
  }

  if (!inputs.some((x) => x.checked)) {
    any.checked = true;
  }
}

function loadFeatureOptions() {
  const brand = document.getElementById("brand")?.value || "";
  const model = document.getElementById("model")?.value || "";

  const features = unique(
    featuresCatalog
      .filter((x) => x.brand === brand && x.model === model)
      .map((x) => x.feature_name)
  );

  buildCheckPills("featureOptions", features, "feature", false);
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
  const dealType = document.getElementById("dealType")?.value || "lease";
  const term = Number(document.getElementById("term")?.value || 36);
  const miles = Number(document.getElementById("miles")?.value || 10000);

  rebatesCatalog = await supabaseGet(
    `manufacturer_rebate_programs?select=*&active=eq.true&brand=eq.${encodeURIComponent(brand)}&model=eq.${encodeURIComponent(model)}&year=eq.${year}&order=amount.desc`
  );

  const financePrograms = await supabaseGet(
    `manufacturer_finance_programs?select=*&active=eq.true&brand=eq.${encodeURIComponent(brand)}&model=eq.${encodeURIComponent(model)}&year=eq.${year}&order=apr.asc`
  );

  financeProgram = financePrograms[0] || null;

  const leasePrograms = await supabaseGet(
    `lease_programs?select=*&active=eq.true&brand=eq.${encodeURIComponent(brand)}&model=eq.${encodeURIComponent(model)}&year=eq.${year}&term=eq.${term}&miles=eq.${miles}&order=created_at.desc`
  );

  leaseProgramPreview =
    leasePrograms.find((x) => x.trim === trim) ||
    leasePrograms.find((x) => x.trim === "Any") ||
    null;

  renderRebateOptions();
  renderProgramPreview(dealType);
}

function renderRebateOptions() {
  const box = document.getElementById("rebateOptions");

  if (!rebatesCatalog.length) {
    box.innerHTML = `<span class="muted">No manufacturer rebates loaded yet.</span>`;
    return;
  }

  box.innerHTML = rebatesCatalog
    .map((r) => {
      const mustQualify = r.customer_must_qualify ? "Qualify only" : "General";
      const checked = r.customer_must_qualify ? "" : "checked";

      return `
        <label class="rebate-pill">
          <input type="checkbox" value="${r.id}" ${checked} />
          <span>
            <b>${r.rebate_name}</b>
            <em>${money(r.amount)} · ${mustQualify} · Expires ${r.expires_at || "Unknown"}</em>
          </span>
        </label>
      `;
    })
    .join("");
}

function renderProgramPreview(dealType) {
  const box = document.getElementById("programPreview");
  box.classList.remove("hidden");

  if (dealType === "purchase") {
    if (!financeProgram) {
      box.innerHTML = `<b>Purchase Program:</b> No manufacturer finance program loaded.`;
      return;
    }

    box.innerHTML = `
      <b>Purchase Program:</b>
      <span>${financeProgram.apr}% APR up to ${financeProgram.term} months</span>
      <span>${financeProgram.program_name || "For well-qualified buyers"}</span>
      <span>Expires ${financeProgram.expires_at || "Unknown"}</span>
    `;
    return;
  }

  if (!leaseProgramPreview) {
    box.innerHTML = `<b>Lease Program:</b> Residual and Tier 1 MF not loaded yet.`;
    return;
  }

  box.innerHTML = `
    <b>Lease Program:</b>
    <span>Residual ${leaseProgramPreview.residual_percent}%</span>
    <span>Tier 1 MF ${leaseProgramPreview.money_factor}</span>
    <span>Expires ${leaseProgramPreview.expires_at || "Unknown"}</span>
  `;
}

function getCheckedValues(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((x) => x.value);
}

function getSelectedFeatures() {
  return getCheckedValues("feature");
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

function toggleDealType() {
  const dealType = document.getElementById("dealType").value;
  const leaseFields = document.querySelectorAll(".lease-only");

  leaseFields.forEach((field) => {
    field.style.display = dealType === "lease" ? "block" : "none";
  });

  renderProgramPreview(dealType);
}

async function scanBackendInventory() {
  const btn = document.getElementById("scanBtn");

  btn.disabled = true;
  btn.textContent = "Searching...";

  document.getElementById("vehicleList").innerHTML = "";
  document.getElementById("dealerCount").textContent = "0";
  document.getElementById("vehicleCount").textContent = "0";
  document.getElementById("programStatus").textContent = "Checking";

  const body = {
    zipCode: document.getElementById("zipCode").value.trim(),
    radius: Number(document.getElementById("radius").value),
    registrationState: document.getElementById("registrationState").value,

    dealType: document.getElementById("dealType").value,
    creditScoreRange: document.getElementById("creditScoreRange").value,

    brand: document.getElementById("brand").value,
    model: document.getElementById("model").value,
    trim: document.getElementById("trim").value,
    year: Number(document.getElementById("year").value),

    term: Number(document.getElementById("term").value || 0),
    miles: Number(document.getElementById("miles").value || 0),

    exteriorColors: getSelectedExteriorColors(),
    interiorColors: getSelectedInteriorColors(),

    features: getSelectedFeatures(),
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
    btn.textContent = "Search Deals";
  }
}

function renderProgramStatus(data) {
  const box = document.getElementById("programBox");
  const status = document.getElementById("programStatus");
  const dealType = document.getElementById("dealType").value;

  box.classList.remove("hidden");

  if (dealType === "purchase") {
    const finance = data.finance_program;

    if (!finance || !finance.verified) {
      status.textContent = "APR not loaded";
      box.innerHTML = `<div><b>Purchase Program:</b><span>No manufacturer APR program loaded.</span></div>`;
      return;
    }

    status.textContent = "APR loaded";
    box.innerHTML = `
      <div>
        <b>Purchase Program</b>
        <span>${finance.apr}% APR up to ${finance.term} months</span>
        <span>${finance.program_name || "For well-qualified buyers"}</span>
        <span>Expires ${finance.expires_at || "Unknown"}</span>
      </div>
    `;
    return;
  }

  const program = data.lease_program;

  if (!program || !program.verified) {
    status.textContent = "Not verified";
    box.innerHTML = `<div><b>Lease Program:</b><span>Residual and Tier 1 MF not loaded.</span></div>`;
    return;
  }

  status.textContent = "Verified";
  box.innerHTML = `
    <div>
      <b>Lease Program</b>
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
    .forEach((v) => {
      const dealerName = v.dealer_name || "Dealer";
      if (!grouped[dealerName]) grouped[dealerName] = [];
      grouped[dealerName].push(v);
    });

  return grouped;
}

function renderVehicles() {
  const list = document.getElementById("vehicleList");
  const visibleVehicles = vehicles.filter((v) => !removedVins.has(v.vin));

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
  const payment = Number(v.estimated_payment || 0);
  const dealerAddons = Number(v.dealer_addons_amount || v.junk_fee || raw.addon_total || 0);
  const detectedSavings = Number(raw.detected_savings || 0);
  const dealType = v.deal_type || document.getElementById("dealType").value;
  const docFeeHigh = Number(v.doc_fee || 0) >= 700;
  const isFavorite = favoriteVins.has(v.vin);

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
          <span class="score-badge">Score ${Math.round(v.score || 0)}</span>
        </div>

        <div class="color-row">
          <span>Ext: ${v.exterior_color || "Unknown"}</span>
          <span>Int: ${v.interior_color || "Unknown"}</span>
        </div>

        <div class="price-box">
          <div><span>MSRP</span><b>${money(v.msrp)}</b></div>
          <div><span>Dealer Price</span><b>${money(v.sale_price)}</b></div>
          <div><span>Dealer Savings</span><b>${money(detectedSavings)}</b></div>
          <div><span>Rebates</span><b>${money(v.manufacturer_rebate || 0)}</b></div>
          <div><span>Invoice</span><b>${v.invoice_verified ? money(v.invoice_price) : "Not available"}</b></div>
          <div><span>Over Invoice</span><b>${v.invoice_verified ? money(v.profit_over_invoice) : "N/A"}</b></div>
          <div class="${docFeeHigh ? "fee-bad" : ""}"><span>Doc Fee</span><b>${money(v.doc_fee || 0)}</b></div>
          ${
            dealType === "lease"
              ? `
                <div><span>Residual</span><b>${v.residual_percent ? `${v.residual_percent}%` : "Verify"}</b></div>
                <div><span>Tier 1 MF</span><b>${v.money_factor ? v.money_factor : "Verify"}</b></div>
                <div><span>Est. Payment</span><b>${payment ? money(payment) + "/mo" : "Verify"}</b></div>
              `
              : `
                <div><span>Special APR</span><b>${v.purchase_apr ? `${v.purchase_apr}%` : "Verify"}</b></div>
                <div><span>APR Term</span><b>${v.purchase_apr_term ? `${v.purchase_apr_term} mo` : "Verify"}</b></div>
                <div><span>Program</span><b>${v.purchase_program_note || "For qualified buyers"}</b></div>
              `
          }
        </div>

        <div class="formula-box">
          <b>Dealer Savings Explained</b>
          <span>${v.dealer_savings_explanation || "Dealer savings = MSRP minus dealer advertised price. Rebates and add-ons shown separately when detected."}</span>
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
                  .map((r) => `<span>${r.rebate_name}: ${money(r.amount)}${r.customer_must_qualify ? " · must qualify" : ""}</span>`)
                  .join("")
              : `<span>No extra rebate programs loaded.</span>`
          }
        </div>

        <div class="action-row">
          ${v.listing_url ? `<a href="${v.listing_url}" target="_blank">Dealer Listing</a>` : ""}
          ${
            v.window_sticker_url
              ? `<a href="${v.window_sticker_url}" target="_blank">Window Sticker</a>`
              : `<button disabled>Sticker N/A</button>`
          }
          <button onclick="sendBidRequest('${v.vin || ""}')">Send Bid Request</button>
          <button onclick="copyMessage('${v.vin || ""}')">Copy Message</button>
        </div>
      </div>
    </div>
  `;
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

async function sendBidRequest(vin) {
  const v = vehicles.find((x) => x.vin === vin);

  if (!v) return;

  const payload = {
    customer_name: document.getElementById("customerName").value.trim(),
    customer_phone: document.getElementById("customerPhone").value.trim(),
    customer_email: document.getElementById("customerEmail").value.trim(),

    zip_code: document.getElementById("zipCode").value.trim(),
    registration_state: document.getElementById("registrationState").value,
    deal_type: document.getElementById("dealType").value,
    credit_score_range: document.getElementById("creditScoreRange").value,

    brand: v.brand,
    model: v.model,
    trim: v.trim,
    exterior_color: v.exterior_color,
    interior_color: v.interior_color,

    selected_features: {
      features: getSelectedFeatures(),
      selected_rebates: getSelectedRebates(),
      vin: v.vin,
      dealer_name: v.dealer_name,
      listing_url: v.listing_url,
      favorite: favoriteVins.has(v.vin),
    },

    selected_vins: [v.vin],

    term: Number(document.getElementById("term").value || 0),
    miles: Number(document.getElementById("miles").value || 0),
    status: "open",
  };

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/bid_requests`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
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

  const dealType = document.getElementById("dealType").value;

  const message = `
Hello,

I am interested in this vehicle:

${v.year || ""} ${v.brand || ""} ${v.model || ""} ${v.trim || ""}
VIN: ${v.vin}
Exterior: ${v.exterior_color || ""}
Interior: ${v.interior_color || ""}
Dealer listing: ${v.listing_url || ""}

Deal type: ${dealType}
Credit score range: ${document.getElementById("creditScoreRange").value}

${dealType === "lease" ? `Lease term: ${document.getElementById("term").value} months
Miles: ${document.getElementById("miles").value} miles/year` : "Please include manufacturer special APR options."}

Please send your best offer and break out:
Selling price before rebates
Dealer discount
All rebates
Dealer add-ons/accessories
Doc fee
${dealType === "lease" ? "Residual\nTier 1 money factor" : "Manufacturer APR\nAPR term"}
Taxes and registration
Total due at signing
Monthly payment

Thank you.
`.trim();

  navigator.clipboard.writeText(message);
  alert("Message copied.");
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadCatalog();
  await loadAllFeatures();
  await loadAllColors();
  toggleDealType();
  refreshModelFilters();
  renderVehicles();
});
