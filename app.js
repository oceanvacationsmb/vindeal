const SUPABASE_URL = "https://lpkqtfltpeznuxallrrv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_T2MqV-yW0lnpmDc8x-IGqA_3go3dcfW";
const SCAN_INVENTORY_URL = `${SUPABASE_URL}/functions/v1/scan-inventory`;

let vehicles = JSON.parse(localStorage.getItem("vindealVehicles") || "[]");

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

function updateModelOptions() {
  const brand = document.getElementById("brand").value;
  const modelSelect = document.getElementById("model");

  const models = Object.keys(makeModelData[brand] || {});

  modelSelect.innerHTML = models
    .map((model) => `<option value="${model}">${model}</option>`)
    .join("");

  if (brand === "Hyundai") {
    modelSelect.value = "IONIQ 9";
  }

  if (brand === "Kia") {
    modelSelect.value = "EV9";
  }

  if (brand === "Honda") {
    modelSelect.value = "Prologue";
  }

  updateTrimOptions();
}

function updateTrimOptions() {
  const brand = document.getElementById("brand").value;
  const model = document.getElementById("model").value;
  const trimSelect = document.getElementById("trim");

  const trims = makeModelData[brand]?.[model] || ["Any"];

  trimSelect.innerHTML = trims
    .map((trim) => `<option value="${trim}">${trim}</option>`)
    .join("");

  trimSelect.value = "Any";
}

function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function moneyMonthly(value) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function getValue(id, fallback = "") {
  return document.getElementById(id)?.value || fallback;
}

function getNumber(id, fallback = 0) {
  return Number(document.getElementById(id)?.value || fallback);
}

