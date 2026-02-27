// TableFinder v2 - Resy + Yelp direct API integration
// Fast: one call per platform, parallel execution, hard timeouts

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const YELP_API_KEY = process.env.YELP_API_KEY;
const RESY_API_KEY = "VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5";

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
  ]);
}

// ============================================================
// STEP 1: Parse natural language → search params
// ============================================================

async function parseQuery(userMessage, location) {
  const today = new Date().toISOString().split("T")[0];
  const now = new Date();
  const currentHour = now.getHours();

  const prompt = `You are a query parser. Extract restaurant search parameters.
Today: ${today}. Current hour: ${currentHour}.
${location?.city ? `User location: ${location.city}, ${location.region || ""}` : ""}
${location?.lat ? `Coordinates: ${location.lat}, ${location.lng}` : ""}

Return ONLY valid JSON, no markdown:
{"cuisine":"","date":"YYYY-MM-DD","time":"HH:MM","party_size":2,"city":"","state":"","lat":null,"lng":null,"query":""}

Rules:
- "tonight" = today, time 19:00 (or current hour + 1 if after 19:00, max 21:00)
- "tomorrow" = tomorrow
- Default time 19:00, default party 2
- query = short cuisine/food keyword like "mexican", "sushi", "steakhouse". Empty string if none specified.
- If user says generic things like "table for 2" or "dinner tonight", query should be empty string
- CRITICAL: Default city="${location?.city || ""}", state="${location?.region || ""}", lat=${location?.lat || "null"}, lng=${location?.lng || "null"} unless user names a different city

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
    console.log("Gemini raw:", text.slice(0, 200));
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    // Override with GPS if user didn't name a different city
    if (location?.lat && (!parsed.city || parsed.city.toLowerCase() === (location.city || "").toLowerCase())) {
      parsed.lat = location.lat;
      parsed.lng = location.lng;
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
  const partyMatch = msg.match(/(?:for|party of|group of)\s*(\d+)/);
  const party_size = partyMatch ? parseInt(partyMatch[1]) : 2;

  let date = today;
  if (msg.includes("tomorrow")) {
    const d = new Date(); d.setDate(d.getDate() + 1); date = d.toISOString().split("T")[0];
  } else if (msg.includes("saturday")) {
    const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); date = d.toISOString().split("T")[0];
  } else if (msg.includes("friday")) {
    const d = new Date(); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7)); date = d.toISOString().split("T")[0];
  } else if (msg.includes("sunday")) {
    const d = new Date(); d.setDate(d.getDate() + ((0 - d.getDay() + 7) % 7 || 7)); date = d.toISOString().split("T")[0];
  }

  let time = currentHour >= 21 ? "21:00" : currentHour >= 17 ? `${currentHour + 1}:00` : "19:00";
  const timeMatch = msg.match(/(\d{1,2})(?::(\d{2}))?\s*(pm|am)/i);
  if (timeMatch) {
    let h = parseInt(timeMatch[1]);
    const m = timeMatch[2] || "00";
    if (timeMatch[3].toLowerCase() === "pm" && h < 12) h += 12;
    if (timeMatch[3].toLowerCase() === "am" && h === 12) h = 0;
    time = `${h.toString().padStart(2, "0")}:${m}`;
  }

  const cuisines = ["mexican", "italian", "japanese", "sushi", "chinese", "thai", "indian", "french", "korean", "mediterranean", "american", "steakhouse", "seafood", "brunch", "bbq", "pizza", "vietnamese", "greek", "spanish", "tapas", "ethiopian"];
  const query = cuisines.find(c => msg.includes(c)) || "";

  return {
    cuisine: query, date, time, party_size,
    city: location?.city || "", state: location?.region || "",
    lat: location?.lat || null, lng: location?.lng || null, query,
  };
}

function sanitize(p) {
  // Fix time
  const tm = (p.time || "19:00").match(/^(\d{1,2}):(\d{2})$/);
  if (tm) {
    let h = Math.min(23, Math.max(0, parseInt(tm[1])));
    p.time = `${h.toString().padStart(2, "0")}:${tm[2]}`;
  } else {
    p.time = "19:00";
  }

  // Strip junk queries
  const junk = ["table", "restaurant", "restaurants", "food", "dinner", "lunch", "reservation", "book", "find", "me", "please", "get", "want", "need", "a", "the"];
  if (p.query && junk.includes(p.query.toLowerCase().trim())) p.query = "";
  if (p.cuisine && junk.includes(p.cuisine.toLowerCase().trim())) p.cuisine = "";

  p.party_size = Math.max(1, Math.min(20, parseInt(p.party_size) || 2));

  console.log("Final params:", JSON.stringify(p));
  return p;
}

// ============================================================
// STEP 2: Resy — try multiple endpoints until one works
// ============================================================

async function searchResy(params) {
  const headers = {
    Authorization: `ResyAPI api_key="${RESY_API_KEY}"`,
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Origin: "https://resy.com",
    Referer: "https://resy.com/",
  };
  const citySlug = (params.city || "atlanta").toLowerCase().replace(/\s+/g, "-");

  // ---- Approach 1: GET /4/find (simplest, no POST body to get wrong) ----
  try {
    const url = `https://api.resy.com/4/find?lat=${params.lat || 33.749}&long=${params.lng || -84.388}&day=${params.date}&party_size=${params.party_size}`;
    console.log("Resy [1] GET /4/find");

    const res = await withTimeout(fetch(url, { headers }), 8000);

    if (res.ok) {
      const data = await res.json();
      const venues = data?.results?.venues || [];
      console.log("Resy [1] found", venues.length, "venues");
      if (venues.length > 0) {
        return venues.slice(0, 10).map((v) => {
          const venue = v.venue || v;
          const slug = venue.url_slug || (venue.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
          return {
            name: venue.name || "",
            cuisine: Array.isArray(venue.cuisine) ? venue.cuisine.join(", ") : (venue.cuisine || venue.type || ""),
            price: venue.price_range ? "$".repeat(venue.price_range) : "",
            rating: venue.rating || null,
            reviewCount: venue.num_ratings || null,
            address: venue.neighborhood || venue.location?.neighborhood || "",
            platform: "Resy",
            hasAvailability: (v.slots?.length || 0) > 0,
            bookingUrl: `https://resy.com/cities/${citySlug}/${slug}?date=${params.date}&seats=${params.party_size}`,
            profileUrl: `https://resy.com/cities/${citySlug}/${slug}`,
          };
        }).filter(r => r.name);
      }
    } else {
      const err = await res.text().catch(() => "");
      console.error("Resy [1]", res.status, err.slice(0, 500));
    }
  } catch (e) {
    console.error("Resy [1] error:", e.message);
  }

  // ---- Approach 2: POST /3/venuesearch/search ----
  try {
    const body = {
      geo: { latitude: params.lat || 33.749, longitude: params.lng || -84.388 },
      per_page: 10,
      slot_filter: { day: params.date, party_size: params.party_size },
      types: ["venue"],
    };
    // Only add query if non-empty
    if (params.query) body.query = params.query;

    console.log("Resy [2] POST venuesearch:", JSON.stringify(body));

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
      console.log("Resy [2] response keys:", Object.keys(data || {}).join(", "));
      const venues = data?.search?.hits || data?.results || [];
      console.log("Resy [2] found", venues.length, "venues");
      if (venues.length > 0) return mapResyVenues(venues, params, citySlug);
    } else {
      const err = await res.text().catch(() => "");
      console.error("Resy [2]", res.status, err.slice(0, 500));
    }
  } catch (e) {
    console.error("Resy [2] error:", e.message);
  }

  // ---- Approach 3: GET /2/search (older endpoint) ----
  try {
    const url = `https://api.resy.com/2/search?lat=${params.lat || 33.749}&long=${params.lng || -84.388}&query=${encodeURIComponent(params.query || "")}&limit=10`;
    console.log("Resy [3] GET /2/search");

    const res = await withTimeout(fetch(url, { headers }), 8000);

    if (res.ok) {
      const data = await res.json();
      console.log("Resy [3] response keys:", Object.keys(data || {}).join(", "));
      const venues = data?.results || data?.hits || data?.venues || [];
      console.log("Resy [3] found", venues.length, "venues");
      if (venues.length > 0) return mapResyVenues(venues, params, citySlug);
    } else {
      const err = await res.text().catch(() => "");
      console.error("Resy [3]", res.status, err.slice(0, 500));
    }
  } catch (e) {
    console.error("Resy [3] error:", e.message);
  }

  console.log("Resy: all approaches failed");
  return [];
}

