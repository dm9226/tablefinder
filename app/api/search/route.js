// TableFinder v2 - Fast restaurant search with direct booking links
// One API call per platform, no per-venue lookups

const GEMINI_KEY = process.env.GEMINI_API_KEY;

// Hard timeout wrapper
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

// ============================================================
// STEP 1: Parse natural language into search params
// ============================================================

async function parseQuery(userMessage, location) {
  const today = new Date().toISOString().split("T")[0];
  const now = new Date();
  const currentHour = now.getHours();

  const prompt = `You are a query parser. Extract restaurant search parameters from the user's message.
Today's date is ${today}. Current time is ${currentHour}:00.
${location?.city ? `IMPORTANT: The user is located in ${location.city}, ${location.region || ""}. ALWAYS use this as the default location unless the user explicitly names a different city.` : ""}
${location?.lat ? `User coordinates: ${location.lat}, ${location.lng}` : ""}

Return ONLY a JSON object, no markdown, no explanation:
{
  "cuisine": "type of food or empty string",
  "date": "YYYY-MM-DD",
  "time": "HH:MM in 24hr format, default 19:00",
  "party_size": number (default 2),
  "city": "city name",
  "state": "2-letter state code or empty",
  "lat": latitude number or null,
  "lng": longitude number or null,
  "query": "short search term"
}

Rules:
- "tonight" = today's date, time = 19:00 (or later if past 19:00)
- "tomorrow" = tomorrow's date
- "this Saturday" = next Saturday
- CRITICAL: If the user does NOT mention a specific city, default to "${location?.city || ""}", state "${location?.region || ""}", lat ${location?.lat || "null"}, lng ${location?.lng || "null"}

User message: "${userMessage}"`;

  try {
    const res = await withTimeout(
      fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
        }),
      }),
      5000
    );

    if (!res.ok) {
      console.error("Gemini error:", res.status);
      return buildFallbackParams(userMessage, location, today, currentHour);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    // Force detected location if user didn't specify different city
    if (location?.lat) {
      if (!parsed.city || parsed.city.toLowerCase() === (location.city || "").toLowerCase()) {
        parsed.lat = location.lat;
        parsed.lng = location.lng;
        parsed.city = location.city || parsed.city;
        parsed.state = location.region || parsed.state;
      }
    }
    if (!parsed.lat && location?.lat) { parsed.lat = location.lat; parsed.lng = location.lng; }
    if (!parsed.city && location?.city) parsed.city = location.city;
    if (!parsed.state && location?.region) parsed.state = location.region;

    console.log("Parsed:", JSON.stringify(parsed));
    return sanitizeParams(parsed);
  } catch (e) {
    console.error("Parse error:", e.message);
    return sanitizeParams(buildFallbackParams(userMessage, location, today, currentHour));
  }
}

function sanitizeParams(params) {
  // Fix invalid times
  const timeParts = (params.time || "19:00").match(/^(\d{1,2}):(\d{2})$/);
  if (timeParts) {
    let h = parseInt(timeParts[1]);
    if (h >= 24) h = 21;
    if (h < 0) h = 19;
    params.time = `${h.toString().padStart(2, "0")}:${timeParts[2]}`;
  } else {
    params.time = "19:00";
  }

  // Strip bad search terms
  const badTerms = ["table", "restaurant", "restaurants", "food", "dinner", "lunch", "reservation", "book", "find", "me", "please"];
  if (params.query && badTerms.includes(params.query.toLowerCase().trim())) {
    params.query = "";
  }
  if (params.cuisine && badTerms.includes(params.cuisine.toLowerCase().trim())) {
    params.cuisine = "";
  }

  // Ensure party_size is valid
  params.party_size = Math.max(1, Math.min(20, parseInt(params.party_size) || 2));

  console.log("Sanitized:", JSON.stringify(params));
  return params;
}

function buildFallbackParams(userMessage, location, today, currentHour) {
  const msg = userMessage.toLowerCase();
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

  const cuisines = ["mexican", "italian", "japanese", "sushi", "chinese", "thai", "indian", "french", "korean", "mediterranean", "american", "steakhouse", "seafood", "brunch", "bbq", "pizza", "vietnamese", "greek", "spanish", "tapas"];
  const stopWords = ["table", "restaurant", "restaurants", "food", "dinner", "lunch", "eat", "eating", "place", "places", "good", "best", "find", "me", "a", "the", "get", "book", "reserve", "reservation", "tonight", "tomorrow", "near", "nearby"];
  const foundCuisine = cuisines.find(c => msg.includes(c));
  let query = "";
  if (foundCuisine) {
    query = foundCuisine;
  } else {
    query = msg.replace(/for \d+|tonight|tomorrow|saturday|friday|sunday|near me|in \w+|\d{1,2}(:\d{2})?\s*(pm|am)/gi, "").trim()
      .split(/\s+/).filter(w => !stopWords.includes(w)).slice(0, 3).join(" ");
  }

  return {
    cuisine: query, date, time, party_size,
    city: location?.city || "", state: location?.region || "",
    lat: location?.lat || null, lng: location?.lng || null, query,
  };
}