async function scanBackendInventory() {
  const searchBtn = document.querySelector(".search-btn");

  if (searchBtn) {
    searchBtn.disabled = true;
    searchBtn.textContent = "Scanning dealers...";
  }

  try {
    const body = {
      zipCode: getValue("zipCode", "29577"),
      radius: getNumber("radius", 250),
      brand: getValue("brand", "Hyundai"),
      model: getValue("model", "IONIQ 9"),
      trim: getValue("trim", "Any"),
      year: getNumber("year", 2026),
      exteriorColor: getValue("exteriorColor", "Any"),
      interiorColor: getValue("interiorColor", "Any"),
      manufacturerRebate: getNumber("manufacturerRebate", 10000),
      leaseCash: getNumber("leaseCash", 0),
      evCredit: getNumber("evCredit", 0),
      loyaltyCash: getNumber("loyaltyCash", 0),
      residualPercent: getNumber("residualPercent", 58),
      moneyFactor: getNumber("moneyFactor", 0.00222),
      term: getNumber("term", 36),
      miles: getNumber("miles", 10000),
    };

    const response = await fetch(SCAN_INVENTORY_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

    const rawText = await response.text();

    let data = null;

    try {
      data = JSON.parse(rawText);
    } catch {
      alert("Backend did not return JSON. Status: " + response.status + "\n\n" + rawText.slice(0, 500));
      return;
    }

    if (!response.ok || !data.ok) {
      alert(
        "Scan failed.\n\nStatus: " +
          response.status +
          "\n\nResponse:\n" +
          JSON.stringify(data, null, 2)
      );
      return;
    }

    vehicles = data.vehicles.map((v) => ({
      id: v.id,
      vin: v.vin,
      stock: v.stock_number || "",
      year: v.year,
      brand: v.brand,
      model: v.model,
      trim: v.trim,
      exterior: v.exterior_color || "",
      interior: v.interior_color || "",
      drivetrain: v.drivetrain || "",
      msrp: Number(v.msrp || 0),
      salePrice: Number(v.sale_price || 0),
      dealerDiscount: Number(v.dealer_discount || 0),
      rebate: Number(v.manufacturer_rebate || 0),
      docFee: Number(v.doc_fee || 0),
      acquisitionFee: Number(v.acquisition_fee || 0),
      junkFee: Number(v.junk_fee || 0),
      residualPercent: Number(v.residual_percent || 0),
      moneyFactor: Number(v.money_factor || 0),
      term: Number(v.term || 36),
      miles: Number(v.miles || 10000),
      payment: Number(v.estimated_payment || 0),
      score: Number(v.score || 0),
      dealer: v.dealer_name || "",
      dealerCity: v.dealer_city || "",
      dealerState: v.dealer_state || "",
      listingUrl: v.listing_url || "",
      imageUrl: v.image_url || "",
      source: "Supabase",
    }));

    localStorage.setItem("vindealVehicles", JSON.stringify(vehicles));
    renderVehicles();

    alert(`Scan complete. Found ${data.count} vehicles.`);
  } catch (error) {
    alert("Error scanning inventory:\n\n" + error.message);
  } finally {
    if (searchBtn) {
      searchBtn.disabled = false;
      searchBtn.textContent = "Scan Dealers";
    }
  }
}

function renderVehicles() {
  const list = document.getElementById("vehiclesList");

  if (!list) return;

  if (!vehicles.length) {
    list.innerHTML = `<p class="empty">No vehicles yet. Click Scan Dealers.</p>`;
    updateSummary();
    return;
  }

  vehicles.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

  list.innerHTML = vehicles
    .map((v) => {
      const feesWarning = Number(v.docFee || 0) > 799 || Number(v.junkFee || 0) > 0;

      return `
        <div class="vehicle-card">
          <div class="vehicle-image-wrap">
            ${
              v.imageUrl
                ? `<img class="vehicle-image" src="${v.imageUrl}" alt="${v.year} ${v.brand} ${v.model}" />`
                : `<div class="no-image">No Image</div>`
            }
          </div>

          <div class="vehicle-info">
            <div class="vehicle-top">
              <div>
                <h3>${v.year || ""} ${v.brand || ""} ${v.model || ""} ${v.trim || ""}</h3>
                <p>${v.exterior || "Unknown exterior"} / ${v.interior || "Unknown interior"}</p>
              </div>

              <div class="payment-box">
                <span>Est. Payment</span>
                <strong>${moneyMonthly(v.payment)}</strong>
              </div>
            </div>

            <div class="details-grid">
              <div>
                <span>MSRP</span>
                <strong>${money(v.msrp)}</strong>
              </div>

              <div>
                <span>Sale Price</span>
                <strong>${money(v.salePrice)}</strong>
              </div>

              <div>
                <span>Dealer Discount</span>
                <strong>${money(v.dealerDiscount)}</strong>
              </div>

              <div>
                <span>Rebate</span>
                <strong>${money(v.rebate)}</strong>
              </div>

              <div class="${Number(v.docFee || 0) > 799 ? "bad-fee" : ""}">
                <span>Doc Fee</span>
                <strong>${money(v.docFee)}</strong>
              </div>

              <div class="${Number(v.junkFee || 0) > 0 ? "bad-fee" : ""}">
                <span>Add-ons / Junk</span>
                <strong>${money(v.junkFee)}</strong>
              </div>

              <div>
                <span>Residual</span>
                <strong>${v.residualPercent}%</strong>
              </div>

              <div>
                <span>MF</span>
                <strong>${v.moneyFactor}</strong>
              </div>
            </div>

            ${feesWarning ? `<div class="warning">Check fees/add-ons before accepting this deal.</div>` : ""}

            <div class="vehicle-footer">
              <div>
                <p><strong>Dealer:</strong> ${v.dealer} ${v.dealerCity ? `- ${v.dealerCity}, ${v.dealerState}` : ""}</p>
                <p><strong>VIN:</strong> ${v.vin}</p>
                <p><strong>Stock:</strong> ${v.stock}</p>
              </div>

              <div class="actions">
                ${
                  v.listingUrl
                    ? `<a href="${v.listingUrl}" target="_blank" class="btn">View Listing</a>`
                    : ""
                }
                <button onclick="copyDealerMessage('${v.id}')">Copy Message</button>
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  updateSummary();
}

function updateSummary() {
  const totalVehicles = document.getElementById("totalVehicles");
  const bestPayment = document.getElementById("bestPayment");
  const bestDiscount = document.getElementById("bestDiscount");
  const avgPayment = document.getElementById("avgPayment");

  if (!vehicles.length) {
    if (totalVehicles) totalVehicles.textContent = "0";
    if (bestPayment) bestPayment.textContent = "$0";
    if (bestDiscount) bestDiscount.textContent = "$0";
    if (avgPayment) avgPayment.textContent = "$0";
    return;
  }

  const payments = vehicles.map((v) => Number(v.payment || 0)).filter((p) => p > 0);
  const discounts = vehicles.map((v) => Number(v.dealerDiscount || 0));

  const bestPay = payments.length ? Math.min(...payments) : 0;
  const bestDisc = discounts.length ? Math.max(...discounts) : 0;
  const avgPay = payments.length
    ? payments.reduce((sum, p) => sum + p, 0) / payments.length
    : 0;

  if (totalVehicles) totalVehicles.textContent = vehicles.length;
  if (bestPayment) bestPayment.textContent = moneyMonthly(bestPay);
  if (bestDiscount) bestDiscount.textContent = money(bestDisc);
  if (avgPayment) avgPayment.textContent = moneyMonthly(avgPay);
}

function copyDealerMessage(id) {
  const v = vehicles.find((item) => item.id === id);

  if (!v) return;

  const msg = `Hello,

I'm interested in this vehicle:

${v.year} ${v.brand} ${v.model} ${v.trim}
VIN: ${v.vin}
Stock: ${v.stock}
MSRP: ${money(v.msrp)}
Advertised Price: ${money(v.salePrice)}
Dealer Discount: ${money(v.dealerDiscount)}

Please send me your best lease quote with:
- 36 months
- 10,000 miles per year
- $0 down
- Full breakdown of fees
- Money factor
- Residual
- Rebates included
- Due at signing

Please also confirm if there are any dealer add-ons or required accessories.

Thank you.`;

  navigator.clipboard.writeText(msg);
  alert("Dealer message copied.");
}

function clearVehicles() {
  vehicles = [];
  localStorage.removeItem("vindealVehicles");
  renderVehicles();
}

document.addEventListener("DOMContentLoaded", () => {
  updateModelOptions();
  renderVehicles();
});
