let vehicles = JSON.parse(localStorage.getItem("vindeal_vehicles")) || [];

const vehicleData = {
  Hyundai: {
    "IONIQ 9": ["Any", "S", "SE", "SEL", "Limited", "Performance Limited"],
    "IONIQ 5": ["Any", "SE", "SEL", "Limited", "N"],
    "IONIQ 6": ["Any", "SE", "SEL", "Limited"],
    Palisade: ["Any", "SE", "SEL", "XRT", "Limited", "Calligraphy"]
  },
  Kia: {
    EV9: ["Any", "Light", "Wind", "Land", "GT-Line"],
    EV6: ["Any", "Light", "Wind", "GT-Line", "GT"],
    Telluride: ["Any", "LX", "S", "EX", "SX", "SX Prestige"]
  },
  BMW: {
    X5: ["Any", "xDrive40i", "xDrive50e", "M60i"],
    iX: ["Any", "xDrive50", "M60"],
    i4: ["Any", "eDrive35", "eDrive40", "xDrive40", "M50"]
  },
  Genesis: {
    GV70: ["Any", "2.5T", "3.5T", "Electrified"],
    GV80: ["Any", "2.5T", "3.5T"],
    GV60: ["Any", "Advanced", "Performance"]
  },
  "Mercedes-Benz": {
    GLE: ["Any", "350", "450", "580", "AMG 53"],
    EQE: ["Any", "350+", "350 4MATIC", "500 4MATIC"],
    EQS: ["Any", "450+", "450 4MATIC", "580 4MATIC"]
  },
  Toyota: {
    "Grand Highlander": ["Any", "XLE", "Limited", "Platinum"],
    bZ4X: ["Any", "XLE", "Limited"],
    Highlander: ["Any", "LE", "XLE", "Limited", "Platinum"]
  },
  Honda: {
    Pilot: ["Any", "Sport", "EX-L", "TrailSport", "Touring", "Elite"],
    Prologue: ["Any", "EX", "Touring", "Elite"],
    Passport: ["Any", "EX-L", "TrailSport", "Black Edition"]
  },
  Lexus: {
    TX: ["Any", "350", "500h", "550h+"],
    RX: ["Any", "350", "350h", "500h"],
    RZ: ["Any", "300e", "450e"]
  }
};

