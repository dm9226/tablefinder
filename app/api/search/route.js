// TableFinder v2 - Resy + Yelp
// Only returns restaurants with confirmed available reservations

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const YELP_API_KEY = process.env.YELP_API_KEY;
const RESY_API_KEY = "VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5";

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
  // Use CLIENT's local date/time, not server UTC
  const today = clientTime?.localDate || new Date().toISOString().split("T")[0];
  const currentHour = clientTime?.localHour ?? new Date().getHours();

  // Pre-calculate tomorrow for the prompt
  const todayParts = today.split("-").map(Number);
  const tomorrowDate = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, "0")}-${String(tomorrowDate.getDate()).padStart(2, "0")}`;

  console.log("Client time:", today, `hour=${currentHour}`, "tomorrow:", tomorrow);

  const prompt = `Extract restaurant search params. Today is ${today}. Tomorrow is ${tomorrow}. Current hour: ${currentHour}.
${location?.city ? `User is in ${location.city}, ${location.region}. Coords: ${location.lat}, ${location.lng}` : ""}
Return ONLY valid JSON: {"cuisine":"","date":"YYYY-MM-DD","time":"HH:MM","party_size":2,"city":"","state":"","lat":null,"lng":null,"query":""}
- "tonight" = ${today}. "tomorrow" = ${tomorrow}. Default time 19:00, party 2.
- query=cuisine keyword like "mexican","sushi". Empty if generic like "table for 2".
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

    // Force GPS if same city
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

  // Use client's today date for relative day calculations (not new Date() which is server UTC)
  const todayParts = today.split("-").map(Number); // [2026, 2, 27]
  const baseDate = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
  const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  if (msg.includes("tomorrow")) { const d = new Date(baseDate); d.setDate(d.getDate() + 1); date = fmtDate(d); }
  else if (msg.includes("saturday")) { const d = new Date(baseDate); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); date = fmtDate(d); }
  else if (msg.includes("friday")) { const d = new Date(baseDate); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7)); date = fmtDate(d); }
  else if (msg.includes("sunday")) { const d = new Date(baseDate); d.setDate(d.getDate() + ((0 - d.getDay() + 7) % 7 || 7)); date = fmtDate(d); }

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
// Resy city slug helper
// ============================================================

function resyCitySlug(city, state) {
  // Resy uses "atlanta-ga" format, not just "atlanta"
  const c = (city || "atlanta").toLowerCase().replace(/[^a-z\s]+/g, "").trim().replace(/\s+/g, "-");
  const s = (state || "ga").toLowerCase().replace(/[^a-z]+/g, "").trim();
  // Map full state names to abbreviations
  const stateMap = { georgia: "ga", california: "ca", "new york": "ny", texas: "tx", florida: "fl", illinois: "il", massachusetts: "ma", colorado: "co", washington: "wa", oregon: "or", pennsylvania: "pa", "north carolina": "nc", "south carolina": "sc", virginia: "va", maryland: "md", louisiana: "la", tennessee: "tn", ohio: "oh", michigan: "mi", arizona: "az", nevada: "nv", "district of columbia": "dc" };
  const abbr = stateMap[s] || (s.length === 2 ? s : s.slice(0, 2));
  return `${c}-${abbr}`;
}

// ============================================================
// STEP 2: Resy
// ============================================================

