type SearchBody = {
  zipCode?: string;
  radius?: number;
  brand?: string;
  model?: string;
  trim?: string;
  year?: number;
  progressMode?: string;
};

const SCANNER_VERSION = "2026-06-07-sitemap-vin-v4";

type Dealer = {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  website?: string;
  google_rating?: number;
  latitude?: number;
  longitude?: number;
  distance_miles?: number;
  place_id?: string;
};

type Vehicle = {
  vin: string;
  year?: number;
  brand?: string;
  model?: string;
  trim?: string;
  stock_number?: string;
  msrp?: number;
  sale_price?: number;
  listing_url?: string;
  window_sticker_url?: string;
  image_url?: string;
  exterior_color?: string;
  interior_color?: string;
  dealer_name?: string;
  dealer_city?: string;
  dealer_state?: string;
  dealer_phone?: string;
  dealer_website?: string;
  dealer_address?: string;
  dealer_distance_miles?: number;
  raw_data?: Record<string, unknown>;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const USER_AGENT = "VINDealBot/0.1 (+https://oceanvacationsmb.github.io/vindeal/; public inventory transparency)";
const MAX_DEALERS_TO_SCAN = 12;
const MAX_PAGES_PER_DEALER = 10;
const MAX_HTML_CHARS = 900_000;
const MAX_SITEMAP_VEHICLES_PER_DEALER = 60;
const MAX_DETAIL_PAGES_PER_DEALER = 25;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Use POST." }, 405);
  }

  const body = (await request.json().catch(() => ({}))) as SearchBody;

  if (body.progressMode === "ndjson") {
    return streamSearch(body);
  }

  const events: unknown[] = [];
  const result = await runSearch(body, (event) => {
    events.push(event);
  });

  return jsonResponse({ ...result, events });
});

