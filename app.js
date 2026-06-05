let deals = JSON.parse(localStorage.getItem("vindeal_offers")) || [];

function money(value) {
  return "$" + Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function num(id) {
  return Number(document.getElementById(id).value) || 0;
}

function txt(id) {
  return document.getElementById(id).value.trim();
}

function checked(id) {
  return document.getElementById(id).checked;
}

function saveStorage() {
  localStorage.setItem("vindeal_offers", JSON.stringify(deals));
}

function totalManufacturerRebates(deal) {
  return (
    Number(deal.manufacturerRebate || 0) +
    Number(deal.leaseCash || 0) +
    Number(deal.evCredit || 0) +
    Number(deal.loyaltyConquest || 0) +
    Number(deal.bonusCash || 0)
  );
}

function totalFees(deal) {
  return (
    Number(deal.docFee || 0) +
    Number(deal.acquisitionFee || 0) +
    Number(deal.dmvFee || 0) +
    Number(deal.junkFees || 0)
  );
}

function calculateLease(deal) {
  const msrp = Number(deal.msrp || 0);
  const dealerDiscount = Number(deal.dealerDiscount || 0);
  const rebates = totalManufacturerRebates(deal);
  const fees = totalFees(deal);
  const tradeCredit = Number(deal.tradeCredit || 0);
  const downPayment = Number(deal.downPayment || 0);
  const residualPercent = Number(deal.residualPercent || 0);
  const moneyFactor = Number(deal.moneyFactor || 0);
  const term = Number(deal.term || 36);
  const taxPercent = Number(deal.taxPercent || 0);

  const sellingPrice = msrp - dealerDiscount;
  const netCapCost = sellingPrice - rebates + fees - tradeCredit - downPayment;
  const residualValue = msrp * (residualPercent / 100);

  const depreciationCharge = (netCapCost - residualValue) / term;
  const financeCharge = (netCapCost + residualValue) * moneyFactor;
  const basePayment = depreciationCharge + financeCharge;
  const taxAmount = basePayment * (taxPercent / 100);
  const monthlyPayment = basePayment + taxAmount;

  const totalSavings = dealerDiscount + rebates;
  const discountPercent = msrp > 0 ? (totalSavings / msrp) * 100 : 0;

  return {
    rebates,
    fees,
    sellingPrice,
    netCapCost,
    residualValue,
    depreciationCharge,
    financeCharge,
    basePayment,
    taxAmount,
    monthlyPayment,
    totalSavings,
    discountPercent
  };
}

function getScore(deal) {
  const calc = calculateLease(deal);

  let score = 1000;

  score -= calc.monthlyPayment;
  score += Number(deal.dealerDiscount || 0) / 80;
  score += calc.rebates / 150;
  score -= Number(deal.junkFees || 0) / 12;
  score -= Number(deal.docFee || 0) / 75;

  if (deal.features.preferredColor) score += 40;
  if (deal.features.captainChairs) score += 20;
  if (deal.features.sunroof) score += 15;
  if (deal.features.panoramicRoof) score += 15;
  if (deal.features.heatedWheel) score += 10;
  if (deal.features.ventilatedSeats) score += 10;
  if (deal.features.hud) score += 8;
  if (deal.features.premiumSound) score += 8;
  if (deal.features.towPackage) score += 6;
  if (deal.features.thirdRow) score += 6;

  return score;
}

function getGrade(deal) {
  const calc = calculateLease(deal);
  const junkFees = Number(deal.junkFees || 0);

  if (junkFees >= 2000) return "Bad - Heavy Junk Fees";
  if (junkFees >= 1000) return "Warning - Add-ons";
  if (calc.monthlyPayment <= 550) return "Excellent";
  if (calc.monthlyPayment <= 650) return "Good";
  if (calc.monthlyPayment <= 750) return "Fair";
  return "Expensive";
}

function saveDeal() {
  const editId = document.getElementById("editId").value;

  const deal = {
    id: editId ? Number(editId) : Date.now(),

    vehicleName: txt("vehicleName"),
    vin: txt("vin"),
    vehicleLink: txt("vehicleLink"),
    brand: txt("brand"),
    model: txt("model"),
    year: num("year"),
    trim: txt("trim"),
    exteriorColor: txt("exteriorColor"),
    interiorColor: txt("interiorColor"),
    drivetrain: txt("drivetrain"),
    seats: txt("seats"),
    status: txt("status"),

    dealerName: txt("dealerName"),
    dealerCity: txt("dealerCity"),
    dealerState: txt("dealerState"),
    salesperson: txt("salesperson"),
    dealerPhone: txt("dealerPhone"),
    dealerEmail: txt("dealerEmail"),

    manufacturerRebate: num("manufacturerRebate"),
    leaseCash: num("leaseCash"),
    evCredit: num("evCredit"),
    loyaltyConquest: num("loyaltyConquest"),
    bonusCash: num("bonusCash"),
    rebateExpiration: txt("rebateExpiration"),
    rebateSourceLink: txt("rebateSourceLink"),

    msrp: num("msrp"),
    dealerDiscount: num("dealerDiscount"),
    docFee: num("docFee"),
    acquisitionFee: num("acquisitionFee"),
    dmvFee: num("dmvFee"),
    junkFees: num("junkFees"),
    tradeCredit: num("tradeCredit"),
    downPayment: num("downPayment"),
    dueAtSigning: num("dueAtSigning"),
    residualPercent: num("residualPercent"),
    moneyFactor: num("moneyFactor"),
    term: num("term"),
    miles: num("miles"),
    taxPercent: num("taxPercent"),

    features: {
      sunroof: checked("sunroof"),
      heatedWheel: checked("heatedWheel"),
      captainChairs: checked("captainChairs"),
      ventilatedSeats: checked("ventilatedSeats"),
      hud: checked("hud"),
      premiumSound: checked("premiumSound"),
      towPackage: checked("towPackage"),
      thirdRow: checked("thirdRow"),
      panoramicRoof: checked("panoramicRoof"),
      preferredColor: checked("preferredColor")
    },

    notes: txt("notes"),
    updatedAt: new Date().toLocaleString()
  };

  if (!deal.vehicleName && !deal.vin && !deal.dealerName) {
    alert("Add at least vehicle name, VIN, or dealer name.");
    return;
  }

  if (editId) {
    deals = deals.map(item => item.id === Number(editId) ? deal : item);
  } else {
    deals.push(deal);
  }

  saveStorage();
  resetForm();
  renderDeals();
}

function resetForm() {
  document.getElementById("editId").value = "";

  document.querySelectorAll("input, textarea, select").forEach(field => {
    if (field.type === "checkbox") {
      field.checked = false;
    } else if (field.id !== "editId") {
      field.value = "";
    }
  });

  document.getElementById("status").value = "New Lead";
}

function editDeal(id) {
  const deal = deals.find(item => item.id === id);
  if (!deal) return;

  document.getElementById("editId").value = deal.id;

  setValue("vehicleName", deal.vehicleName);
  setValue("vin", deal.vin);
  setValue("vehicleLink", deal.vehicleLink);
  setValue("brand", deal.brand);
  setValue("model", deal.model);
  setValue("year", deal.year);
  setValue("trim", deal.trim);
  setValue("exteriorColor", deal.exteriorColor);
  setValue("interiorColor", deal.interiorColor);
  setValue("drivetrain", deal.drivetrain);
  setValue("seats", deal.seats);
  setValue("status", deal.status);

  setValue("dealerName", deal.dealerName);
  setValue("dealerCity", deal.dealerCity);
  setValue("dealerState", deal.dealerState);
  setValue("salesperson", deal.salesperson);
  setValue("dealerPhone", deal.dealerPhone);
  setValue("dealerEmail", deal.dealerEmail);

  setValue("manufacturerRebate", deal.manufacturerRebate);
  setValue("leaseCash", deal.leaseCash);
  setValue("evCredit", deal.evCredit);
  setValue("loyaltyConquest", deal.loyaltyConquest);
  setValue("bonusCash", deal.bonusCash);
  setValue("rebateExpiration", deal.rebateExpiration);
  setValue("rebateSourceLink", deal.rebateSourceLink);

  setValue("msrp", deal.msrp);
  setValue("dealerDiscount", deal.dealerDiscount);
  setValue("docFee", deal.docFee);
  setValue("acquisitionFee", deal.acquisitionFee);
  setValue("dmvFee", deal.dmvFee);
  setValue("junkFees", deal.junkFees);
  setValue("tradeCredit", deal.tradeCredit);
  setValue("downPayment", deal.downPayment);
  setValue("dueAtSigning", deal.dueAtSigning);
  setValue("residualPercent", deal.residualPercent);
  setValue("moneyFactor", deal.moneyFactor);
  setValue("term", deal.term);
  setValue("miles", deal.miles);
  setValue("taxPercent", deal.taxPercent);

  setCheck("sunroof", deal.features.sunroof);
  setCheck("heatedWheel", deal.features.heatedWheel);
  setCheck("captainChairs", deal.features.captainChairs);
  setCheck("ventilatedSeats", deal.features.ventilatedSeats);
  setCheck("hud", deal.features.hud);
  setCheck("premiumSound", deal.features.premiumSound);
  setCheck("towPackage", deal.features.towPackage);
  setCheck("thirdRow", deal.features.thirdRow);
  setCheck("panoramicRoof", deal.features.panoramicRoof);
  setCheck("preferredColor", deal.features.preferredColor);

  setValue("notes", deal.notes);

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setValue(id, value) {
  document.getElementById(id).value = value || "";
}

function setCheck(id, value) {
  document.getElementById(id).checked = Boolean(value);
}

function duplicateDeal(id) {
  const deal = deals.find(item => item.id === id);
  if (!deal) return;

  const copy = JSON.parse(JSON.stringify(deal));
  copy.id = Date.now();
  copy.vehicleName = `${deal.vehicleName || "Vehicle"} Copy`;
  copy.status = "New Lead";
  copy.updatedAt = new Date().toLocaleString();

  deals.push(copy);
  saveStorage();
  renderDeals();
}

function deleteDeal(id) {
  if (!confirm("Delete this offer?")) return;

  deals = deals.filter(item => item.id !== id);
  saveStorage();
  renderDeals();
}

function clearAllDeals() {
  if (!confirm("Delete all offers?")) return;

  deals = [];
  saveStorage();
  renderDeals();
}

function featureBadges(deal) {
  const features = [];

  if (deal.features.sunroof) features.push("Sunroof");
  if (deal.features.heatedWheel) features.push("Heated Wheel");
  if (deal.features.captainChairs) features.push("Captain Chairs");
  if (deal.features.ventilatedSeats) features.push("Ventilated Seats");
  if (deal.features.hud) features.push("HUD");
  if (deal.features.premiumSound) features.push("Premium Sound");
  if (deal.features.towPackage) features.push("Tow Package");
  if (deal.features.thirdRow) features.push("Third Row");
  if (deal.features.panoramicRoof) features.push("Panoramic Roof");
  if (deal.features.preferredColor) features.push("Preferred Color");

  if (features.length === 0) {
    return `<span class="badge badge-gray">No features marked</span>`;
  }

  return features.map(item => `<span class="badge">${item}</span>`).join("");
}

function passesFilters(deal) {
  const search = txt("searchFilter").toLowerCase();
  const maxPayment = num("maxPaymentFilter");
  const brand = txt("brandFilter").toLowerCase();
  const model = txt("modelFilter").toLowerCase();
  const trim = txt("trimFilter").toLowerCase();
  const color = txt("colorFilter").toLowerCase();

  const calc = calculateLease(deal);

  const fullText = `
    ${deal.vehicleName}
    ${deal.vin}
    ${deal.brand}
    ${deal.model}
    ${deal.trim}
    ${deal.exteriorColor}
    ${deal.interiorColor}
    ${deal.dealerName}
    ${deal.dealerCity}
    ${deal.dealerState}
  `.toLowerCase();

  if (search && !fullText.includes(search)) return false;
  if (maxPayment && calc.monthlyPayment > maxPayment) return false;
  if (brand && !String(deal.brand || "").toLowerCase().includes(brand)) return false;
  if (model && !String(deal.model || "").toLowerCase().includes(model)) return false;
  if (trim && !String(deal.trim || "").toLowerCase().includes(trim)) return false;

  const colorText = `${deal.exteriorColor || ""} ${deal.interiorColor || ""}`.toLowerCase();
  if (color && !colorText.includes(color)) return false;

  if (checked("filterSunroof") && !deal.features.sunroof) return false;
  if (checked("filterHeatedWheel") && !deal.features.heatedWheel) return false;
  if (checked("filterCaptainChairs") && !deal.features.captainChairs) return false;
  if (checked("filterPreferredColor") && !deal.features.preferredColor) return false;

  return true;
}

function renderDashboard(filteredDeals) {
  const dashboard = document.getElementById("dashboard");

  if (filteredDeals.length === 0) {
    dashboard.innerHTML = `
      <div class="empty">No offers yet. Add a vehicle or click Load Demo Data.</div>
    `;
    return;
  }

  const sortedByPayment = [...filteredDeals].sort((a, b) => {
    return calculateLease(a).monthlyPayment - calculateLease(b).monthlyPayment;
  });

  const sortedByScore = [...filteredDeals].sort((a, b) => {
    return getScore(b) - getScore(a);
  });

  const lowest = sortedByPayment[0];
  const best = sortedByScore[0];

  const averagePayment =
    filteredDeals.reduce((sum, deal) => sum + calculateLease(deal).monthlyPayment, 0) / filteredDeals.length;

  const junkCount = filteredDeals.filter(deal => Number(deal.junkFees || 0) > 0).length;

  const totalRebates = filteredDeals.reduce((sum, deal) => {
    return sum + totalManufacturerRebates(deal);
  }, 0);

  dashboard.innerHTML = `
    <div class="stat-card stat-green">
      <h3>Best Overall</h3>
      <strong>${best.dealerName || "Unknown"}</strong>
      <span>${money(calculateLease(best).monthlyPayment)} / mo</span>
    </div>

    <div class="stat-card">
      <h3>Lowest Payment</h3>
      <strong>${money(calculateLease(lowest).monthlyPayment)}</strong>
      <span>${lowest.dealerName || "Unknown Dealer"}</span>
    </div>

    <div class="stat-card">
      <h3>Average Payment</h3>
      <strong>${money(averagePayment)}</strong>
      <span>${filteredDeals.length} offers</span>
    </div>

    <div class="stat-card stat-red">
      <h3>Junk Fee Offers</h3>
      <strong>${junkCount}</strong>
      <span>Marked in red</span>
    </div>

    <div class="stat-card stat-yellow">
      <h3>Total Rebates Entered</h3>
      <strong>${money(totalRebates)}</strong>
      <span>Manual manufacturer incentives</span>
    </div>
  `;
}

function renderDeals() {
  const list = document.getElementById("dealsList");

  const filteredDeals = deals
    .filter(passesFilters)
    .sort((a, b) => getScore(b) - getScore(a));

  renderDashboard(filteredDeals);

  if (filteredDeals.length === 0) {
    list.innerHTML = `<div class="empty">No saved offers match your filters.</div>`;
    return;
  }

  list.innerHTML = filteredDeals.map((deal, index) => {
    const calc = calculateLease(deal);
    const grade = getGrade(deal);
    const isBest = index === 0;
    const hasJunk = Number(deal.junkFees || 0) > 0;

    return `
      <div class="deal-card ${isBest ? "best" : ""}">
        <div class="deal-header">

          <div class="deal-title">
            <h3>${isBest ? "🏆 " : ""}#${index + 1} ${deal.vehicleName || "Unnamed Vehicle"}</h3>

            <p>
              <strong>VIN:</strong> ${deal.vin || "-"}
              ${deal.vehicleLink ? ` | <a href="${deal.vehicleLink}" target="_blank">Open Listing</a>` : ""}
            </p>

            <p>
              <strong>${deal.year || ""} ${deal.brand || ""} ${deal.model || ""}</strong>
              ${deal.trim ? ` | ${deal.trim}` : ""}
            </p>

            <p>
              <strong>Color:</strong> ${deal.exteriorColor || "-"} / ${deal.interiorColor || "-"}
              ${deal.drivetrain ? ` | <strong>Drive:</strong> ${deal.drivetrain}` : ""}
              ${deal.seats ? ` | <strong>Seats:</strong> ${deal.seats}` : ""}
            </p>

            <p>
              <strong>Dealer:</strong> ${deal.dealerName || "-"}
              ${deal.dealerCity || deal.dealerState ? ` | ${deal.dealerCity || ""}, ${deal.dealerState || ""}` : ""}
            </p>

            <p>
              <strong>Contact:</strong>
              ${deal.salesperson || "-"}
              ${deal.dealerPhone ? ` | ${deal.dealerPhone}` : ""}
              ${deal.dealerEmail ? ` | ${deal.dealerEmail}` : ""}
            </p>

            <div class="badges">
              <span class="badge badge-gray">${deal.status || "New Lead"}</span>
              <span class="badge ${hasJunk ? "badge-red" : "badge-green"}">
                ${hasJunk ? "Junk Fees Found" : "No Junk Fees"}
              </span>
              <span class="badge ${grade.includes("Bad") || grade.includes("Expensive") || grade.includes("Warning") ? "badge-red" : "badge-green"}">
                ${grade}
              </span>
              ${featureBadges(deal)}
            </div>
          </div>

          <div class="payment-box">
            <div class="payment">${money(calc.monthlyPayment)}</div>
            <div class="payment-label">Estimated Monthly Payment</div>
            <div class="payment-label">Score: ${getScore(deal).toFixed(0)}</div>
          </div>

        </div>

        <div class="numbers-grid">
          <div class="data-box">
            <span>MSRP</span>
            <strong>${money(deal.msrp)}</strong>
          </div>

          <div class="data-box">
            <span>Dealer Discount</span>
            <strong class="good-text">${money(deal.dealerDiscount)}</strong>
          </div>

          <div class="data-box">
            <span>Total Rebates</span>
            <strong class="good-text">${money(calc.rebates)}</strong>
          </div>

          <div class="data-box">
            <span>Junk Fees</span>
            <strong class="${hasJunk ? "junk-text" : ""}">${money(deal.junkFees)}</strong>
          </div>

          <div class="data-box">
            <span>Total Fees</span>
            <strong>${money(calc.fees)}</strong>
          </div>

          <div class="data-box">
            <span>Selling Price</span>
            <strong>${money(calc.sellingPrice)}</strong>
          </div>

          <div class="data-box">
            <span>Net Cap Cost</span>
            <strong>${money(calc.netCapCost)}</strong>
          </div>

          <div class="data-box">
            <span>Residual Value</span>
            <strong>${money(calc.residualValue)}</strong>
          </div>

          <div class="data-box">
            <span>Residual %</span>
            <strong>${deal.residualPercent || 0}%</strong>
          </div>

          <div class="data-box">
            <span>Money Factor</span>
            <strong>${deal.moneyFactor || 0}</strong>
          </div>

          <div class="data-box">
            <span>APR Approx.</span>
            <strong>${((Number(deal.moneyFactor || 0)) * 2400).toFixed(2)}%</strong>
          </div>

          <div class="data-box">
            <span>Term / Miles</span>
            <strong>${deal.term || 0} mo / ${deal.miles || 0}</strong>
          </div>

          <div class="data-box">
            <span>Due At Signing</span>
            <strong>${money(deal.dueAtSigning)}</strong>
          </div>

          <div class="data-box">
            <span>Total Savings</span>
            <strong class="good-text">${money(calc.totalSavings)}</strong>
          </div>

          <div class="data-box">
            <span>Discount %</span>
            <strong>${calc.discountPercent.toFixed(2)}%</strong>
          </div>

          <div class="data-box">
            <span>Rebate Expires</span>
            <strong>${deal.rebateExpiration || "-"}</strong>
          </div>

          <div class="data-box">
            <span>Lease Cash</span>
            <strong>${money(deal.leaseCash)}</strong>
          </div>

          <div class="data-box">
            <span>EV Credit</span>
            <strong>${money(deal.evCredit)}</strong>
          </div>
        </div>

        ${deal.rebateSourceLink ? `
          <p>
            <strong>Manufacturer Offer Source:</strong>
            <a href="${deal.rebateSourceLink}" target="_blank">Open Rebate Source</a>
          </p>
        ` : ""}

        ${deal.notes ? `
          <div class="notes-box">
            <strong>Notes:</strong> ${deal.notes}
          </div>
        ` : ""}

        <div class="actions">
          <button class="btn primary" onclick="generateDealerMessage(${deal.id})">Generate Message</button>
          <button class="btn secondary" onclick="editDeal(${deal.id})">Edit</button>
          <button class="btn secondary" onclick="duplicateDeal(${deal.id})">Duplicate</button>
          <button class="btn danger" onclick="deleteDeal(${deal.id})">Delete</button>
        </div>
      </div>
    `;
  }).join("");
}

function generateDealerMessage(id) {
  const deal = deals.find(item => item.id === id);
  if (!deal) return;

  const calc = calculateLease(deal);

  const message = `Hello,

My name is Zack.

I am interested in leasing this vehicle:

${deal.vehicleName || ""}
VIN: ${deal.vin || ""}
Year/Make/Model: ${deal.year || ""} ${deal.brand || ""} ${deal.model || ""}
Trim: ${deal.trim || ""}
Exterior: ${deal.exteriorColor || ""}
Interior: ${deal.interiorColor || ""}
Link: ${deal.vehicleLink || ""}

Please send me your best lease quote with a full itemized breakdown.

The numbers I currently have are:

MSRP: ${money(deal.msrp)}
Dealer Discount: ${money(deal.dealerDiscount)}

Manufacturer Rebate: ${money(deal.manufacturerRebate)}
Lease Cash: ${money(deal.leaseCash)}
EV Credit: ${money(deal.evCredit)}
Loyalty / Conquest: ${money(deal.loyaltyConquest)}
Bonus Cash: ${money(deal.bonusCash)}
Total Rebates: ${money(calc.rebates)}

Doc Fee: ${money(deal.docFee)}
Acquisition Fee: ${money(deal.acquisitionFee)}
DMV / Tag / Title: ${money(deal.dmvFee)}
Dealer Add-ons / Junk Fees: ${money(deal.junkFees)}

Residual: ${deal.residualPercent || 0}%
Money Factor: ${deal.moneyFactor || 0}
Term: ${deal.term || 0} months
Miles: ${deal.miles || 0} per year
Down Payment: ${money(deal.downPayment)}
Due At Signing: ${money(deal.dueAtSigning)}

Based on these numbers, my estimated payment is:
${money(calc.monthlyPayment)} per month.

Please confirm:

1. Selling price before rebates
2. All manufacturer rebates included
3. Dealer discount
4. Money factor
5. Residual
6. Acquisition fee
7. Doc fee
8. DMV, tag, and title fees
9. Any dealer add-ons or required packages
10. Total due at signing
11. Final monthly payment including tax

Please remove any optional dealer add-ons or packages.

Thank you.`;

  document.getElementById("dealerMessageText").value = message;
  document.getElementById("messageModal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("messageModal").classList.add("hidden");
}

function copyDealerMessage() {
  const box = document.getElementById("dealerMessageText");
  box.select();
  document.execCommand("copy");
  alert("Message copied.");
}

function loadDemoData() {
  const demoDeals = [
    {
      id: Date.now() + 1,
      vehicleName: "2026 Hyundai IONIQ 9 Performance Limited White/Gray",
      vin: "7YAMWFS55TY010209",
      vehicleLink: "https://www.hyundaiusa.com/us/en/offers",
      brand: "Hyundai",
      model: "IONIQ 9",
      year: 2026,
      trim: "Performance Limited",
      exteriorColor: "White",
      interiorColor: "Gray",
      drivetrain: "AWD",
      seats: "6 Seats",
      status: "Quoted",

      dealerName: "Hyundai of Columbia",
      dealerCity: "Columbia",
      dealerState: "SC",
      salesperson: "",
      dealerPhone: "",
      dealerEmail: "",

      manufacturerRebate: 0,
      leaseCash: 12700,
      evCredit: 0,
      loyaltyConquest: 0,
      bonusCash: 0,
      rebateExpiration: "",
      rebateSourceLink: "https://www.hyundaiusa.com/us/en/offers",

      msrp: 74020,
      dealerDiscount: 4000,
      docFee: 499,
      acquisitionFee: 650,
      dmvFee: 300,
      junkFees: 0,
      tradeCredit: 0,
      downPayment: 0,
      dueAtSigning: 0,
      residualPercent: 58,
      moneyFactor: 0.00222,
      term: 36,
      miles: 10000,
      taxPercent: 0,

      features: {
        sunroof: true,
        heatedWheel: true,
        captainChairs: true,
        ventilatedSeats: true,
        hud: true,
        premiumSound: true,
        towPackage: false,
        thirdRow: true,
        panoramicRoof: true,
        preferredColor: true
      },

      notes: "Demo offer. Update numbers with real dealer worksheet.",
      updatedAt: new Date().toLocaleString()
    },
    {
      id: Date.now() + 2,
      vehicleName: "2026 Hyundai IONIQ 9 SEL Gray/Black",
      vin: "7YAMUFS35TY002213",
      vehicleLink: "https://www.hyundaiusa.com/us/en/offers",
      brand: "Hyundai",
      model: "IONIQ 9",
      year: 2026,
      trim: "SEL",
      exteriorColor: "Gray",
      interiorColor: "Black",
      drivetrain: "AWD",
      seats: "7 Seats",
      status: "Waiting For Quote",

      dealerName: "AutoNation Hyundai Columbia",
      dealerCity: "Columbia",
      dealerState: "SC",
      salesperson: "",
      dealerPhone: "",
      dealerEmail: "",

      manufacturerRebate: 0,
      leaseCash: 10000,
      evCredit: 0,
      loyaltyConquest: 0,
      bonusCash: 0,
      rebateExpiration: "",
      rebateSourceLink: "https://www.hyundaiusa.com/us/en/offers",

      msrp: 62000,
      dealerDiscount: 2500,
      docFee: 599,
      acquisitionFee: 650,
      dmvFee: 300,
      junkFees: 1295,
      tradeCredit: 0,
      downPayment: 0,
      dueAtSigning: 0,
      residualPercent: 60,
      moneyFactor: 0.0021,
      term: 36,
      miles: 10000,
      taxPercent: 0,

      features: {
        sunroof: false,
        heatedWheel: true,
        captainChairs: false,
        ventilatedSeats: false,
        hud: false,
        premiumSound: false,
        towPackage: false,
        thirdRow: true,
        panoramicRoof: false,
        preferredColor: true
      },

      notes: "Demo with junk fee to show red warning.",
      updatedAt: new Date().toLocaleString()
    }
  ];

  deals = demoDeals;
  saveStorage();
  renderDeals();
}

renderDeals();