function money(value) {
  return "$" + Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function getValue(id) {
  return document.getElementById(id).value.trim();
}

function getNumber(id) {
  return Number(document.getElementById(id).value) || 0;
}

function isChecked(id) {
  return document.getElementById(id).checked;
}

function getRadio(name) {
  const selected = document.querySelector(`input[name="${name}"]:checked`);
  return selected ? selected.value : "";
}

function saveStorage() {
  localStorage.setItem("vindeal_vehicles", JSON.stringify(vehicles));
}

function updateModels() {
  const brand = getValue("brand");
  const modelSelect = document.getElementById("model");

  modelSelect.innerHTML = "";

  Object.keys(vehicleData[brand]).forEach(model => {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    modelSelect.appendChild(option);
  });

  updateTrims();
}

function updateTrims() {
  const brand = getValue("brand");
  const model = getValue("model");
  const trimSelect = document.getElementById("trim");

  trimSelect.innerHTML = "";

  vehicleData[brand][model].forEach(trim => {
    const option = document.createElement("option");
    option.value = trim;
    option.textContent = trim;
    trimSelect.appendChild(option);
  });
}

function getSearchProfile() {
  return {
    zipCode: getValue("zipCode"),
    radius: getRadio("radius"),
    brand: getValue("brand"),
    model: getValue("model"),
    trim: getValue("trim"),
    year: getValue("year"),
    exteriorColor: getRadio("color"),
    interiorColor: getRadio("interior"),
    features: {
      sunroof: isChecked("fSunroof"),
      panoramic: isChecked("fPanoramic"),
      heatedWheel: isChecked("fHeatedWheel"),
      captainChairs: isChecked("fCaptain"),
      ventilatedSeats: isChecked("fVentSeats"),
      hud: isChecked("fHud"),
      awd: isChecked("fAwd"),
      towPackage: isChecked("fTow")
    }
  };
}

function searchNearby() {
  const search = getSearchProfile();

  const query = encodeURIComponent(
    `${search.year} ${search.brand} ${search.model} ${search.trim === "Any" ? "" : search.trim} lease ${search.zipCode}`
  );

  const modelSlug = search.model.toLowerCase().replaceAll(" ", "_");

  const links = [
    `https://www.google.com/search?q=${query}`,
    `https://www.cars.com/shopping/results/?stock_type=new&makes%5B%5D=${search.brand.toLowerCase()}&models%5B%5D=${search.brand.toLowerCase()}-${modelSlug}&zip=${search.zipCode}&maximum_distance=${search.radius}`,
    `https://www.autotrader.com/cars-for-sale/new-cars/${search.brand}/${search.model}/${search.zipCode}?searchRadius=${search.radius}`,
    `https://www.cargurus.com/Cars/new/searchresults.action?zip=${search.zipCode}&distance=${search.radius}`
  ];

  links.forEach(link => window.open(link, "_blank"));
}

function openManufacturerOffers() {
  const brand = getValue("brand");

  const links = {
    Hyundai: "https://www.hyundaiusa.com/us/en/offers",
    Kia: "https://www.kia.com/us/en/offers",
    BMW: "https://www.bmwusa.com/special-offers.html",
    Genesis: "https://www.genesis.com/us/en/offers.html",
    "Mercedes-Benz": "https://www.mbusa.com/en/special-offers",
    Toyota: "https://www.toyota.com/deals-incentives/",
    Honda: "https://automobiles.honda.com/tools/current-offers",
    Lexus: "https://www.lexus.com/offers"
  };

  window.open(links[brand] || "https://www.google.com/search?q=manufacturer+lease+offers", "_blank");
}

async function decodeVin() {
  const vin = getValue("vin");

  if (!vin || vin.length < 10) {
    alert("Paste a valid VIN first.");
    return;
  }

  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${vin}?format=json`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.Results || !data.Results[0]) {
      alert("VIN not found.");
      return;
    }

    const result = data.Results[0];

    const make = result.Make || "";
    const model = result.Model || "";
    const year = result.ModelYear || "";
    const trim = result.Trim || "";
    const bodyClass = result.BodyClass || "";
    const driveType = result.DriveType || "";

    if (make) {
      const brandSelect = document.getElementById("brand");

      const matchBrand = Array.from(brandSelect.options).find(option =>
        option.value.toLowerCase() === make.toLowerCase()
      );

      if (matchBrand) {
        brandSelect.value = matchBrand.value;
        updateModels();
      }
    }

    if (model) {
      const modelSelect = document.getElementById("model");

      const matchModel = Array.from(modelSelect.options).find(option =>
        option.value.toLowerCase() === model.toLowerCase()
      );

      if (matchModel) {
        modelSelect.value = matchModel.value;
        updateTrims();
      }
    }

    if (year) {
      const yearSelect = document.getElementById("year");
      const matchYear = Array.from(yearSelect.options).find(option => option.value === year);

      if (matchYear) {
        yearSelect.value = year;
      }
    }

    if (trim) {
      const trimSelect = document.getElementById("trim");

      const matchTrim = Array.from(trimSelect.options).find(option =>
        trim.toLowerCase().includes(option.value.toLowerCase()) ||
        option.value.toLowerCase().includes(trim.toLowerCase())
      );

      if (matchTrim) {
        trimSelect.value = matchTrim.value;
      }
    }

    const nameParts = [year, make, model, trim].filter(Boolean);
    document.getElementById("vehicleName").value = nameParts.join(" ");

    let noteText = document.getElementById("notes").value;

    noteText += `\nVIN decoded:
Make: ${make}
Model: ${model}
Year: ${year}
Trim: ${trim}
Body: ${bodyClass}
Drive: ${driveType}`;

    document.getElementById("notes").value = noteText.trim();

    alert("VIN decoded.");
  } catch (error) {
    console.error(error);
    alert("VIN decode failed.");
  }
}

function totalRebates(vehicle) {
  return (
    Number(vehicle.manufacturerRebate || 0) +
    Number(vehicle.leaseCash || 0) +
    Number(vehicle.evCredit || 0) +
    Number(vehicle.loyaltyCash || 0)
  );
}

function totalFees(vehicle) {
  return (
    Number(vehicle.docFee || 0) +
    Number(vehicle.acqFee || 0) +
    Number(vehicle.dmvFee || 0) +
    Number(vehicle.junkFee || 0)
  );
}

function calculateLease(vehicle) {
  const msrp = Number(vehicle.msrp || 0);
  const dealerDiscount = Number(vehicle.dealerDiscount || 0);
  const rebates = totalRebates(vehicle);
  const fees = totalFees(vehicle);
  const downPayment = Number(vehicle.downPayment || 0);
  const residualPercent = Number(vehicle.residual || 0);
  const mf = Number(vehicle.mf || 0);
  const term = Number(vehicle.term || 36);
  const taxRate = Number(vehicle.taxRate || 0);

  const sellingPrice = msrp - dealerDiscount;
  const capCost = sellingPrice - rebates + fees - downPayment;
  const residualValue = msrp * (residualPercent / 100);

  const depreciation = (capCost - residualValue) / term;
  const rentCharge = (capCost + residualValue) * mf;
  const basePayment = depreciation + rentCharge;
  const tax = basePayment * (taxRate / 100);
  const monthly = basePayment + tax;

  const totalDiscount = dealerDiscount + rebates;
  const discountPercent = msrp ? (totalDiscount / msrp) * 100 : 0;

  return {
    rebates,
    fees,
    sellingPrice,
    capCost,
    residualValue,
    depreciation,
    rentCharge,
    basePayment,
    tax,
    monthly,
    totalDiscount,
    discountPercent
  };
}

function getScore(vehicle) {
  const calc = calculateLease(vehicle);

  let score = 1000;

  score -= calc.monthly;
  score += Number(vehicle.dealerDiscount || 0) / 80;
  score += calc.rebates / 120;
  score -= Number(vehicle.junkFee || 0) / 10;
  score -= Number(vehicle.docFee || 0) / 100;

  if (vehicle.exteriorColor !== "Any") score += 20;
  if (vehicle.interiorColor !== "Any") score += 10;

  if (vehicle.features.sunroof) score += 10;
  if (vehicle.features.panoramic) score += 10;
  if (vehicle.features.heatedWheel) score += 8;
  if (vehicle.features.captainChairs) score += 12;
  if (vehicle.features.ventilatedSeats) score += 8;
  if (vehicle.features.hud) score += 6;
  if (vehicle.features.awd) score += 8;
  if (vehicle.features.towPackage) score += 4;

  return score;
}

function getGrade(vehicle) {
  const calc = calculateLease(vehicle);
  const junkFee = Number(vehicle.junkFee || 0);

  if (junkFee >= 2000) return "Bad - Heavy Add-ons";
  if (junkFee >= 1000) return "Warning - Junk Fees";
  if (calc.monthly <= 550) return "Excellent";
  if (calc.monthly <= 650) return "Good";
  if (calc.monthly <= 750) return "Fair";
  return "Expensive";
}

function addVehicle() {
  const search = getSearchProfile();

  const vehicle = {
    id: Date.now(),

    zipCode: search.zipCode,
    radius: search.radius,
    brand: search.brand,
    model: search.model,
    trim: search.trim,
    year: search.year,
    exteriorColor: search.exteriorColor,
    interiorColor: search.interiorColor,
    features: search.features,

    vin: getValue("vin"),
    listingLink: getValue("listingLink"),
    dealerName: getValue("dealerName"),
    dealerCity: getValue("dealerCity"),
    dealerState: getValue("dealerState"),
    vehicleName: getValue("vehicleName"),

    manufacturerRebate: getNumber("manufacturerRebate"),
    leaseCash: getNumber("leaseCash"),
    evCredit: getNumber("evCredit"),
    loyaltyCash: getNumber("loyaltyCash"),
    rebateExpiration: getValue("rebateExpiration"),
    rebateLink: getValue("rebateLink"),

    msrp: getNumber("msrp"),
    dealerDiscount: getNumber("dealerDiscount"),
    docFee: getNumber("docFee"),
    acqFee: getNumber("acqFee"),
    dmvFee: getNumber("dmvFee"),
    junkFee: getNumber("junkFee"),
    residual: getNumber("residual"),
    mf: getNumber("mf"),
    term: getNumber("term"),
    miles: getNumber("miles"),
    downPayment: getNumber("downPayment"),
    taxRate: getNumber("taxRate"),

    notes: getValue("notes"),
    createdAt: new Date().toLocaleString()
  };

  if (!vehicle.vin && !vehicle.listingLink && !vehicle.dealerName) {
    alert("Add VIN, dealer link, or dealer name first.");
    return;
  }

  vehicles.push(vehicle);
  saveStorage();
  resetAddForm();
  renderVehicles();
}

function resetAddForm() {
  const fields = [
    "vin",
    "listingLink",
    "dealerName",
    "dealerCity",
    "dealerState",
    "vehicleName",
    "msrp",
    "dealerDiscount",
    "docFee",
    "acqFee",
    "dmvFee",
    "junkFee",
    "residual",
    "mf",
    "notes"
  ];

  fields.forEach(id => {
    document.getElementById(id).value = "";
  });

  document.getElementById("downPayment").value = "0";
  document.getElementById("taxRate").value = "0";
  document.getElementById("term").value = "36";
  document.getElementById("miles").value = "10000";
}

function deleteVehicle(id) {
  if (!confirm("Delete this vehicle?")) return;

  vehicles = vehicles.filter(vehicle => vehicle.id !== id);
  saveStorage();
  renderVehicles();
}

function duplicateVehicle(id) {
  const vehicle = vehicles.find(item => item.id === id);
  if (!vehicle) return;

  const copy = JSON.parse(JSON.stringify(vehicle));
  copy.id = Date.now();
  copy.vehicleName = `${vehicle.vehicleName || "Vehicle"} Copy`;
  copy.createdAt = new Date().toLocaleString();

  vehicles.push(copy);
  saveStorage();
  renderVehicles();
}

function clearAll() {
  if (!confirm("Delete all saved vehicles?")) return;

  vehicles = [];
  saveStorage();
  renderVehicles();
}

function featureBadges(vehicle) {
  const badges = [];

  if (vehicle.features.sunroof) badges.push("Sunroof");
  if (vehicle.features.panoramic) badges.push("Panoramic Roof");
  if (vehicle.features.heatedWheel) badges.push("Heated Wheel");
  if (vehicle.features.captainChairs) badges.push("Captain Chairs");
  if (vehicle.features.ventilatedSeats) badges.push("Vent Seats");
  if (vehicle.features.hud) badges.push("HUD");
  if (vehicle.features.awd) badges.push("AWD");
  if (vehicle.features.towPackage) badges.push("Tow Package");

  if (badges.length === 0) {
    return `<span class="badge badge-gray">No feature filter</span>`;
  }

  return badges.map(item => `<span class="badge">${item}</span>`).join("");
}

function getFilteredVehicles() {
  const filter = getValue("filterText").toLowerCase();

  let filtered = vehicles.filter(vehicle => {
    const text = `
      ${vehicle.vin}
      ${vehicle.listingLink}
      ${vehicle.dealerName}
      ${vehicle.dealerCity}
      ${vehicle.dealerState}
      ${vehicle.vehicleName}
      ${vehicle.brand}
      ${vehicle.model}
      ${vehicle.trim}
      ${vehicle.exteriorColor}
      ${vehicle.interiorColor}
    `.toLowerCase();

    return !filter || text.includes(filter);
  });

  const sortBy = getValue("sortBy");

  filtered.sort((a, b) => {
    const calcA = calculateLease(a);
    const calcB = calculateLease(b);

    if (sortBy === "payment") return calcA.monthly - calcB.monthly;
    if (sortBy === "discount") return calcB.totalDiscount - calcA.totalDiscount;
    if (sortBy === "junk") return Number(a.junkFee || 0) - Number(b.junkFee || 0);

    return getScore(b) - getScore(a);
  });

  return filtered;
}

function renderDashboard(filtered) {
  const dashboard = document.getElementById("dashboard");

  if (filtered.length === 0) {
    dashboard.innerHTML = "";
    return;
  }

  const byPayment = [...filtered].sort((a, b) => calculateLease(a).monthly - calculateLease(b).monthly);
  const byScore = [...filtered].sort((a, b) => getScore(b) - getScore(a));

  const best = byScore[0];
  const lowest = byPayment[0];

  const avgPayment =
    filtered.reduce((sum, vehicle) => sum + calculateLease(vehicle).monthly, 0) / filtered.length;

  const junkCount = filtered.filter(vehicle => Number(vehicle.junkFee || 0) > 0).length;

  const avgDiscount =
    filtered.reduce((sum, vehicle) => sum + calculateLease(vehicle).discountPercent, 0) / filtered.length;

  dashboard.innerHTML = `
    <div class="stat green-border">
      <h3>Best Overall</h3>
      <strong>${best.dealerName || "Unknown"}</strong>
      <span>${money(calculateLease(best).monthly)} / mo</span>
    </div>

    <div class="stat">
      <h3>Lowest Payment</h3>
      <strong>${money(calculateLease(lowest).monthly)}</strong>
      <span>${lowest.dealerName || "Unknown"}</span>
    </div>

    <div class="stat">
      <h3>Average Payment</h3>
      <strong>${money(avgPayment)}</strong>
      <span>${filtered.length} saved vehicles</span>
    </div>

    <div class="stat red-border">
      <h3>With Junk Fees</h3>
      <strong>${junkCount}</strong>
      <span>red warning</span>
    </div>

    <div class="stat yellow-border">
      <h3>Average Discount</h3>
      <strong>${avgDiscount.toFixed(1)}%</strong>
      <span>dealer + rebate</span>
    </div>
  `;
}

function renderVehicles() {
  const list = document.getElementById("vehiclesList");
  const filtered = getFilteredVehicles();

  renderDashboard(filtered);

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty">No vehicles saved yet. Search nearby dealers, paste a VIN/link, and add the car.</div>`;
    return;
  }

  list.innerHTML = filtered.map((vehicle, index) => {
    const calc = calculateLease(vehicle);
    const score = getScore(vehicle);
    const grade = getGrade(vehicle);
    const hasJunk = Number(vehicle.junkFee || 0) > 0;

    return `
      <div class="vehicle-card ${index === 0 ? "best" : ""}">
        <div class="vehicle-top">
          <div class="vehicle-title">
            <h3>${index === 0 ? "🏆 " : ""}#${index + 1} ${vehicle.vehicleName || `${vehicle.year} ${vehicle.brand} ${vehicle.model}`}</h3>

            <p>
              <strong>${vehicle.year} ${vehicle.brand} ${vehicle.model}</strong>
              ${vehicle.trim && vehicle.trim !== "Any" ? ` | ${vehicle.trim}` : ""}
            </p>

            <p>
              <strong>VIN:</strong> ${vehicle.vin || "-"}
              ${vehicle.listingLink ? ` | <a href="${vehicle.listingLink}" target="_blank">Open Listing</a>` : ""}
            </p>

            <p>
              <strong>Dealer:</strong> ${vehicle.dealerName || "-"}
              ${vehicle.dealerCity || vehicle.dealerState ? ` | ${vehicle.dealerCity || ""}, ${vehicle.dealerState || ""}` : ""}
            </p>

            <p>
              <strong>Search:</strong> ${vehicle.zipCode || "-"} within ${vehicle.radius || "-"} miles |
              <strong>Color:</strong> ${vehicle.exteriorColor || "Any"} / ${vehicle.interiorColor || "Any"}
            </p>

            <div class="badges">
              <span class="badge ${hasJunk ? "badge-red" : "badge-green"}">
                ${hasJunk ? "Junk/Add-ons Found" : "No Junk Fees"}
              </span>

              <span class="badge ${grade.includes("Bad") || grade.includes("Warning") || grade.includes("Expensive") ? "badge-red" : "badge-green"}">
                ${grade}
              </span>

              ${featureBadges(vehicle)}
            </div>
          </div>

          <div class="payment-box">
            <div class="payment">${money(calc.monthly)}</div>
            <div class="small">Estimated monthly</div>
            <div class="small">Score: ${score.toFixed(0)}</div>
          </div>
        </div>

        <div class="numbers">
          <div class="data">
            <span>MSRP</span>
            <strong>${money(vehicle.msrp)}</strong>
          </div>

          <div class="data">
            <span>Dealer Discount</span>
            <strong class="good">${money(vehicle.dealerDiscount)}</strong>
          </div>

          <div class="data">
            <span>Rebates</span>
            <strong class="good">${money(calc.rebates)}</strong>
          </div>

          <div class="data">
            <span>Junk Fees</span>
            <strong class="${hasJunk ? "bad" : ""}">${money(vehicle.junkFee)}</strong>
          </div>

          <div class="data">
            <span>Total Fees</span>
            <strong>${money(calc.fees)}</strong>
          </div>

          <div class="data">
            <span>Selling Price</span>
            <strong>${money(calc.sellingPrice)}</strong>
          </div>

          <div class="data">
            <span>Cap Cost</span>
            <strong>${money(calc.capCost)}</strong>
          </div>

          <div class="data">
            <span>Residual Value</span>
            <strong>${money(calc.residualValue)}</strong>
          </div>

          <div class="data">
            <span>Residual</span>
            <strong>${vehicle.residual || 0}%</strong>
          </div>

          <div class="data">
            <span>Money Factor</span>
            <strong>${vehicle.mf || 0}</strong>
          </div>

          <div class="data">
            <span>APR Approx.</span>
            <strong>${(Number(vehicle.mf || 0) * 2400).toFixed(2)}%</strong>
          </div>

          <div class="data">
            <span>Term / Miles</span>
            <strong>${vehicle.term || 0} mo / ${vehicle.miles || 0}</strong>
          </div>

          <div class="data">
            <span>Discount %</span>
            <strong>${calc.discountPercent.toFixed(2)}%</strong>
          </div>

          <div class="data">
            <span>Total Discount</span>
            <strong class="good">${money(calc.totalDiscount)}</strong>
          </div>

          <div class="data">
            <span>Rebate Expires</span>
            <strong>${vehicle.rebateExpiration || "-"}</strong>
          </div>

          <div class="data">
            <span>Down Payment</span>
            <strong>${money(vehicle.downPayment)}</strong>
          </div>
        </div>

        ${vehicle.rebateLink ? `
          <p><strong>Rebate Source:</strong> <a href="${vehicle.rebateLink}" target="_blank">Open Offer Page</a></p>
        ` : ""}

        ${vehicle.notes ? `
          <div class="notes">
            <strong>Notes:</strong> ${vehicle.notes}
          </div>
        ` : ""}

        <div class="actions">
          <button class="btn blue" onclick="generateMessage(${vehicle.id})">Generate Dealer Message</button>
          <button class="btn gray" onclick="duplicateVehicle(${vehicle.id})">Duplicate</button>
          <button class="btn red" onclick="deleteVehicle(${vehicle.id})">Delete</button>
        </div>
      </div>
    `;
  }).join("");
}