async function streamSearch(body: SearchBody) {
  const encoder = new TextEncoder();
  let sendEvent: (event: Record<string, unknown>) => void = () => {};

  const stream = new ReadableStream({
    start(controller) {
      sendEvent = (event) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      runSearch(body, sendEvent)
        .then((result) => {
          sendEvent({ type: "done", percent: 100, data: result });
          controller.close();
        })
        .catch((error) => {
          sendEvent({ type: "error", percent: 100, error: errorMessage(error) });
          controller.close();
        });
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function runSearch(body: SearchBody, emit: (event: Record<string, unknown>) => void) {
  const googleKey = Deno.env.get("GOOGLE_PLACES_API_KEY") || "";
  if (!googleKey) {
    throw new Error("Missing GOOGLE_PLACES_API_KEY Supabase secret.");
  }

  const zipCode = String(body.zipCode || "").trim();
  const radius = clamp(Number(body.radius || 50), 1, 1000);
  const brand = cleanText(body.brand || "Hyundai");
  const model = cleanText(body.model || "");
  const year = Number(body.year || 0);

  emit({
    type: "progress",
    percent: 0,
    title: "Starting search",
    message: `Preparing ${brand} dealer search near ${zipCode}.`,
  });

  const origin = await geocodeZip(zipCode, googleKey);
  emit({
    type: "progress",
    percent: 8,
    title: "ZIP located",
    message: `${zipCode} mapped to ${origin.latitude.toFixed(4)}, ${origin.longitude.toFixed(4)}.`,
  });

  const dealers = await findDealers({ brand, zipCode, radius, origin, googleKey, emit });

  if (!dealers.length) {
    return {
      ok: true,
      scanner_version: SCANNER_VERSION,
      search_source: "Google Places dealer discovery + compliant dealer-site scan",
      dealers: [],
      vehicles: [],
      count: 0,
      lease_program: null,
      notes: ["No dealers returned by Google Places for this search."],
    };
  }

  const vehicles: Vehicle[] = [];
  const notes: string[] = [];
  const dealersToScan = dealers.filter((dealer) => dealer.website).slice(0, MAX_DEALERS_TO_SCAN);

  for (let index = 0; index < dealersToScan.length; index += 1) {
    const dealer = dealersToScan[index];
    const percent = progressBetween(38, 90, index, dealersToScan.length);
    emit({
      type: "progress",
      percent,
      title: `Checking ${dealer.name}`,
      message: "Reading public inventory pages if allowed by robots.txt.",
    });

    try {
      const found = await scanDealerInventory(dealer, { brand, model, year });
      vehicles.push(...found);
      emit({
        type: "inventory_found",
        percent: Math.min(98, percent + 3),
        dealer_name: dealer.name,
        vehicles: found,
      });
    } catch (error) {
      notes.push(`${dealer.name}: ${errorMessage(error)}`);
      emit({
        type: "progress",
        percent: Math.min(98, percent + 2),
        title: `${dealer.name} skipped`,
        message: errorMessage(error),
      });
    }
  }

  const uniqueVehicles = uniqueVehiclesByVin(vehicles).sort(
    (a, b) => Number(a.dealer_distance_miles || 0) - Number(b.dealer_distance_miles || 0)
  );

  emit({
    type: "progress",
    percent: 100,
    title: "Search complete",
    message: `${dealers.length} dealers found, ${uniqueVehicles.length} vehicles extracted.`,
  });

  return {
    ok: true,
    scanner_version: SCANNER_VERSION,
    search_source: "Google Places dealer discovery + compliant dealer-site scan",
    dealers,
    vehicles: uniqueVehicles,
    count: uniqueVehicles.length,
    lease_program: null,
    notes,
  };
}

async function geocodeZip(zipCode: string, googleKey: string) {
  const publicZip = await geocodeZipWithPublicApi(zipCode).catch((error) => {
    console.warn(`Public ZIP lookup failed for ${zipCode}: ${errorMessage(error)}`);
    return null;
  });
  if (publicZip) return publicZip;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", `${zipCode}, USA`);
  url.searchParams.set("components", "country:US");
  url.searchParams.set("key", googleKey);

  const data = await fetchJson(url.toString());
  if (data?.status && data.status !== "OK") {
    throw new Error(data.error_message || `Google Geocoding returned ${data.status} for ZIP ${zipCode}.`);
  }

  const location = data?.results?.[0]?.geometry?.location;

  if (!location) {
    throw new Error(`Could not locate ZIP ${zipCode}. Check that the ZIP is valid and Geocoding API is enabled.`);
  }

  return {
    latitude: Number(location.lat),
    longitude: Number(location.lng),
  };
}

async function geocodeZipWithPublicApi(zipCode: string) {
  const data = await fetchJson(`https://api.zippopotam.us/us/${encodeURIComponent(zipCode)}`);
  const place = data?.places?.[0];

  if (!place) return null;

  return {
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
  };
}

async function findDealers({
  brand,
  zipCode,
  radius,
  origin,
  googleKey,
  emit,
}: {
  brand: string;
  zipCode: string;
  radius: number;
  origin: { latitude: number; longitude: number };
  googleKey: string;
  emit: (event: Record<string, unknown>) => void;
}) {
  const points = buildSearchPoints(origin, radius);
  const dealersByPlaceId = new Map<string, Dealer>();

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    emit({
      type: "progress",
      percent: progressBetween(10, 30, index, points.length),
      title: "Searching dealer area",
      message: `Area ${index + 1} of ${points.length} for ${brand} dealers.`,
    });

    const places = await searchDealerPoint({ brand, point, googleKey });

    places.forEach((place: Record<string, unknown>) => {
      const name = cleanText((place.displayName as Record<string, string> | undefined)?.text || "");
      if (!name.toLowerCase().includes(brand.toLowerCase())) return;

      const loc = (place.location || {}) as Record<string, number>;
      const distance = distanceMiles(origin, { latitude: loc.latitude, longitude: loc.longitude });
      if (distance > radius) return;

      const address = String(place.formattedAddress || "");
      const cityState = parseCityState(address);
      const dealer = {
        name,
        address,
        city: cityState.city,
        state: cityState.state,
        phone: String(place.nationalPhoneNumber || ""),
        website: String(place.websiteUri || ""),
        google_rating: Number(place.rating || 0) || undefined,
        latitude: loc.latitude,
        longitude: loc.longitude,
        distance_miles: Math.round(distance * 10) / 10,
        place_id: String(place.id || name),
      };

      if (!dealer.website && !dealer.phone) return;
      if (dealersByPlaceId.has(dealer.place_id)) return;

      dealersByPlaceId.set(dealer.place_id, dealer);
      emit({
        type: "dealer_found",
        percent: progressBetween(12, 35, dealersByPlaceId.size, Math.max(dealersByPlaceId.size + 8, 10)),
        dealer,
        message: dealer.website ? dealer.website : dealer.address || "",
      });
    });
  }

  return [...dealersByPlaceId.values()].sort(
    (a: Dealer, b: Dealer) => Number(a.distance_miles || 0) - Number(b.distance_miles || 0)
  );
}

async function searchDealerPoint({
  brand,
  point,
  googleKey,
}: {
  brand: string;
  point: { latitude: number; longitude: number };
  googleKey: string;
}) {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": googleKey,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.nationalPhoneNumber",
        "places.websiteUri",
        "places.rating",
        "places.types",
      ].join(","),
    },
    body: JSON.stringify({
      textQuery: `${brand} dealer`,
      includedType: "car_dealer",
      maxResultCount: 20,
      locationBias: {
        circle: {
          center: {
            latitude: point.latitude,
            longitude: point.longitude,
          },
          radius: 50_000,
        },
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `Google Places failed: ${response.status}`);
  }

  return data.places || [];
}

async function scanDealerInventory(
  dealer: Dealer,
  criteria: { brand: string; model: string; year: number }
) {
  const website = normalizeUrl(dealer.website || "");
  if (!website) return [];

  const origin = new URL(website).origin;
  const sitemapVehicles = await scanDealerSitemapInventory(origin, dealer, criteria);
  if (sitemapVehicles.length) return sitemapVehicles;

  const candidates = await discoverInventoryPages(origin, website, criteria);
  const vehicles: Vehicle[] = [];

  for (const candidate of candidates.slice(0, MAX_PAGES_PER_DEALER)) {
    if (!(await isAllowedByRobots(candidate))) {
      continue;
    }

    try {
      const html = await fetchHtml(candidate);
      const extracted = extractVehiclesFromHtml(html, candidate, dealer, criteria);
      vehicles.push(...extracted);
    } catch (error) {
      console.warn(`${dealer.name} candidate skipped ${candidate}: ${errorMessage(error)}`);
    }

    if (vehicles.length >= 20) break;
  }

  return uniqueVehiclesByVin(vehicles);
}

async function scanDealerSitemapInventory(
  origin: string,
  dealer: Dealer,
  criteria: { brand: string; model: string; year: number }
) {
  const sitemapUrl = new URL("/sitemap.xml", origin).toString();
  if (!(await isAllowedByRobots(sitemapUrl))) return [];

  const xml = await fetchHtml(sitemapUrl).catch(() => "");
  if (!xml) return [];

  const locs = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => decodeHtmlEntities(match[1]).trim())
    .map((url) => safeUrl(url, origin))
    .filter(Boolean);

  const vehicles = locs
    .map((url) => vehicleFromDetailUrl(url, dealer, criteria))
    .filter(Boolean)
    .slice(0, MAX_SITEMAP_VEHICLES_PER_DEALER) as Vehicle[];

  const enriched: Vehicle[] = [];
  for (const vehicle of vehicles.slice(0, MAX_DETAIL_PAGES_PER_DEALER)) {
    enriched.push(await enrichVehicleFromDetailPage(vehicle, dealer, criteria));
  }

  return uniqueVehiclesByVin([...enriched, ...vehicles.slice(MAX_DETAIL_PAGES_PER_DEALER)]);
}

async function enrichVehicleFromDetailPage(
  vehicle: Vehicle,
  dealer: Dealer,
  criteria: { brand: string; model: string; year: number }
) {
  const detailUrl = vehicle.listing_url || "";
  if (!detailUrl || !(await isAllowedByRobots(detailUrl))) return vehicle;

  try {
    const html = await fetchHtml(detailUrl);
    const extracted = extractVehiclesFromHtml(html, detailUrl, dealer, criteria).find((item) => item.vin === vehicle.vin);
    const text = stripHtml(html);

    return {
      ...vehicle,
      ...(extracted || {}),
      vin: vehicle.vin,
      listing_url: detailUrl,
      trim: extracted?.trim && extracted.trim !== "Verify" ? extracted.trim : vehicle.trim,
      msrp: extracted?.msrp || vehicle.msrp || guessPrice(text, ["MSRP", "Retail Price", "Sticker"]),
      sale_price: extracted?.sale_price || vehicle.sale_price || guessPrice(text, ["Sale Price", "Internet Price", "Dealer Price", "Price"]),
      exterior_color: extracted?.exterior_color || vehicle.exterior_color || guessColor(text, ["Exterior Color", "Exterior", "Ext. Color"]),
      interior_color: extracted?.interior_color || vehicle.interior_color || guessColor(text, ["Interior Color", "Interior", "Int. Color"]),
      image_url: extracted?.image_url || vehicle.image_url || guessImageUrl(html, vehicle.vin, detailUrl),
      window_sticker_url: extracted?.window_sticker_url || vehicle.window_sticker_url || guessStickerUrl(html, vehicle.vin, detailUrl),
      raw_data: {
        ...(vehicle.raw_data || {}),
        ...(extracted?.raw_data || {}),
        detail_page_checked: true,
      },
    };
  } catch (error) {
    console.warn(`${dealer.name} detail skipped ${detailUrl}: ${errorMessage(error)}`);
    return vehicle;
  }
}

function vehicleFromDetailUrl(
  url: string,
  dealer: Dealer,
  criteria: { brand: string; model: string; year: number }
) {
  const decodedUrl = decodeHtmlEntities(decodeURIComponent(url.replace(/\+/g, " ")));
  const vin = cleanVin(decodedUrl.match(/([A-HJ-NPR-Z0-9]{17})(?:$|[/?#])/i)?.[1] || "");
  if (!vin) return null;

  const path = new URL(url).pathname.replace(/^\/+/, "");
  const decodedPath = decodeHtmlEntities(decodeURIComponent(path.replace(/\+/g, " ")));
  const parts = decodedPath
    .split("-")
    .map((part) => cleanText(part))
    .filter(Boolean);
  const newIndex = parts.findIndex((part) => sameText(part, "new"));
  const yearIndex = parts.findIndex((part) => /^\d{4}$/.test(part));
  const brandIndex = parts.findIndex((part) => sameText(part, criteria.brand));

  if (newIndex !== 0 || yearIndex < 0 || brandIndex < 0) return null;
  if (criteria.year && Number(parts[yearIndex]) !== criteria.year) return null;

  const modelParts = normalizeSearchText(criteria.model).split(" ").filter(Boolean);
  const afterBrand = parts.slice(brandIndex + 1, Math.max(parts.length - 1, brandIndex + 1));
  const normalizedAfterBrand = normalizeSearchText(afterBrand.join(" "));
  if (!modelParts.length || !modelParts.every((part) => normalizedAfterBrand.includes(part))) return null;

  const modelEnd = findModelEndIndex(afterBrand, modelParts);
  const trim = cleanText(afterBrand.slice(modelEnd).join(" ")) || "Verify";

  return buildVehicle(vin, url, dealer, criteria, {
    trim,
    stock_number: "",
    raw_data: { source: "sitemap_vehicle_detail_url" },
  });
}

function findModelEndIndex(parts: string[], modelWords: string[]) {
  const normalizedParts = parts.map((part) => normalizeSearchText(part));
  let matched = 0;

  for (let index = 0; index < normalizedParts.length; index += 1) {
    const partWords = normalizedParts[index].split(" ").filter(Boolean);
    if (modelWords.every((word) => partWords.includes(word))) return index + 1;

    if (normalizedParts[index].includes(modelWords[matched])) {
      matched += 1;
      if (matched >= modelWords.length) return index + 1;
    }
  }

  return modelWords.length;
}

async function discoverInventoryPages(
  origin: string,
  website: string,
  criteria: { brand: string; model: string; year: number }
) {
  const modelSlug = criteria.model.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const brandSlug = criteria.brand.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const fixed = [
    "/new-inventory/",
    "/new-inventory/index.htm",
    "/new-inventory.htm",
    "/searchnew.aspx",
    "/new-vehicles/",
    "/new/",
    "/inventory/new/",
    `/new-${brandSlug}/`,
    `/new-${brandSlug}-inventory/`,
    `/new/${brandSlug}/`,
    `/new/${brandSlug}/${modelSlug}/`,
    `/inventory/new/${brandSlug}/${modelSlug}/`,
    `/all-inventory/index.htm?make=${encodeURIComponent(criteria.brand)}`,
  ];

  const found = new Set<string>();

  if (await isAllowedByRobots(website)) {
    const homepage = await fetchHtml(website).catch(() => "");
    const links = [...homepage.matchAll(/href=["']([^"']+)["']/gi)]
      .map((match) => safeUrl(match[1], origin))
      .filter(Boolean)
      .filter((url) => {
        const path = new URL(url).pathname.toLowerCase();
        return /new|inventory|vehicle|searchnew/.test(path) && !/sitemap|rss|ajax|thankyou|print-email/.test(path);
      });

    links.forEach((url) => found.add(url));
  }

  fixed.map((path) => new URL(path, origin).toString()).forEach((url) => found.add(url));

  return [...found];
}

async function isAllowedByRobots(targetUrl: string) {
  const url = new URL(targetUrl);
  const robotsUrl = `${url.origin}/robots.txt`;

  try {
    const res = await fetch(robotsUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(6000),
    });

    if (res.status === 404) return true;
    if (!res.ok) return false;

    const rules = parseRobots(await res.text());
    return rules.some((rule) => rule.allow && url.pathname.startsWith(rule.allow)) ||
      !rules.some((rule) => rule.disallow && url.pathname.startsWith(rule.disallow));
  } catch {
    return false;
  }
}

function parseRobots(text: string) {
  const rules: Array<{ allow: string; disallow: string }> = [];
  let active = false;

  text.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.split("#")[0].trim();
    const [keyRaw, ...valueParts] = line.split(":");
    const key = keyRaw?.trim().toLowerCase();
    const value = valueParts.join(":").trim();

    if (key === "user-agent") {
      active = value === "*" || value.toLowerCase().includes("vindealbot");
    }

    if (!active) return;

    if (key === "allow" && value) {
      rules.push({ allow: value, disallow: "" });
    }

    if (key === "disallow" && value) {
      rules.push({ allow: "", disallow: value });
    }
  });

  return rules;
}

async function fetchHtml(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) {
    throw new Error(`Could not read ${url}: ${res.status}`);
  }

  const html = await res.text();
  return html.slice(0, MAX_HTML_CHARS);
}

function extractVehiclesFromHtml(
  html: string,
  pageUrl: string,
  dealer: Dealer,
  criteria: { brand: string; model: string; year: number }
) {
  const vehicles = [
    ...extractVehiclesFromJsonLd(html, pageUrl, dealer, criteria),
    ...extractVehiclesFromVinBlocks(html, pageUrl, dealer, criteria),
  ];

  return uniqueVehiclesByVin(vehicles);
}

function extractVehiclesFromJsonLd(
  html: string,
  pageUrl: string,
  dealer: Dealer,
  criteria: { brand: string; model: string; year: number }
) {
  const vehicles: Vehicle[] = [];
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  scripts.forEach((script) => {
    try {
      const parsed = JSON.parse(decodeHtmlEntities(script[1].trim()));
      flattenJsonLd(parsed).forEach((item) => {
        const vin = cleanVin(item.vehicleIdentificationNumber || item.vin || item.sku || "");
        if (!vin) return;

        const name = cleanText(`${item.name || ""} ${item.model || ""}`);
        if (!matchesCriteria(name, criteria)) return;

        vehicles.push(buildVehicle(vin, pageUrl, dealer, criteria, {
          trim: guessTrim(name),
          msrp: pickPrice(item.offers?.price || item.price),
          sale_price: pickPrice(item.offers?.price || item.price),
          image_url: Array.isArray(item.image) ? item.image[0] : item.image,
          raw_data: { source: "json_ld" },
        }));
      });
    } catch {
      // Ignore malformed embedded JSON.
    }
  });

  return vehicles;
}

function extractVehiclesFromVinBlocks(
  html: string,
  pageUrl: string,
  dealer: Dealer,
  criteria: { brand: string; model: string; year: number }
) {
  const text = stripHtml(html);
  const vinMatches = [...text.matchAll(/\b[A-HJ-NPR-Z0-9]{17}\b/g)];
  const vehicles: Vehicle[] = [];

  vinMatches.forEach((match) => {
    const vin = cleanVin(match[0]);
    if (!vin) return;

    const start = Math.max(0, match.index - 700);
    const end = Math.min(text.length, match.index + 700);
    const block = text.slice(start, end);

    if (!matchesVehicleBlock(block, criteria)) return;

    vehicles.push(buildVehicle(vin, pageUrl, dealer, criteria, {
      trim: guessTrim(block),
      stock_number: guessStock(block),
      msrp: guessPrice(block, ["MSRP", "Retail Price", "Sticker"]),
      sale_price: guessPrice(block, ["Sale Price", "Internet Price", "Dealer Price"]),
      exterior_color: guessColor(block, ["Exterior", "Exterior Color", "Ext. Color"]),
      interior_color: guessColor(block, ["Interior", "Interior Color", "Int. Color"]),
      window_sticker_url: guessStickerUrl(html, vin, pageUrl),
      image_url: guessImageUrl(html, vin, pageUrl),
      raw_data: { source: "html_vin_block", confirmed_model_text: block.slice(0, 500) },
    }));
  });

  return vehicles;
}

function buildVehicle(
  vin: string,
  listingUrl: string,
  dealer: Dealer,
  criteria: { brand: string; model: string; year: number },
  extra: Partial<Vehicle>
): Vehicle {
  return {
    vin,
    year: criteria.year || undefined,
    brand: criteria.brand,
    model: criteria.model,
    trim: extra.trim || "Verify",
    stock_number: extra.stock_number || "",
    msrp: extra.msrp || 0,
    sale_price: extra.sale_price || 0,
    listing_url: listingUrl,
    window_sticker_url: extra.window_sticker_url || "",
    image_url: extra.image_url || "",
    exterior_color: extra.exterior_color || "",
    interior_color: extra.interior_color || "",
    dealer_name: dealer.name,
    dealer_city: dealer.city,
    dealer_state: dealer.state,
    dealer_phone: dealer.phone,
    dealer_website: dealer.website,
    dealer_address: dealer.address,
    dealer_distance_miles: dealer.distance_miles,
    raw_data: extra.raw_data || {},
  };
}

function flattenJsonLd(value: unknown): Array<Record<string, any>> {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);

  if (typeof value === "object") {
    const item = value as Record<string, any>;
    const graph = Array.isArray(item["@graph"]) ? item["@graph"].flatMap(flattenJsonLd) : [];
    return [item, ...graph];
  }

  return [];
}

