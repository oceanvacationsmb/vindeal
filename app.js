const SUPABASE_URL = "https://lpkqtfltpeznuxallrrv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_T2MqV-yW0lnpmDc8x-IGqA_3go3dcfW";
const SCAN_INVENTORY_URL = `${SUPABASE_URL}/functions/v1/scan-inventory`;

let vehicles = [];
let catalog = [];

function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

async function loadCatalog() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/vehicle_catalog?select=brand,model,trim,year&active=eq.true&order=brand.asc,model.asc,trim.asc`,
    {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
      },
    }
  );

  catalog = await res.json();

  if (!Array.isArray(catalog)) catalog = [];

  updateBrandOptions();
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
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
  updateYearOptions();
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
    brand: document.getElementById("brand").value,
    model: document.getElementById("model").value,
    trim: document.getElementById("trim").value,
    term: Number(document.getElementById("term").value),
    miles: Number(document.getElementById("miles").value),
    year: Number(document.getElementById("year").value),
    exteriorColor: document.getElementById("exteriorColor").value,
    interiorColor: document.getElementById("interiorColor").value,
    features: {
      notes: document.getElementById("features").value.trim(),
    },
  };

  try {
    const response = await fetch(SCAN_INVENTORY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Backend error");
    }

    vehicles = data.vehicles || [];

    document.getElementById("dealerCount").textContent = data.dealer_count || 0;
    document.getElementById("vehicleCount").textContent = data.count || 0;

    renderLeaseProgram(data.lease_program);
    renderVehicles();
  } catch (error) {
    alert("Search failed: " + error.message);
    document.getElementById("programStatus").textContent = "Error";
  } finally {
    btn.disabled = false;
    btn.textContent = "Search Deals";
  }
}

function renderLeaseProgram(program) {
  const box = document.getElementById("programBox");
  const status = document.getElementById("programStatus");

  box.classList.remove("hidden");

  if (!program || !program.verified) {
    status.textContent = "Not verified";
    box.innerHTML = `
      <b>Lease program not verified</b>
      <span>Residual and base MF must be confirmed before sending final offer.</span>
    `;
    return;
  }

  status.textContent = "Verified";

  box.innerHTML = `
    <b>Lease Program</b>
    <span>Residual: ${program.residual_percent}%</span>
    <span>Base MF: ${program.money_factor}</span>
    <span>Expires: ${program.expires_at || "Unknown"}</span>
  `;
}

function renderVehicles() {
  const list = document.getElementById("vehicleList");

  if (!vehicles.length) {
    list.innerHTML = `<div class="empty-box">No vehicles found.</div>`;
    return;
  }

  list.innerHTML = vehicles
    .map((v) => {
      const raw = v.raw_data || {};
      const addonItems = raw.addon_items || [];
      const payment = Number(v.estimated_payment || 0);

      return `
        <div class="vehicle-card">
          <div class="image-box">
            ${
              v.image_url
                ? `<img src="${v.image_url}" alt="vehicle" />`
                : `<div class="no-image">No Image</div>`
            }
          </div>

          <div class="vehicle-body">
            <h3>${v.year || ""} ${v.brand || ""} ${v.model || ""}</h3>
            <p class="trim-line">${v.trim || ""}</p>

            <div class="dealer-line">
              <b>${v.dealer_name || "Dealer"}</b>
              <span>${v.dealer_distance_miles ? `${v.dealer_distance_miles} miles away` : ""}</span>
            </div>

            <div class="color-row">
              <span>Ext: ${v.exterior_color || "Unknown"}</span>
              <span>Int: ${v.interior_color || "Unknown"}</span>
            </div>

            <div class="price-box">
              <div><span>MSRP</span><b>${money(v.msrp)}</b></div>
              <div><span>Dealer Price</span><b>${money(v.sale_price)}</b></div>
              <div><span>Savings</span><b>${money(raw.detected_savings || 0)}</b></div>
              <div><span>Rebates</span><b>${money(v.manufacturer_rebate || 0)}</b></div>
              <div><span>Doc Fee</span><b>${money(v.doc_fee || 0)}</b></div>
              <div><span>Est. Payment</span><b>${payment ? money(payment) + "/mo" : "Verify"}</b></div>
            </div>

            ${
              addonItems.length
                ? `
                  <div class="addon-box danger">
                    <b>Dealer Add-ons Detected</b>
                    ${addonItems
                      .map(
                        (a) =>
                          `<span>${a.name}: ${a.amount ? money(a.amount) : "Verify amount"}</span>`
                      )
                      .join("")}
                  </div>
                `
                : `<div class="addon-box good">No clear add-ons detected</div>`
            }

            <div class="program-line">
              ${
                raw.lease_program_verified
                  ? `Residual ${v.residual_percent}% | Base MF ${v.money_factor}`
                  : "Residual / MF not verified"
              }
            </div>

            <div class="action-row">
              ${v.listing_url ? `<a href="${v.listing_url}" target="_blank">View Listing</a>` : ""}
              <button onclick="inviteDealer('${v.vin || ""}')">Invite Dealer</button>
              <button onclick="copyMessage('${v.vin || ""}')">Copy Message</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function inviteDealer(vin) {
  alert("Dealer bid system next. VIN: " + vin);
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

Please send your best lease offer with:
Selling price before rebates
Dealer discount
All rebates
Money factor
Residual
Doc fee
Dealer add-ons
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
  renderVehicles();
});