function generateMessage(id) {
  const vehicle = vehicles.find(item => item.id === id);
  if (!vehicle) return;

  const calc = calculateLease(vehicle);

  const message = `Hello,

My name is Zack.

I am interested in this vehicle:

${vehicle.year} ${vehicle.brand} ${vehicle.model}
Trim: ${vehicle.trim}
VIN: ${vehicle.vin || ""}
Exterior/Interior: ${vehicle.exteriorColor || ""} / ${vehicle.interiorColor || ""}
Listing: ${vehicle.listingLink || ""}

Please send me your best lease quote with a full itemized breakdown.

Here are the numbers I am comparing:

MSRP: ${money(vehicle.msrp)}
Dealer Discount: ${money(vehicle.dealerDiscount)}
Manufacturer Rebate: ${money(vehicle.manufacturerRebate)}
Lease Cash: ${money(vehicle.leaseCash)}
EV Credit / Bonus: ${money(vehicle.evCredit)}
Loyalty / Conquest: ${money(vehicle.loyaltyCash)}
Total Rebates: ${money(calc.rebates)}

Doc Fee: ${money(vehicle.docFee)}
Acquisition Fee: ${money(vehicle.acqFee)}
DMV / Tag / Title: ${money(vehicle.dmvFee)}
Dealer Add-ons / Junk Fees: ${money(vehicle.junkFee)}

Residual: ${vehicle.residual || 0}%
Money Factor: ${vehicle.mf || 0}
Term: ${vehicle.term || 0} months
Miles: ${vehicle.miles || 0} per year
Down Payment: ${money(vehicle.downPayment)}

Based on these numbers, my estimated monthly payment is:
${money(calc.monthly)} per month.

Please confirm:

1. Selling price before rebates
2. Dealer discount
3. All manufacturer rebates included
4. Residual
5. Money factor
6. Acquisition fee
7. Doc fee
8. DMV/tag/title fees
9. Any dealer add-ons or protection packages
10. Total due at signing
11. Final monthly payment including tax

Please remove any optional dealer add-ons or packages.

Thank you.`;

  document.getElementById("dealerMessage").value = message;
  document.getElementById("messageModal").classList.remove("hidden");
}