function matchesCriteria(text: string, criteria: { brand: string; model: string; year: number }) {
  const haystack = normalizeSearchText(text);
  const modelWords = normalizeSearchText(criteria.model).split(" ").filter(Boolean);
  const yearOk = !criteria.year || haystack.includes(String(criteria.year));
  const brandOk = !criteria.brand || haystack.includes(normalizeSearchText(criteria.brand));
  const modelOk = !modelWords.length || modelWords.every((word) => haystack.includes(word));

  return yearOk && brandOk && modelOk;
}

function matchesVehicleBlock(text: string, criteria: { brand: string; model: string; year: number }) {
  const haystack = normalizeSearchText(text);
  const modelWords = normalizeSearchText(criteria.model).split(" ").filter(Boolean);
  const yearOk = !criteria.year || haystack.includes(String(criteria.year));
  const modelOk = modelWords.length > 0 && modelWords.every((word) => haystack.includes(word));
  const vehicleSignal = /\bvin\b|\bstock\b|\bmsrp\b|\bwindow sticker\b|\bexterior\b|\binterior\b/i.test(text);

  return yearOk && modelOk && vehicleSignal;
}

function guessTrim(text: string) {
  const trims = ["Limited", "Calligraphy", "SEL", "SE", "XRT", "N Line", "Blue", "Ultimate"];
  const found = trims.find((trim) => new RegExp(`\\b${trim.replace(" ", "\\s+")}\\b`, "i").test(text));
  return found || "Verify";
}

