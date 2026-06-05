const SUPABASE_URL = "https://lpkqtfltpeznuxallrrv.supabase.co";
const SCAN_INVENTORY_URL = `${SUPABASE_URL}/functions/v1/scan-inventory`;

let vehicles = [];

const makeModelData = {
  Hyundai: {
    "IONIQ 9": ["Any", "S", "SE", "SEL", "Limited", "Performance Limited", "Calligraphy"],
    "IONIQ 5": ["Any", "SE", "SEL", "Limited"],
    "IONIQ 6": ["Any", "SE", "SEL", "Limited"],
    Palisade: ["Any", "SE", "SEL", "Limited", "Calligraphy"],
    Tucson: ["Any", "SE", "SEL", "Limited"],
    SantaFe: ["Any", "SE", "SEL", "Limited", "Calligraphy"],
  },
  Kia: {
    EV9: ["Any", "Light", "Wind", "Land", "GT-Line"],
    EV6: ["Any", "Light", "Wind", "GT-Line", "GT"],
    Telluride: ["Any", "LX", "S", "EX", "SX", "SX Prestige"],
    Sorento: ["Any", "LX", "S", "EX", "SX", "SX Prestige"],
  },
  Honda: {
    Prologue: ["Any", "EX", "Touring", "Elite"],
    Pilot: ["Any", "Sport", "EX-L", "TrailSport", "Touring", "Elite"],
    Passport: ["Any", "EX-L", "TrailSport", "Black Edition"],
    CRV: ["Any", "LX", "EX", "EX-L", "Sport", "Sport Touring"],
  },
};

function money(value) {
  const number = Number(value || 0);
  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function numberOnly(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function updateModelOptions() {
  const brand = document.getElementById("brand").value;
  const modelSelect = document.getElementById("model");

  modelSelect.innerHTML = "";

  const models = Object.keys(makeModelData[brand] || {});

  models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    modelSelect.appendChild(option);
  });

  updateTrimOptions();
}

function updateTrimOptions() {
  const brand = document.getElementById("brand").value;
  const model = document.getElementById("model").value;
  const trimSelect = document.getElementById("trim");

  trimSelect.innerHTML = "";

  const trims = makeModelData[brand]?.[model] || ["Any"];

  trims.forEach((trim) => {
    const option = document.createElement("option");
    option.value = trim;
    option.textContent = trim;
    trimSelect.appendChild(option);
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
      throw new Error(`Backend returned non-JSON response. Status ${response.status}. ${text}`);
    }

    if (!response.ok || !data.ok) {
      throw new Error(data.error || `Backend error. Status ${response.status}`);
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

  if (!program || !program.verified) {
    status.textContent = "Not verified";
    box.classList.remove("hidden");
    box.innerHTML = `
      <strong>Lease program not verified</strong>
      <p>Residual and money factor are not confirmed yet. Dealer must confirm before final deal.</p>
    `;
    return;
  }

  status.textContent = "Verified";

  box.classList.remove("hidden");
  box.innerHTML = `
    <strong>Lease Program Found</strong>
    <p>
      Residual: <b>${program.residual_percent}%</b> |
      Base MF: <b>${program.money_factor}</b> |
      Expires: <b>${program.expires_at || "Unknown"}</b>
    </p>
    <p>${program.source_note || ""}</p>
  `;
}

function renderVehicles() {
  const list = document.getElementById("vehicleList");

  if (!vehicles.length) {
    list.innerHTML = `
      <div class="empty-box">
        No vehicles found for this search.
      </div>
    `;
    return;
  }

  list.innerHTML = vehicles
    .map((v) => {
      const raw = v.raw_data || {};
      const payment = Number(v.estimated_payment || 0);

      return `
        <div class="vehicle-card">
          <div class="vehicle-image-wrap">
            ${
              v.image_url
                ? `<img src="${v.image_url}" alt="${v.year || ""} ${v.brand || ""} ${v.model || ""}" />`
                : `<div class="no-image">No Image</div>`
            }
          </div>

          <div class="vehicle-info">
            <div class="vehicle-title-row">
              <h3>${v.year || ""} ${v.brand || ""} ${v.model || ""} ${v.trim || ""}</h3>
              <span class="score-badge">Score ${Math.round(v.score || 0)}</span>
            </div>

            <p class="dealer-line">
              ${v.dealer_name || "Dealer"} 
              ${v.dealer_city ? " - " + v.dealer_city : ""} 
              ${v.dealer_state ? ", " + v.dealer_state : ""}
              ${v.dealer_distance_miles ? ` | ${v.dealer_distance_miles} miles` : ""}
            </p>

            <div class="vehicle-tags">
              <span>Exterior: ${v.exterior_color || "Unknown"}</span>
              <span>Interior: ${v.interior_color || "Unknown"}</span>
              <span>VIN: ${v.vin || ""}</span>
            </div>

            <div class="price-grid">
              <div>
                <span>MSRP</span>
                <strong>${money(v.msrp)}</strong>
              </div>

              <div>
                <span>Dealer Price</span>
                <strong>${money(v.sale_price)}</strong>
              </div>

              <div>
                <span>Detected Savings</span>
                <strong>${money(raw.detected_savings || 0)}</strong>
              </div>

              <div>
                <span>Detected Rebates</span>
                <strong>${money(v.manufacturer_rebate || 0)}</strong>
              </div>

              <div>
                <span>Doc Fee</span>
                <strong>${money(v.doc_fee || 0)}</strong>
              </div>

              <div>
                <span>Est. Payment</span>
                <strong>${payment ? money(payment) + "/mo" : "Not verified"}</strong>
              </div>
            </div>

            <div class="warning-line">
              ${
                raw.lease_program_verified
                  ? `Residual ${v.residual_percent}% | Base MF ${v.money_factor} | Program expires ${raw.lease_program_expires_at || "Unknown"}`
                  : "Residual and MF not verified yet."
              }
            </div>

            ${
              v.rebate_expiration
                ? `<div class="rebate-line">Rebate expiration: ${v.rebate_expiration}</div>`
                : ""
            }

            <div class="vehicle-actions">
              ${
                v.listing_url
                  ? `<a href="${v.listing_url}" target="_blank">View Dealer Listing</a>`
                  : ""
              }

              <button onclick="inviteDealer('${v.vin || ""}')">Invite Dealer to Bid</button>
              <button onclick="copyMessage('${v.vin || ""}')">Copy Message</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function inviteDealer(vin) {
  alert("Dealer bid request will be added next. VIN: " + vin);
}

function copyMessage(vin) {
  const v = vehicles.find((x) => x.vin === vin);

  if (!v) return;

  const message = `
Hello,

I am interested in this vehicle:

${v.year || ""} ${v.brand || ""} ${v.model || ""} ${v.trim || ""}
VIN: ${v.vin}
Stock: ${v.stock_number || ""}
Exterior: ${v.exterior_color || ""}
Interior: ${v.interior_color || ""}

Please send your best lease offer:
Term: ${v.term} months
Miles: ${numberOnly(v.miles)} miles per year

Please include:
Selling price before rebates
Dealer discount
All rebates
Money factor
Residual
Doc fee
Acquisition fee
Registration/taxes
Total due at signing
Monthly payment

Thank you.
`.trim();

  navigator.clipboard.writeText(message);
  alert("Message copied.");
}

document.addEventListener("DOMContentLoaded", () => {
  updateModelOptions();
  renderVehicles();
});