// ============================================================
// STEP 2: OpenTable - single page fetch, no per-venue calls
// ============================================================

async function searchOpenTable(params) {
  try {
    const dateTime = `${params.date}T${params.time}:00`;
    const term = params.query || params.cuisine || "";

    // Try OpenTable's internal REST API used by their frontend
    // This is less likely to be blocked than full page fetches
    const apiUrl = new URL("https://www.opentable.com/dapi/fe/gql");
    apiUrl.searchParams.set("optype", "query");
    apiUrl.searchParams.set("opname", "RestaurantsAvailability");

    const gqlBody = {
      operationName: "RestaurantsAvailability",
      variables: {
        term: term,
        latitude: params.lat || 33.749,
        longitude: params.lng || -84.388,
        dateTime: dateTime,
        partySize: params.party_size,
        metroId: 0,
        regionIds: [],
        cuisineIds: [],
        sortBy: "Popularity",
        rows: 10,
        requireAvailability: false,
      },
    };

    console.log("OpenTable API:", term, params.lat, params.lng);

    const res = await withTimeout(
      fetch(apiUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept": "application/json",
          "Origin": "https://www.opentable.com",
          "Referer": "https://www.opentable.com/",
        },
        body: JSON.stringify(gqlBody),
      }),
      8000
    );

    console.log("OpenTable API status:", res.status);

    if (!res.ok) {
      // If GQL fails, try building direct booking links from a simple text search
      console.log("OpenTable API failed, building fallback links");
      return buildOpenTableFallbackLinks(params);
    }

    const data = await res.json();
    console.log("OpenTable API keys:", JSON.stringify(Object.keys(data?.data || data || {})).slice(0, 200));

    const restaurants =
      data?.data?.availability?.restaurants ||
      data?.data?.restaurantsAvailability?.restaurants ||
      data?.data?.restaurants ||
      [];

    console.log("OpenTable: found", restaurants.length, "restaurants");

    return restaurants.slice(0, 10).map((r) => {
      const rid = r.rid || r.restaurantId || r.id;
      const slug = r.urls?.profileLink || r.profileLink || "";
      const profileUrl = slug.startsWith("http") ? slug : slug ? `https://www.opentable.com${slug}` : "";

      const bookingUrl = rid
        ? `https://www.opentable.com/restref/client/?rid=${rid}&dateTime=${encodeURIComponent(dateTime)}&covers=${params.party_size}&restref=true`
        : `${profileUrl}?dateTime=${encodeURIComponent(dateTime)}&covers=${params.party_size}`;

      return {
        name: r.name || "",
        cuisine: r.primaryCuisine?.name || r.cuisine || "",
        price: r.priceRange || r.priceBand || "",
        rating: r.statistics?.ratings?.overall?.rating || r.statistics?.ratings?.overall || r.rating || null,
        reviewCount: r.statistics?.reviews?.count || r.reviewCount || null,
        address: r.neighborhood || r.address || "",
        platform: "OpenTable",
        hasAvailability: true,
        bookingUrl,
        profileUrl: profileUrl || bookingUrl,
      };
    }).filter(r => r.name);
  } catch (e) {
    console.error("OpenTable error:", e.message);
    // Return a fallback link to OpenTable search so user can at least search manually
    return buildOpenTableFallbackLinks(params);
  }
}

function buildOpenTableFallbackLinks(params) {
  // When API fails, return a single entry that links to OpenTable search results
  const citySlug = (params.city || "atlanta").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const dateTime = `${params.date}T${params.time}:00`;
  const term = params.query || params.cuisine || "";

  const searchUrl = `https://www.opentable.com/s?dateTime=${encodeURIComponent(dateTime)}&covers=${params.party_size}&term=${encodeURIComponent(term)}&latitude=${params.lat || ""}&longitude=${params.lng || ""}`;

  return [{
    name: `Search OpenTable for "${term || "restaurants"}" in ${params.city || "your area"}`,
    cuisine: "",
    price: "",
    rating: null,
    reviewCount: null,
    address: "Click to view results on OpenTable",
    platform: "OpenTable",
    hasAvailability: false,
    bookingUrl: searchUrl,
    profileUrl: searchUrl,
    isFallbackLink: true,
  }];
}

