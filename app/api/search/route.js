// TableFinder v4 - Resy direct from Vercel + Render backend for OpenTable/Yelp
// Resy calls go direct (fast, reliable), OpenTable/Yelp go through Render backend

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const BACKEND_URL = process.env.BACKEND_URL || "https://tablefinder-backend.onrender.com";

const RESY_API = "https://api.resy.com";
const RESY_API_KEY = 'VbWk7s3L4KiK5fhm7e8pSOAREisPhDbL';

const CITY_COORDS = {
  atlanta: { lat: 33.749, lng: -84.388 },
  austin: { lat: 30.267, lng: -97.743 },
  boston: { lat: 42.360, lng: -71.058 },
  chicago: { lat: 41.878, lng: -87.629 },
  dallas: { lat: 32.776, lng: -96.796 },
  denver: { lat: 39.739, lng: -104.990 },
  houston: { lat: 29.760, lng: -95.369 },
  "las vegas": { lat: 36.169, lng: -115.139 },
  "los angeles": { lat: 34.052, lng: -118.243 },
  miami: { lat: 25.761, lng: -80.191 },
  nashville: { lat: 36.162, lng: -86.774 },
  "new york": { lat: 40.712, lng: -74.006 },
  philadelphia: { lat: 39.952, lng: -75.163 },
  phoenix: { lat: 33.448, lng: -112.074 },
  portland: { lat: 45.523, lng: -122.676 },
  "san diego": { lat: 32.715, lng: -117.161 },
  "san francisco": { lat: 37.774, lng: -122.419 },
  seattle: { lat: 47.606, lng: -122.332 },
  washington: { lat: 38.907, lng: -77.036 },
};

function getCityCoords(location) {
  const loc = (location || "").toLowerCase().replace(/,.*/, "").trim();
  for (const [city, coords] of Object.entries(CITY_COORDS)) {
    if (loc.includes(city)) return coords;
  }
  return null;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms)),
  ]);
}

// ============================================================
// STEP 1: Parse query
// ============================================================

async function parseQuery(userMessage, location, clientTime) {
  const today = clientTime?.localDate || new Date().toISOString().split("T")[0];
  const currentHour = clientTime?.localHour ?? new Date().getHours();

  const todayParts = today.split("-").map(Number);
  const tomorrowDate = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, "0")}-${String(tomorrowDate.getDate()).padStart(2, "0")}`;

  console.log("Client time:", today, `hour=${currentHour}`, "tomorrow:", tomorrow);

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const todayDayName = dayNames[tomorrowDate.getDay() === 0 ? 6 : tomorrowDate.getDay() - 1];
  const fmtD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const upcomingDays = [];
  for (let i = 1; i <= 14; i++) {
    const d = new Date(todayParts[0], todayParts[1] - 1, todayParts[2] + i);
    upcomingDays.push(`${dayNames[d.getDay()]} ${fmtD(d)}`);
  }

  const prompt = `Extract restaurant search params. Today is ${todayDayName} ${today}. Tomorrow is ${tomorrow}. Current hour: ${currentHour}.