function mapResyVenues(venues, params, citySlug) {
  return venues.slice(0, 10).map((venue) => {
    const slug = venue.url_slug || (venue.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return {
      name: venue.name || "",
      cuisine: Array.isArray(venue.cuisine) ? venue.cuisine.join(", ") : (venue.cuisine || venue.type || ""),
      price: venue.price_range ? "$".repeat(venue.price_range) : (venue.price ? "$".repeat(venue.price) : ""),
      rating: venue.rating || venue.score || null,
      reviewCount: venue.num_ratings || null,
      address: venue.location?.neighborhood || venue.neighborhood || venue.region || "",
      platform: "Resy",
      hasAvailability: venue.available !== false && venue.notify_available !== true,
      bookingUrl: `https://resy.com/cities/${citySlug}/${slug}?date=${params.date}&seats=${params.party_size}`,
      profileUrl: `https://resy.com/cities/${citySlug}/${slug}`,
    };
  }).filter(r => r.name);
}

// ============================================================
// STEP 3: Yelp Fusion API
// ============================================================

async function searchYelp(params) {
  if (!YELP_API_KEY) {
    console.log("Yelp: no API key configured");
    return [];
  }

  try {
    const url = new URL("https://api.yelp.com/v3/businesses/search");
    url.searchParams.set("latitude", params.lat || 33.749);
    url.searchParams.set("longitude", params.lng || -84.388);
    url.searchParams.set("categories", "restaurants");
    url.searchParams.set("limit", "15");
    url.searchParams.set("sort_by", "best_match");
    if (params.query) url.searchParams.set("term", params.query);

    // Convert date + time to unix timestamp for open_at filter
    try {
      const dt = new Date(`${params.date}T${params.time}:00`);
      if (!isNaN(dt.getTime())) {
        url.searchParams.set("open_at", Math.floor(dt.getTime() / 1000).toString());
      }
    } catch {}

    console.log("Yelp: searching", params.query || "(all)", "near", params.lat, params.lng);

    const res = await withTimeout(
      fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${YELP_API_KEY}`,
          Accept: "application/json",
        },
      }),
      8000
    );

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error("Yelp:", res.status, err.slice(0, 300));
      return [];
    }

    const data = await res.json();
    const businesses = data?.businesses || [];
    console.log("Yelp: found", businesses.length, "businesses");

    return businesses.slice(0, 10).map((biz) => {
      // Check if business supports reservations
      const hasReservation = biz.transactions?.includes("restaurant_reservation");

      // Build Yelp URL
      const yelpUrl = biz.url?.split("?")[0] || `https://www.yelp.com/biz/${biz.alias || ""}`;

      return {
        name: biz.name || "",
        cuisine: biz.categories?.map(c => c.title).join(", ") || "",
        price: biz.price || "",
        rating: biz.rating || null,
        reviewCount: biz.review_count || null,
        address: [biz.location?.address1, biz.location?.city].filter(Boolean).join(", ") || "",
        platform: "Yelp",
        hasAvailability: hasReservation,
        bookingUrl: yelpUrl,
        profileUrl: yelpUrl,
        phone: biz.display_phone || "",
        distance: biz.distance ? `${(biz.distance / 1609.34).toFixed(1)} mi` : "",
        imageUrl: biz.image_url || "",
      };
    }).filter(r => r.name);
  } catch (e) {
    console.error("Yelp error:", e.message);
    return [];
  }
}