function guessStock(text: string) {
  return text.match(/\bStock\s*(?:#|Number|No\.?)?\s*[:#]?\s*([A-Z0-9-]{4,16})/i)?.[1] || "";
}

function guessPrice(text: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`${escaped}[^$0-9]{0,40}\\$?\\s*([0-9][0-9,]{3,})`, "i"));
    const price = pickPrice(match?.[1]);
    if (price) return price;
  }

  return 0;
}

function guessColor(text: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`${escaped}[^A-Za-z0-9]{0,25}([A-Za-z][A-Za-z0-9 /-]{2,40})`, "i"));
    const color = cleanText(match?.[1] || "").replace(/\bInterior\b|\bExterior\b|\bMSRP\b|\bStock\b.*$/i, "").trim();
    if (color && color.length <= 40) return color;
  }

  return "";
}

function guessStickerUrl(html: string, vin: string, pageUrl: string) {
  const match = html.match(new RegExp(`href=["']([^"']*(?:sticker|window)[^"']*${vin}[^"']*)["']`, "i")) ||
    html.match(new RegExp(`href=["']([^"']*${vin}[^"']*(?:sticker|window)[^"']*)["']`, "i"));
  return match ? safeUrl(match[1], pageUrl) : "";
}

function guessImageUrl(html: string, vin: string, pageUrl: string) {
  const match = html.match(new RegExp(`(?:src|data-src)=["']([^"']*${vin}[^"']*\\.(?:jpg|jpeg|png|webp)[^"']*)["']`, "i"));
  return match ? safeUrl(match[1], pageUrl) : "";
}