Upcoming dates: ${upcomingDays.join(", ")}
${location?.city ? `User is in ${location.city}, ${location.region}. Coords: ${location.lat}, ${location.lng}` : ""}
Return ONLY valid JSON: {"cuisine":"","date":"YYYY-MM-DD","time":"HH:MM","party_size":2,"city":"","state":"","lat":null,"lng":null,"query":""}
- "tonight" or "today" = ${today}. "tomorrow" = ${tomorrow}. Use the upcoming dates list for day names.
- "next tuesday" or "this tuesday" both mean the FIRST upcoming Tuesday from the list. Same for all days.
- Default time 19:00, party 2. "dinner" = 19:00, "lunch" = 12:00, "brunch" = 11:00.
- query=cuisine keyword like "mexican","sushi". Empty if generic like "table for 2" or "dinner".
- Default location: ${location?.city || "Atlanta"}, ${location?.region || "GA"}
User: "${userMessage}"`;

  try {
    const res = await withTimeout(
      fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 300 },
        }),
      }),
      5000
    );
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());

    if (location?.lat && (!parsed.city || parsed.city.toLowerCase() === (location.city || "").toLowerCase())) {
      parsed.lat = location.lat; parsed.lng = location.lng;
      parsed.city = location.city || parsed.city;
      parsed.state = location.region || parsed.state;
    }
    if (!parsed.lat && location?.lat) { parsed.lat = location.lat; parsed.lng = location.lng; }
    if (!parsed.city && location?.city) parsed.city = location.city;
    return sanitize(parsed);
  } catch (e) {
    console.error("Parse error:", e.message);
    return sanitize(buildFallback(userMessage, location, today, currentHour));
  }
}

function buildFallback(msg, location, today, currentHour) {
  msg = msg.toLowerCase();
  const party = msg.match(/(?:for|party of|group of)\s*(\d+)/);
  const party_size = party ? parseInt(party[1]) : 2;
  let date = today;

  const todayParts = today.split("-").map(Number);
  const baseDate = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
  const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  if (msg.includes("tomorrow")) { const d = new Date(baseDate); d.setDate(d.getDate() + 1); date = fmtDate(d); }
  else {
    const dayMap = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    for (const [name, target] of Object.entries(dayMap)) {
      if (msg.includes(name)) {
        const d = new Date(baseDate);
        let diff = (target - d.getDay() + 7) % 7;
        if (diff === 0) diff = 7;
        d.setDate(d.getDate() + diff);
        date = fmtDate(d);
        break;
      }
    }
  }

  let time = currentHour >= 21 ? "21:00" : currentHour >= 17 ? `${currentHour + 1}:00` : "19:00";
  const tm = msg.match(/(\d{1,2})(?::(\d{2}))?\s*(pm|am)/i);
  if (tm) { let h = parseInt(tm[1]); if (tm[3].toLowerCase() === "pm" && h < 12) h += 12; if (tm[3].toLowerCase() === "am" && h === 12) h = 0; time = `${h.toString().padStart(2, "0")}:${tm[2] || "00"}`; }

  const cuisines = ["mexican","italian","japanese","sushi","chinese","thai","indian","french","korean","mediterranean","american","steakhouse","seafood","brunch","bbq","pizza","vietnamese","greek","spanish","tapas","ethiopian"];
  const query = cuisines.find(c => msg.includes(c)) || "";
  return { cuisine: query, date, time, party_size, city: location?.city || "", state: location?.region || "", lat: location?.lat || null, lng: location?.lng || null, query };
}

function sanitize(p) {
  const tm = (p.time || "19:00").match(/^(\d{1,2}):(\d{2})$/);
  if (tm) { let h = Math.min(23, Math.max(0, parseInt(tm[1]))); p.time = `${h.toString().padStart(2, "0")}:${tm[2]}`; }
  else p.time = "19:00";
  const junk = ["table","restaurant","restaurants","food","dinner","lunch","reservation","book","find","me","please","get","want","need","a","the"];
  if (p.query && junk.includes(p.query.toLowerCase().trim())) p.query = "";
  if (p.cuisine && junk.includes(p.cuisine.toLowerCase().trim())) p.cuisine = "";
  p.party_size = Math.max(1, Math.min(20, parseInt(p.party_size) || 2));
  console.log("Params:", JSON.stringify(p));
  return p;
}

// ============================================================
// STEP 2A: Search Resy DIRECTLY from Vercel
// ============================================================

async function searchResyDirect(params) {
  const startTime = Date.now();
  try {
    let coords = null;
    if (params.lat && params.lng) {
      coords = { lat: params.lat, lng: params.lng };
    } else {
      const location = `${params.city || "Atlanta"}, ${params.state || "GA"}`;
      coords = getCityCoords(location);
    }

    if (!coords) {
      console.log("[Resy] No coordinates found");
      return [];
    }

    const searchParams = new URLSearchParams({
      lat: coords.lat,
      long: coords.lng,
      day: params.date,
      party_size: params.party_size || 2,
      offset: 0,
      limit: 20,
    });

    const res = await withTimeout(
      fetch(`${RESY_API}/4/find?${searchParams}`, {
        headers: {
          Authorization: `ResyAPI api_key="${RESY_API_KEY}"`,
          "X-Resy-Universal-Auth": "",
        },
      }),
      8000
    );

    if (!res.ok) {
      console.error(`[Resy] API returned ${res.status}`);
      return [];
    }

    const data = await res.json();
    const hits = data?.results?.venues || [];
    const cuisine = params.query || params.cuisine || "";
    const results = [];

    for (const hit of hits) {
      const venue = hit.venue;
      const slots = hit.slots || [];
      if (slots.length === 0) continue;

      if (cuisine) {
        const cuisineLower = cuisine.toLowerCase();
        const venueCuisine = (venue?.cuisine || []).map((c) => (c.name || c).toLowerCase());
        const venueType = (venue?.type || "").toLowerCase();
        const matchesCuisine =
          venueCuisine.some((c) => c.includes(cuisineLower)) ||
          venueType.includes(cuisineLower) ||
          cuisineLower.includes(venueType);
        if (!matchesCuisine && cuisineLower !== "all") continue;
      }

      const citySlug = venue?.location?.city_slug || "";
      const timeSlots = slots.map((slot) => {
        const slotDate = slot.date?.start;
        if (slotDate) {
          const d = new Date(slotDate);
          return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
        }
        return slot.shift?.time_start || "";
      });

      results.push({
        name: venue?.name || "Unknown",
        cuisine: (venue?.cuisine || []).map((c) => c.name || c).join(", "),
        price: venue?.price_range_id ? "$".repeat(venue.price_range_id) : "",
        rating: venue?.rating?.average || null,
        reviewCount: null,
        address: venue?.location?.address_1 || venue?.location?.neighborhood || "",
        platform: "Resy",
        hasAvailability: true,
        bookingUrl: `https://resy.com/cities/${citySlug}/${venue?.url_slug}`,
        profileUrl: `https://resy.com/cities/${citySlug}/${venue?.url_slug}`,
        distance: "",
        distanceMeters: null,
        timeSlots,
        confidence: "confirmed",
      });
    }

    const latency = Date.now() - startTime;
    console.log(`[Resy] Direct: ${results.length} restaurants in ${latency}ms`);
    return results;
  } catch (e) {
    console.error(`[Resy] Direct error: ${e.message}`);
    return [];
  }
}