// ============================================================
// RATE LIMITING + CACHING
// ============================================================

const rateLimit = new Map();
const cache = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (!entry || now - entry.start > 3600000) {
    rateLimit.set(ip, { count: 1, start: now });
    return true;
  }
  if (entry.count >= 30) return false;
  entry.count++;
  return true;
}

function getCacheKey(p) {
  return `${p.query}|${p.date}|${p.time}|${p.party_size}|${Math.round((p.lat||0)*100)}|${Math.round((p.lng||0)*100)}`.toLowerCase();
}

// ============================================================
// MAIN HANDLER
// ============================================================

export async function POST(req) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) {
    return Response.json({ error: "Rate limit reached. Try again shortly." }, { status: 429 });
  }
  if (!GEMINI_KEY) {
    return Response.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  try {
    const { messages, location } = await req.json();
    const lastMessage = messages?.filter((m) => m.role === "user").pop()?.content || "";
    if (!lastMessage) {
      return Response.json({ error: "No message provided" }, { status: 400 });
    }

    const params = await parseQuery(lastMessage, location);

    // Cache check
    const cacheKey = getCacheKey(params);
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < 600000) {
      console.log("Cache hit:", cacheKey);
      return Response.json({ ...cached.data, cached: true });
    }

    // Search all platforms in parallel
    const startTime = Date.now();
    const platforms = [
      searchResy(params).catch(e => { console.error("Resy fatal:", e.message); return []; }),
      searchYelp(params).catch(e => { console.error("Yelp fatal:", e.message); return []; }),
    ];

    const [resyResults, yelpResults] = await Promise.all(platforms);
    const elapsed = Date.now() - startTime;
    console.log(`Done in ${elapsed}ms: Resy=${resyResults.length}, Yelp=${yelpResults.length}`);

    // Merge results, deduplicate by name similarity
    const allResults = [...resyResults];
    const resyNames = new Set(resyResults.map(r => r.name.toLowerCase().replace(/[^a-z]/g, "")));

    for (const yelp of yelpResults) {
      const normalized = yelp.name.toLowerCase().replace(/[^a-z]/g, "");
      // Skip if already found on Resy (prefer Resy since it has direct booking)
      if (!resyNames.has(normalized)) {
        allResults.push(yelp);
      }
    }

    // Sort: availability first, then by rating
    allResults.sort((a, b) => {
      if (a.hasAvailability && !b.hasAvailability) return -1;
      if (!a.hasAvailability && b.hasAvailability) return 1;
      return (b.rating || 0) - (a.rating || 0);
    });

    const structured = {
      type: "results",
      searchParams: params,
      restaurants: allResults,
      resultCount: allResults.length,
      platformsSearched: [
        "Resy",
        ...(YELP_API_KEY ? ["Yelp"] : []),
      ],
      elapsed,
    };

    let reply;
    if (allResults.length === 0) {
      reply = `No restaurants found for "${params.query || "your search"}" in ${params.city || "your area"} on ${params.date}. Try a different cuisine, date, or location.`;
    } else {
      const resyCount = resyResults.length;
      const yelpCount = yelpResults.length;
      const parts = [];
      if (resyCount > 0) parts.push(`${resyCount} from Resy`);
      if (yelpCount > 0) parts.push(`${yelpCount} from Yelp`);
      reply = `Found ${allResults.length} restaurants (${parts.join(", ")}) in ${params.city || "your area"}.`;
    }

    const responseData = { reply, structured, searchParams: params };

    // Cache
    cache.set(cacheKey, { data: responseData, time: Date.now() });
    if (cache.size > 200) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].time - b[1].time);
      for (let i = 0; i < 50; i++) cache.delete(oldest[i][0]);
    }

    return Response.json(responseData);
  } catch (e) {
    console.error("Handler error:", e);
    return Response.json({ error: `Search failed: ${e.message}` }, { status: 500 });
  }
}