function uniqueVehiclesByVin(list: Vehicle[]) {
  const seen = new Set<string>();
  const unique: Vehicle[] = [];

  list.forEach((vehicle) => {
    if (!vehicle.vin || seen.has(vehicle.vin)) return;
    seen.add(vehicle.vin);
    unique.push(vehicle);
  });

  return unique;
}

async function fetchJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_message || data?.error?.message || `Request failed: ${res.status}`);
  return data;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function cleanText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeSearchText(value: unknown) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sameText(a: unknown, b: unknown) {
  return normalizeSearchText(a) === normalizeSearchText(b);
}

function stripHtml(html: string) {
  return decodeHtmlEntities(html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " "));
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/\s+/g, " ");
}

function cleanVin(value: unknown) {
  const vin = String(value || "").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
  return vin.length === 17 ? vin : "";
}

function pickPrice(value: unknown) {
  const price = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return price >= 1000 ? Math.round(price) : 0;
}

function normalizeUrl(value: string) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function safeUrl(value: string, base: string) {
  try {
    return new URL(value, base).toString();
  } catch {
    return "";
  }
}

function parseCityState(address: string) {
  const parts = address.split(",").map((part) => part.trim());
  const city = parts.length >= 3 ? parts[parts.length - 3] : "";
  const stateZip = parts.length >= 2 ? parts[parts.length - 2] : "";
  const state = stateZip.match(/\b[A-Z]{2}\b/)?.[0] || "";
  return { city, state };
}