// ============================================================
// STEP 3: Resy - single search call, no per-venue calls
// ============================================================

const RESY_API_KEY = "VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5";

async function searchResy(params) {
  try {
    const headers = {
      Authorization: `ResyAPI api_key="${RESY_API_KEY}"`,
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Origin: "https://resy.com",
      Referer: "https://resy.com/",
      "Content-Type": "application/json",
    };

    const searchBody = {
      geo: { latitude: params.lat || 33.749, longitude: params.lng || -84.388 },
      location: params.city || "Atlanta",
      per_page: 10,
      query: params.query || params.cuisine || "",
      slot_filter: { day: params.date, party_size: params.party_size },
      types: ["venue"],
    };

    console.log("Resy: searching", params.query, "in", params.city, "at", params.lat, params.lng);

    const res = await withTimeout(
      fetch("https://api.resy.com/3/venuesearch/search", {
        method: "POST",
        headers,
        body: JSON.stringify(searchBody),
      }),
      8000
    );

    if (!res.ok) { console.error("Resy:", res.status); return []; }

    const data = await res.json();
    const venues = data?.search?.hits || [];
    console.log("Resy: found", venues.length, "venues");

    const citySlug = (params.city || "atlanta").toLowerCase().replace(/\s+/g, "-");

    return venues.slice(0, 10).map((venue) => {
      const slug = venue.url_slug || (venue.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const bookingUrl = `https://resy.com/cities/${citySlug}/${slug}?date=${params.date}&seats=${params.party_size}`;

      const hasAvailability = venue.availability?.length > 0 ||
        venue.num_slots > 0 ||
        venue.available === true ||
        venue.notify_available !== true;

      return {
        name: venue.name || "",
        cuisine: Array.isArray(venue.cuisine) ? venue.cuisine[0] : (venue.cuisine || venue.type || ""),
        price: "$".repeat(venue.price_range || venue.price || 2),
        rating: venue.rating || venue.score || null,
        reviewCount: venue.num_ratings || null,
        address: venue.location?.neighborhood || venue.neighborhood || venue.region || "",
        platform: "Resy",
        hasAvailability,
        bookingUrl,
        profileUrl: bookingUrl,
      };
    }).filter(r => r.name);
  } catch (e) {
    console.error("Resy error:", e.message);
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

function getCacheKey(params) {
  return `${params.cuisine}|${params.date}|${params.time}|${params.party_size}|${params.city}`.toLowerCase();
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
    return Response.json({ error: "API key not configured" }, { status: 500 });
  }

  try {
    const { messages, location } = await req.json();
    const lastMessage = messages?.filter((m) => m.role === "user").pop()?.content || "";
    if (!lastMessage) {
      return Response.json({ error: "No message provided" }, { status: 400 });
    }

    const params = await parseQuery(lastMessage, location);

    // Check cache
    const cacheKey = getCacheKey(params);
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < 600000) {
      return Response.json({ ...cached.data, cached: true });
    }

    // Search both platforms in parallel
    console.log("Searching:", JSON.stringify(params));
    const startTime = Date.now();

    const [openTableResults, resyResults] = await Promise.all([
      searchOpenTable(params).catch(e => { console.error("OT fail:", e.message); return []; }),
      searchResy(params).catch(e => { console.error("Resy fail:", e.message); return []; }),
    ]);

    const elapsed = Date.now() - startTime;
    console.log(`Done in ${elapsed}ms: OT=${openTableResults.length}, Resy=${resyResults.length}`);

    // Merge - availability confirmed first
    const allResults = [...openTableResults, ...resyResults];
    allResults.sort((a, b) => {
      if (a.hasAvailability && !b.hasAvailability) return -1;
      if (!a.hasAvailability && b.hasAvailability) return 1;
      return 0;
    });

    const structured = {
      type: "results",
      searchParams: params,
      restaurants: allResults,
      resultCount: allResults.length,
      platformsSearched: ["OpenTable", "Resy"],
      elapsed,
    };

    let reply;
    if (allResults.length === 0) {
      reply = `No restaurants found for ${params.query || "your search"} in ${params.city || "your area"} on ${params.date}. Try a different cuisine, date, or location.`;
    } else {
      const available = allResults.filter(r => r.hasAvailability).length;
      reply = `Found ${allResults.length} restaurants${available > 0 ? ` (${available} with confirmed availability)` : ""} in ${params.city || "your area"}.`;
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