// ============================================================
// STEP 2B: Forward to Render backend (OpenTable + Yelp)
// ============================================================

async function searchBackend(params) {
  const location = `${params.city || "Atlanta"}, ${params.state || "GA"}`;
  const cuisine = params.query || params.cuisine || "";

  const searchParams = new URLSearchParams({
    location,
    date: params.date,
    time: params.time || "19:00",
    partySize: String(params.party_size || 2),
  });
  if (cuisine) searchParams.set("cuisine", cuisine);

  const url = `${BACKEND_URL}/api/search?${searchParams}`;
  console.log("Backend request:", url);

  const res = await withTimeout(fetch(url), 25000);
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Backend ${res.status}: ${err.slice(0, 200)}`);
  }

  return await res.json();
}

// ============================================================
// STEP 3: Map backend response → page.js format
// ============================================================

function mapBackendResults(backendData) {
  const results = backendData?.results || [];
  return results.map((r) => {
    const platformMap = { resy: "Resy", opentable: "OpenTable", yelp: "Yelp" };
    const platform = platformMap[r.source] || r.source || "Web";
    return {
      name: r.name || "",
      cuisine: r.cuisine || "",
      price: r.priceRange || "",
      rating: r.rating || null,
      reviewCount: null,
      address: r.address || r.neighborhood || "",
      platform,
      hasAvailability: true,
      bookingUrl: r.bookingUrl || "",
      profileUrl: r.bookingUrl || "",
      distance: "",
      distanceMeters: null,
      timeSlots: r.timeSlots || [],
      confidence: r.confidence || "parsed",
    };
  });
}

// ============================================================
// Rate limit + cache
// ============================================================

const rateLimit = new Map();
const cache = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const e = rateLimit.get(ip);
  if (!e || now - e.start > 3600000) { rateLimit.set(ip, { count: 1, start: now }); return true; }
  if (e.count >= 30) return false;
  e.count++; return true;
}

// ============================================================
// MAIN HANDLER
// ============================================================

export async function POST(req) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) return Response.json({ error: "Rate limit reached." }, { status: 429 });
  if (!GEMINI_KEY) return Response.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });

  try {
    const { messages, location, localDate, localTime, localHour } = await req.json();
    const lastMessage = messages?.filter((m) => m.role === "user").pop()?.content || "";
    if (!lastMessage) return Response.json({ error: "No message" }, { status: 400 });

    const clientTime = { localDate, localTime, localHour };
    const params = await parseQuery(lastMessage, location, clientTime);

    // Check local cache
    const key = `${params.query}|${params.date}|${params.time}|${params.party_size}|${params.city}`.toLowerCase();
    const cached = cache.get(key);
    if (cached && Date.now() - cached.time < 300000) {
      return Response.json({ ...cached.data, cached: true });
    }

    // Search Resy directly + Render backend in parallel
    const startTime = Date.now();

    const [resyResults, backendData] = await Promise.allSettled([
      searchResyDirect(params),
      searchBackend(params).catch((e) => {
        console.error("Backend error:", e.message);
        return { results: [], meta: {} };
      }),
    ]);

    const resy = resyResults.status === "fulfilled" ? resyResults.value : [];
    const backend = backendData.status === "fulfilled" ? backendData.value : { results: [], meta: {} };

    // Map backend results — skip any Resy from backend to avoid dupes
    const backendRestaurants = mapBackendResults(backend).filter((r) => r.platform !== "Resy");

    // Merge: Resy direct + backend OpenTable/Yelp
    const allRestaurants = [...resy, ...backendRestaurants];

    const elapsed = Date.now() - startTime;
    const activePlatforms = [...new Set(allRestaurants.map((r) => r.platform))];

    console.log(`[Search] ${resy.length} Resy + ${backendRestaurants.length} backend = ${allRestaurants.length} total in ${elapsed}ms`);

    const structured = {
      type: "results",
      searchParams: params,
      restaurants: allRestaurants,
      resultCount: allRestaurants.length,
      platformsSearched: ["Resy", "OpenTable", "Yelp"],
      activePlatforms,
      platformDetails: backend?.meta?.platforms || {},
      elapsed,
      backendCached: backend?.meta?.cached || false,
    };

    let reply;
    if (allRestaurants.length === 0) {
      reply = `No restaurants with available reservations found for "${params.query || "your search"}" on ${params.date}. Try a different cuisine, date, or time.`;
    } else {
      reply = `Found ${allRestaurants.length} restaurants with available reservations (via ${activePlatforms.join(", ")}).`;
    }

    const responseData = { reply, structured, searchParams: params };

    cache.set(key, { data: responseData, time: Date.now() });
    if (cache.size > 200) {
      const old = [...cache.entries()].sort((a, b) => a[1].time - b[1].time);
      for (let i = 0; i < 50; i++) cache.delete(old[i][0]);
    }

    return Response.json(responseData);
  } catch (e) {
    console.error("Handler:", e);
    return Response.json({ error: `Search failed: ${e.message}` }, { status: 500 });
  }
}