async function searchResy(params) {
  const headers = {
    Authorization: `ResyAPI api_key="${RESY_API_KEY}"`,
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Origin: "https://resy.com",
    Referer: "https://resy.com/",
  };
  const citySlug = resyCitySlug(params.city, params.state);
  const hasCuisineQuery = !!(params.query || params.cuisine);
  console.log("Resy city slug:", citySlug, "cuisine query:", params.query || "(none)");

  // If user specified a cuisine, try venuesearch FIRST (it supports query filtering)
  if (hasCuisineQuery) {
    const venueSearchResults = await resyVenueSearch(params, headers, citySlug);
    if (venueSearchResults.length > 0) return venueSearchResults;
    console.log("Resy venuesearch returned 0, falling back to /4/find with filter");
  }

  // Approach: GET /4/find (returns everything nearby, we filter by cuisine)
  try {
    const url = `https://api.resy.com/4/find?lat=${params.lat || 33.749}&long=${params.lng || -84.388}&day=${params.date}&party_size=${params.party_size}`;
    console.log("Resy GET /4/find");
    const res = await withTimeout(fetch(url, { headers }), 8000);
    if (res.ok) {
      const data = await res.json();
      const venues = data?.results?.venues || [];
      console.log("Resy /4/find:", venues.length, "venues");
      if (venues.length > 0) {
        console.log("Resy venue[0]:", JSON.stringify(venues[0]).slice(0, 800));

        // Filter by cuisine if query specified
        const queryLower = (params.query || params.cuisine || "").toLowerCase();
        const filtered = queryLower
          ? venues.filter(v => {
              const venue = v.venue || v;
              const type = (venue.type || "").toLowerCase();
              const cuisine = Array.isArray(venue.cuisine) ? venue.cuisine.join(" ").toLowerCase() : (venue.cuisine || "").toLowerCase();
              const name = (venue.name || "").toLowerCase();
              return type.includes(queryLower) || cuisine.includes(queryLower) || name.includes(queryLower);
            })
          : venues;

        console.log("Resy after cuisine filter:", filtered.length, "of", venues.length);

        const enriched = await Promise.all(
          filtered.slice(0, 10).map(v => enrichResyVenue(v, params, headers, citySlug))
        );
        const results = enriched.filter(Boolean);
        if (results.length > 0) return results;
      }
    } else {
      const err = await res.text().catch(() => "");
      console.error("Resy /4/find", res.status, err.slice(0, 500));
    }
  } catch (e) { console.error("Resy /4/find error:", e.message); }

  // If no cuisine query and venuesearch not tried yet, try it now
  if (!hasCuisineQuery) {
    const venueSearchResults = await resyVenueSearch(params, headers, citySlug);
    if (venueSearchResults.length > 0) return venueSearchResults;
  }

  console.log("Resy: all approaches returned 0");
  return [];
}