function closeMessage() {
  document.getElementById("messageModal").classList.add("hidden");
}

function copyMessage() {
  const box = document.getElementById("dealerMessage");
  box.select();
  document.execCommand("copy");
  alert("Message copied.");
}

function loadDemoCars() {
  const demoSearch = {
    zipCode: "29577",
    radius: "250",
    brand: "Hyundai",
    model: "IONIQ 9",
    trim: "Performance Limited",
    year: "2026",
    exteriorColor: "White",
    interiorColor: "Gray",
    features: {
      sunroof: true,
      panoramic: true,
      heatedWheel: true,
      captainChairs: true,
      ventilatedSeats: true,
      hud: true,
      awd: true,
      towPackage: false
    }
  };

  vehicles = [
    {
      id: Date.now() + 1,
      ...demoSearch,
      vin: "7YAMWFS55TY010209",
      listingLink: "https://www.hyundaiusa.com/us/en/offers",
      dealerName: "Hyundai of Columbia",
      dealerCity: "Columbia",
      dealerState: "SC",
      vehicleName: "White Performance Limited / Gray Interior",
      manufacturerRebate: 10000,
      leaseCash: 0,
      evCredit: 0,
      loyaltyCash: 0,
      rebateExpiration: "Verify",
      rebateLink: "https://www.hyundaiusa.com/us/en/offers",
      msrp: 74020,
      dealerDiscount: 4000,
      docFee: 499,
      acqFee: 650,
      dmvFee: 300,
      junkFee: 0,
      residual: 58,
      mf: 0.00222,
      term: 36,
      miles: 10000,
      downPayment: 0,
      taxRate: 0,
      notes: "Demo good deal. No junk fees entered.",
      createdAt: new Date().toLocaleString()
    },
    {
      id: Date.now() + 2,
      ...demoSearch,
      trim: "SEL",
      exteriorColor: "Gray",
      interiorColor: "Black",
      features: {
        sunroof: false,
        panoramic: false,
        heatedWheel: true,
        captainChairs: false,
        ventilatedSeats: false,
        hud: false,
        awd: true,
        towPackage: false
      },
      vin: "7YAMUFS35TY002213",
      listingLink: "https://www.autonationhyundaicolumbia.com/",
      dealerName: "AutoNation Hyundai Columbia",
      dealerCity: "Columbia",
      dealerState: "SC",
      vehicleName: "Gray SEL / Black Interior",
      manufacturerRebate: 10000,
      leaseCash: 0,
      evCredit: 0,
      loyaltyCash: 0,
      rebateExpiration: "Verify",
      rebateLink: "https://www.hyundaiusa.com/us/en/offers",
      msrp: 62000,
      dealerDiscount: 2500,
      docFee: 599,
      acqFee: 650,
      dmvFee: 300,
      junkFee: 1295,
      residual: 60,
      mf: 0.0021,
      term: 36,
      miles: 10000,
      downPayment: 0,
      taxRate: 0,
      notes: "Demo warning deal. Dealer add-ons entered to show red flag.",
      createdAt: new Date().toLocaleString()
    }
  ];

  saveStorage();
  renderVehicles();
}

updateModels();
renderVehicles();