function distanceMiles(
  a: { latitude?: number; longitude?: number },
  b: { latitude?: number; longitude?: number }
) {
  if (!a.latitude || !a.longitude || !b.latitude || !b.longitude) return 0;

  const radius = 3958.8;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function progressBetween(start: number, end: number, index: number, total: number) {
  if (total <= 1) return start;
  return Math.round(start + ((end - start) * index) / (total - 1));
}

function buildSearchPoints(origin: { latitude: number; longitude: number }, radiusMiles: number) {
  const points = [{ ...origin }];
  const cappedRadius = Math.min(radiusMiles, 1000);
  const ringGap = cappedRadius <= 100 ? 45 : cappedRadius <= 250 ? 70 : cappedRadius <= 500 ? 110 : 160;
  const maxPoints = cappedRadius <= 100 ? 9 : cappedRadius <= 250 ? 17 : 25;

  for (let ring = ringGap; ring <= cappedRadius && points.length < maxPoints; ring += ringGap) {
    const count = ring <= 75 ? 6 : 8;
    for (let index = 0; index < count && points.length < maxPoints; index += 1) {
      points.push(pointAtDistance(origin, ring, (360 / count) * index));
    }
  }

  return points;
}

function pointAtDistance(
  origin: { latitude: number; longitude: number },
  miles: number,
  bearingDegrees: number
) {
  const earthRadius = 3958.8;
  const angularDistance = miles / earthRadius;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const lat1 = (origin.latitude * Math.PI) / 180;
  const lon1 = (origin.longitude * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    latitude: (lat2 * 180) / Math.PI,
    longitude: ((((lon2 * 180) / Math.PI + 540) % 360) - 180),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value || min));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