async function resyVenueSearch(params, headers, citySlug) {
  try {
    const body = {
      geo: { latitude: params.lat || 33.749, longitude: params.lng || -84.388 },
      per_page: 15,
      slot_filter: { day: params.date, party_size: params.party_size },
      types: ["venue"],
    };
    if (params.query || params.cuisine) body.query = params.query || params.cuisine;
    console.log("Resy venuesearch:", body.query || "(no query)");

    const res = await withTimeout(
      fetch("https://api.resy.com/3/venuesearch/search", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      8000
    );
    if (res.ok) {
      const data = await res.json();
      const venues = data?.search?.hits || data?.results || [];
      console.log("Resy venuesearch:", venues.length, "venues");
      if (venues.length > 0) {
        const enriched = await Promise.all(
          venues.slice(0, 10).map(async (venue) => {
            const available = venue.available !== false && venue.notify_available !== true;
            if (!available) return null;

            const venueId = venue.id?.resy || venue.objectID || venue.id;
            const slug = venue.url_slug || (venue.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");

            let venueCity = params.city || "atlanta";
            let venueState = params.state || "ga";
            let distanceMeters = null;
            try {
              if (venueId) {
                const detailRes = await withTimeout(
                  fetch(`https://api.resy.com/3/venue?id=${venueId}&url_slug=${slug}`, { headers: { ...headers, "Content-Type": "application/json" } }),
                  3000
                );
                if (detailRes.ok) {
                  const detail = await detailRes.json();
                  const loc = detail?.location || detail?.venue?.location || {};
                  venueCity = loc.city || loc.locality || venueCity;
                  venueState = loc.state || loc.region || venueState;
                  const vLat = loc.latitude || loc.lat;
                  const vLng = loc.longitude || loc.lng || loc.long;
                  if (vLat && vLng && params.lat && params.lng) {
                    distanceMeters = haversine(params.lat, params.lng, vLat, vLng);
                  }
                }
              }
            } catch {}

            const venueCitySlug = resyCitySlug(venueCity, venueState);
            const bookingUrl = `https://resy.com/cities/${venueCitySlug}/venues/${slug}?date=${params.date}&seats=${params.party_size}`;
            return {
              name: venue.name || "",
              cuisine: Array.isArray(venue.cuisine) ? venue.cuisine.join(", ") : (venue.cuisine || venue.type || ""),
              price: venue.price_range ? "$".repeat(venue.price_range) : "",
              rating: venue.rating || venue.score || null,
              reviewCount: venue.num_ratings || null,
              address: venue.location?.neighborhood || venue.neighborhood || "",
              platform: "Resy",
              hasAvailability: available,
              bookingUrl,
              profileUrl: bookingUrl,
              distanceMeters,
              distance: distanceMeters ? `${(distanceMeters / 1609.34).toFixed(1)} mi` : "",
            };
          })
        );
        return enriched.filter(Boolean);
      }
    } else {
      const err = await res.text().catch(() => "");
      console.error("Resy venuesearch", res.status, err.slice(0, 500));
    }
  } catch (e) { console.error("Resy venuesearch error:", e.message); }
  return [];
}

async function enrichResyVenue(v, params, headers, citySlug) {
  const venue = v.venue || v;
  const hasSlots = (v.slots?.length || 0) > 0;
  if (!hasSlots) return null;

  const venueId = venue.id?.resy || venue.id;
  const slug = venue.url_slug || (venue.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");

  let venueCity = params.city || "atlanta";
  let venueState = params.state || "ga";
  let distanceMeters = null;
  try {
    if (venueId) {
      const detailRes = await withTimeout(
        fetch(`https://api.resy.com/3/venue?id=${venueId}&url_slug=${slug}`, { headers }),
        3000
      );
      if (detailRes.ok) {
        const detail = await detailRes.json();
        const loc = detail?.location || detail?.venue?.location || {};
        venueCity = loc.city || loc.locality || venueCity;
        venueState = loc.state || loc.region || venueState;
        // Calculate distance if we have coordinates
        const vLat = loc.latitude || loc.lat;
        const vLng = loc.longitude || loc.lng || loc.long;
        if (vLat && vLng && params.lat && params.lng) {
          distanceMeters = haversine(params.lat, params.lng, vLat, vLng);
        }
      }
    }
  } catch {}

  const venueCitySlug = resyCitySlug(venueCity, venueState);
  const bookingUrl = `https://resy.com/cities/${venueCitySlug}/venues/${slug}?date=${params.date}&seats=${params.party_size}`;

  return {
    name: venue.name || "",
    cuisine: Array.isArray(venue.cuisine) ? venue.cuisine.join(", ") : (venue.cuisine || venue.type || ""),
    price: venue.price_range ? "$".repeat(venue.price_range) : "",
    rating: venue.rating || null,
    reviewCount: venue.num_ratings || null,
    address: venue.neighborhood || venue.location?.neighborhood || "",
    platform: "Resy",
    hasAvailability: hasSlots,
    bookingUrl,
    profileUrl: bookingUrl,
    distanceMeters,
    distance: distanceMeters ? `${(distanceMeters / 1609.34).toFixed(1)} mi` : "",
  };
}

// Haversine formula — returns distance in meters
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================================
// STEP 3: Yelp
// ============================================================

async function searchYelp(params) {
  if (!YELP_API_KEY) {
    console.log("Yelp: YELP_API_KEY not set — skipping");
    return [];
  }

  try {
    const yelpCategoryMap = {
      mexican: "mexican", italian: "italian", japanese: "japanese", sushi: "sushi",
      chinese: "chinese", thai: "thai", indian: "indpak", french: "french",
      korean: "korean", mediterranean: "mediterranean", american: "newamerican",
      steakhouse: "steak", steak: "steak", seafood: "seafood", brunch: "breakfast_brunch",
      breakfast: "breakfast_brunch", bbq: "bbq", barbeque: "bbq", pizza: "pizza",
      vietnamese: "vietnamese", greek: "greek", spanish: "spanish", tapas: "tapas",
      ethiopian: "ethiopian", turkish: "turkish", peruvian: "peruvian",
      caribbean: "caribbean", cuban: "cuban", german: "german", ramen: "ramen",
      soul: "soulfood", southern: "soulfood", vegan: "vegan", vegetarian: "vegetarian",
    };

    const queryLower = (params.query || params.cuisine || "").toLowerCase().trim();
    const yelpCategory = yelpCategoryMap[queryLower] || null;

    const url = new URL("https://api.yelp.com/v3/businesses/search");
    url.searchParams.set("latitude", (params.lat || 33.749).toString());
    url.searchParams.set("longitude", (params.lng || -84.388).toString());
    url.searchParams.set("categories", yelpCategory || "restaurants");
    url.searchParams.set("limit", "20");
    url.searchParams.set("sort_by", "distance");
    url.searchParams.set("radius", "12875");
    if (queryLower && !yelpCategory) url.searchParams.set("term", queryLower);
    url.searchParams.set("attributes", "reservation");

    console.log("Yelp: category=" + (yelpCategory || "restaurants"), "term=" + (url.searchParams.get("term") || "(none)"));

    const res = await withTimeout(
      fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${YELP_API_KEY}`,
          Accept: "application/json",
        },
      }),
      8000
    );

    console.log("Yelp status:", res.status);

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error("Yelp error:", res.status, err.slice(0, 500));
      return [];
    }

    const data = await res.json();
    console.log("Yelp search:", data.businesses?.length || 0, "businesses");

    // Filter to restaurants that support reservations
    const candidates = (data.businesses || []).filter(
      biz => biz.transactions?.includes("restaurant_reservation")
    ).slice(0, 10);

    if (candidates.length === 0) return [];

    // Check REAL availability via /v3/bookings/{alias}/openings for each
    console.log("Yelp: checking openings for", candidates.length, "restaurants");
    const verified = await Promise.all(
      candidates.map(biz => checkYelpOpenings(biz, params))
    );
    return verified.filter(Boolean);
  } catch (e) {
    console.error("Yelp error:", e.message);
    return [];
  }
}

async function checkYelpOpenings(biz, params) {
  const alias = biz.alias || "";
  const yelpTime = (params?.time || "19:00");
  const profileUrl = `https://www.yelp.com/biz/${alias}`;

  try {
    const openingsUrl = `https://api.yelp.com/v3/bookings/${alias}/openings?covers=${params?.party_size || 2}&date=${params?.date || ""}&time=${yelpTime}`;
    const res = await withTimeout(
      fetch(openingsUrl, {
        headers: {
          Authorization: `Bearer ${YELP_API_KEY}`,
          Accept: "application/json",
        },
      }),
      3000
    );

    if (res.ok) {
      const data = await res.json();
      const times = data?.reservation_times || [];
      // Find slots on the requested date
      const dateSlots = times.find(t => t.date === params?.date);
      const availableTimes = dateSlots?.times || [];
      console.log(`Yelp openings ${biz.name}: ${availableTimes.length} slots on ${params?.date}`);

      if (availableTimes.length === 0) return null; // No availability — skip

      // Use the first available slot's URL if provided
      const bestSlot = availableTimes[0];
      const bookingUrl = bestSlot?.url ||
        `https://www.yelp.com/reservations/${alias}?source=yelp_biz&date=${params?.date || ""}&time=${yelpTime.replace(":", "")}&covers=${params?.party_size || 2}`;

      return {
        name: biz.name || "",
        cuisine: biz.categories?.map(c => c.title).join(", ") || "",
        price: biz.price || "",
        rating: biz.rating || null,
        reviewCount: biz.review_count || null,
        address: [biz.location?.address1, biz.location?.city].filter(Boolean).join(", ") || "",
        platform: "Yelp",
        hasAvailability: true,
        bookingUrl,
        profileUrl,
        distance: biz.distance ? `${(biz.distance / 1609.34).toFixed(1)} mi` : "",
        distanceMeters: biz.distance || null,
        availableSlots: availableTimes.length,
      };
    } else {
      const status = res.status;
      if (status === 401 || status === 403) {
        // Openings endpoint not available with our key — fall back to showing the restaurant
        // but with reservation link (user clicks through to check)
        console.log(`Yelp openings ${biz.name}: ${status} — endpoint not available, including with caveat`);
        const yelpTimeFlat = yelpTime.replace(":", "");
        return {
          name: biz.name || "",
          cuisine: biz.categories?.map(c => c.title).join(", ") || "",
          price: biz.price || "",
          rating: biz.rating || null,
          reviewCount: biz.review_count || null,
          address: [biz.location?.address1, biz.location?.city].filter(Boolean).join(", ") || "",
          platform: "Yelp",
          hasAvailability: true,
          availabilityVerified: false,
          bookingUrl: `https://www.yelp.com/reservations/${alias}?source=yelp_biz&date=${params?.date || ""}&time=${yelpTimeFlat}&covers=${params?.party_size || 2}`,
          profileUrl,
          distance: biz.distance ? `${(biz.distance / 1609.34).toFixed(1)} mi` : "",
          distanceMeters: biz.distance || null,
        };
      }
      console.log(`Yelp openings ${biz.name}: ${status} — skipping`);
      return null;
    }
  } catch (e) {
    console.log(`Yelp openings ${biz.name}: timeout/error — including with caveat`);
    const yelpTimeFlat = (params?.time || "19:00").replace(":", "");
    return {
      name: biz.name || "",
      cuisine: biz.categories?.map(c => c.title).join(", ") || "",
      price: biz.price || "",
      rating: biz.rating || null,
      reviewCount: biz.review_count || null,
      address: [biz.location?.address1, biz.location?.city].filter(Boolean).join(", ") || "",
      platform: "Yelp",
      hasAvailability: true,
      availabilityVerified: false,
      bookingUrl: `https://www.yelp.com/reservations/${alias}?source=yelp_biz&date=${params?.date || ""}&time=${yelpTimeFlat}&covers=${params?.party_size || 2}`,
      profileUrl: `https://www.yelp.com/biz/${alias}`,
      distance: biz.distance ? `${(biz.distance / 1609.34).toFixed(1)} mi` : "",
      distanceMeters: biz.distance || null,
    };
  }
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
// MAIN
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

    // Cache
    const key = `${params.query}|${params.date}|${params.time}|${params.party_size}|${Math.round((params.lat||0)*100)}`.toLowerCase();
    const cached = cache.get(key);
    if (cached && Date.now() - cached.time < 600000) return Response.json({ ...cached.data, cached: true });

    const startTime = Date.now();
    const [resyResults, yelpResults] = await Promise.all([
      searchResy(params).catch(e => { console.error("Resy fatal:", e.message); return []; }),
      searchYelp(params).catch(e => { console.error("Yelp fatal:", e.message); return []; }),
    ]);
    const elapsed = Date.now() - startTime;
    console.log(`Done ${elapsed}ms: Resy=${resyResults.length}, Yelp=${yelpResults.length}`);

    // Dedupe by name
    const allResults = [...resyResults];
    const names = new Set(resyResults.map(r => r.name.toLowerCase().replace(/[^a-z]/g, "")));
    for (const y of yelpResults) {
      if (!names.has(y.name.toLowerCase().replace(/[^a-z]/g, ""))) allResults.push(y);
    }

    // Filter to 8 miles max (12875 meters) — skip items with no distance data
    const MAX_DISTANCE = 12875;
    const withinRange = allResults.filter(r => r.distanceMeters == null || r.distanceMeters <= MAX_DISTANCE);

    // Sort by distance (closest first), unknown distance at end
    withinRange.sort((a, b) => {
      const da = a.distanceMeters ?? 999999;
      const db = b.distanceMeters ?? 999999;
      return da - db;
    });

    const structured = {
      type: "results",
      searchParams: params,
      restaurants: withinRange,
      resultCount: withinRange.length,
      platformsSearched: ["Resy", ...(YELP_API_KEY ? ["Yelp"] : [])],
      elapsed,
    };

    let reply;
    if (withinRange.length === 0) {
      reply = `No restaurants with available reservations found for "${params.query || "your search"}" within 8 miles on ${params.date}. Try a different cuisine, date, or larger search area.`;
    } else {
      const rc = withinRange.filter(r => r.platform === "Resy").length;
      const yc = withinRange.filter(r => r.platform === "Yelp").length;
      const parts = [];
      if (rc > 0) parts.push(`${rc} from Resy`);
      if (yc > 0) parts.push(`${yc} from Yelp`);
      reply = `Found ${withinRange.length} restaurants with available reservations (${parts.join(", ")}).`;
    }

    const responseData = { reply, structured, searchParams: params };
    cache.set(key, { data: responseData, time: Date.now() });
    if (cache.size > 200) { const old = [...cache.entries()].sort((a, b) => a[1].time - b[1].time); for (let i = 0; i < 50; i++) cache.delete(old[i][0]); }

    return Response.json(responseData);
  } catch (e) {
    console.error("Handler:", e);
    return Response.json({ error: `Search failed: ${e.message}` }, { status: 500 });
  }
}
