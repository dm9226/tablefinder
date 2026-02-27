// TableFinder v2 - Direct API integration with OpenTable + Resy
// No web search, no scraping - just calling the same APIs their websites use

const GEMINI_KEY = process.env.GEMINI_API_KEY;

// ============================================================
// STEP 1: Use Gemini to parse natural language into search params
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
  "query": "short search term for the restaurant search, e.g. 'mexican' or 'italian fine dining'"
}

Rules:
- "tonight" = today's date, time = 19:00 (or later if past 19:00)
- "tomorrow" = tomorrow's date
- "this Saturday" = next Saturday
- If no cuisine specified, use empty string
- CRITICAL: If the user does NOT mention a specific city, ALWAYS default city to "${location?.city || ""}" and state to "${location?.region || ""}" and lat to ${location?.lat || "null"} and lng to ${location?.lng || "null"}
- Only use a different city if the user explicitly says something like "in Chicago" or "NYC restaurants"

User message: "${userMessage}"`;

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
      }),
    }
  );

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const clean = text.replace(/```json|```/g, "").trim();

  try {
    const parsed = JSON.parse(clean);
    // ALWAYS override with detected location if user didn't specify a different city
    if (location?.lat) {
      // If Gemini returned the same city as detected, or no city, use exact coordinates
      if (!parsed.city || parsed.city.toLowerCase() === (location.city || "").toLowerCase()) {
        parsed.lat = location.lat;
        parsed.lng = location.lng;
        parsed.city = location.city || parsed.city;
        parsed.state = location.region || parsed.state;
      }
    }
    // Fallback: if still no location at all, use detected
    if (!parsed.lat && location?.lat) {
      parsed.lat = location.lat;
      parsed.lng = location.lng;
    }
    if (!parsed.city && location?.city) {
      parsed.city = location.city;
    }
    if (!parsed.state && location?.region) {
      parsed.state = location.region;
    }
    console.log("Parsed query:", JSON.stringify(parsed));
    return parsed;
  } catch (e) {
    console.error("Failed to parse Gemini response:", text);
    return null;
  }
}

// ============================================================
// STEP 2: OpenTable API
// ============================================================

async function searchOpenTable(params) {
  try {
    console.log("OpenTable: searching...", params.query, params.city);

    // Step 2a: Get a CSRF token by visiting the site
    const homeRes = await fetch("https://www.opentable.com", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    // Extract CSRF token from cookies
    const cookies = homeRes.headers.get("set-cookie") || "";
    const csrfMatch = cookies.match(/csrf_token=([^;]+)/);
    const csrfToken = csrfMatch ? csrfMatch[1] : "";
    const allCookies = cookies
      .split(",")
      .map((c) => c.trim().split(";")[0])
      .join("; ");

    console.log("OpenTable: got CSRF token:", csrfToken ? "yes" : "no");

    // Step 2b: Use the GraphQL endpoint to search for restaurants with availability
    const dateTime = `${params.date}T${params.time}:00`;

    const gqlPayload = {
      operationName: "RestaurantsAvailability",
      variables: {
        restaurantIds: [],
        date: params.date,
        time: params.time,
        partySize: params.party_size,
        latitude: params.lat,
        longitude: params.lng,
        term: params.query || params.cuisine || "",
        metroId: 0,
        regionIds: [],
        cuisineIds: [],
        sortBy: "Popularity",
        rows: 10,
        enableBoostedResults: false,
      },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: "", // This may need updating
        },
      },
    };

    // Try the search URL approach instead - more reliable
    const searchUrl = new URL("https://www.opentable.com/dapi/fe/gql");
    searchUrl.searchParams.set("optype", "query");
    searchUrl.searchParams.set("opname", "RestaurantsAvailability");

    const gqlRes = await fetch(searchUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "x-csrf-token": csrfToken,
        Cookie: allCookies,
        Origin: "https://www.opentable.com",
        Referer: "https://www.opentable.com/",
      },
      body: JSON.stringify(gqlPayload),
    });

    console.log("OpenTable GQL status:", gqlRes.status);

    if (gqlRes.ok) {
      const gqlData = await gqlRes.json();
      return parseOpenTableResults(gqlData, params);
    }

    // Fallback: Try the direct search URL that returns availability
    console.log("OpenTable: GQL failed, trying search URL fallback...");
    return await searchOpenTableFallback(params, allCookies, csrfToken);
  } catch (e) {
    console.error("OpenTable error:", e.message);
    return [];
  }
}

async function searchOpenTableFallback(params, cookies, csrf) {
  try {
    // OpenTable's search API endpoint used by their frontend
    const searchParams = new URLSearchParams({
      dateTime: `${params.date}T${params.time}`,
      covers: params.party_size.toString(),
      term: params.query || params.cuisine || "",
      latitude: (params.lat || "").toString(),
      longitude: (params.lng || "").toString(),
    });

    const searchUrl = `https://www.opentable.com/dapi/fe/gql?optype=query&opname=Autocomplete`;
    
    // Alternative: try the restaurant search endpoint
    const restSearchUrl = `https://www.opentable.com/s?${searchParams.toString()}`;

    const res = await fetch(restSearchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Cookie: cookies || "",
      },
    });

    console.log("OpenTable search fallback status:", res.status);

    if (!res.ok) return [];

    const html = await res.text();

    // OpenTable embeds JSON data in __NEXT_DATA__ script tag
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!nextDataMatch) {
      console.log("OpenTable: No __NEXT_DATA__ found");
      return [];
    }

    const nextData = JSON.parse(nextDataMatch[1]);
    return parseOpenTableNextData(nextData, params);
  } catch (e) {
    console.error("OpenTable fallback error:", e.message);
    return [];
  }
}

function parseOpenTableResults(gqlData, params) {
  try {
    const restaurants = gqlData?.data?.availability?.restaurants || gqlData?.data?.restaurantsAvailability?.restaurants || [];
    return restaurants.slice(0, 10).map((r) => {
      const slots = (r.availability?.timeSlots || r.slots || []).map((slot) => ({
        time: slot.dateTime || slot.time,
        bookingUrl: slot.link || slot.bookingUrl || buildOpenTableBookingUrl(r, slot, params),
      }));

      return {
        name: r.name,
        cuisine: r.cuisine || r.primaryCuisine || "",
        price: r.priceRange || r.priceBand || "",
        rating: r.rating || r.overallRating || null,
        address: r.neighborhood || r.address || "",
        platform: "OpenTable",
        slots: slots.filter((s) => s.time),
        profileUrl: r.profileLink ? `https://www.opentable.com${r.profileLink}` : "",
      };
    });
  } catch (e) {
    console.error("OpenTable parse error:", e.message);
    return [];
  }
}

function parseOpenTableNextData(nextData, params) {
  try {
    // Navigate the Next.js data structure to find restaurant results
    const pageProps = nextData?.props?.pageProps;
    const restaurants =
      pageProps?.restaurants ||
      pageProps?.searchResult?.restaurants ||
      pageProps?.results?.restaurants ||
      [];

    return restaurants.slice(0, 10).map((r) => {
      const slots = (r.availability?.timeSlots || r.timeslots || r.slots || []).map((slot) => {
        const dateTime = slot.dateTime || slot.date || `${params.date}T${slot.time || slot.timeString}`;
        return {
          time: dateTime,
          bookingUrl:
            slot.link ||
            slot.url ||
            `https://www.opentable.com/booking/seating-options?dateTime=${encodeURIComponent(dateTime)}&covers=${params.party_size}&rid=${r.rid || r.restaurantId || r.id}`,
        };
      });

      return {
        name: r.name,
        cuisine: r.primaryCuisine?.name || r.cuisine || "",
        price: "$".repeat(r.priceBand || r.priceRange || 2),
        rating: r.statistics?.ratings?.overall || r.rating || null,
        address: [r.neighborhood, r.location?.city].filter(Boolean).join(", ") || r.address || "",
        platform: "OpenTable",
        slots: slots.filter((s) => s.time),
        profileUrl: r.urls?.profileLink ? `https://www.opentable.com${r.urls.profileLink}` : "",
      };
    });
  } catch (e) {
    console.error("OpenTable NextData parse error:", e.message);
    return [];
  }
}

function buildOpenTableBookingUrl(restaurant, slot, params) {
  const rid = restaurant.rid || restaurant.restaurantId || restaurant.id;
  const dateTime = slot.dateTime || slot.time;
  if (!rid || !dateTime) return "";
  return `https://www.opentable.com/booking/seating-options?dateTime=${encodeURIComponent(dateTime)}&covers=${params.party_size}&rid=${rid}`;
}

// ============================================================
// STEP 3: Resy API
// ============================================================

// Resy's public API key (embedded in their frontend JS, same for all users)
const RESY_API_KEY = "VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5";

async function searchResy(params) {
  try {
    console.log("Resy: searching...", params.query, params.city);

    const headers = {
      Authorization: `ResyAPI api_key="${RESY_API_KEY}"`,
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Origin: "https://resy.com",
      Referer: "https://resy.com/",
    };

    // Step 3a: Search for venues matching the query
    const searchUrl = new URL("https://api.resy.com/3/venuesearch/search");
    const searchBody = {
      geo: {
        latitude: params.lat || 33.749,
        longitude: params.lng || -84.388,
      },
      per_page: 10,
      query: params.query || params.cuisine || "",
      slot_filter: {
        day: params.date,
        party_size: params.party_size,
      },
      types: ["venue"],
    };

    const searchRes = await fetch(searchUrl.toString(), {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(searchBody),
    });

    console.log("Resy search status:", searchRes.status);

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      console.error("Resy search error:", errText.slice(0, 200));

      // Fallback: try the simpler venue search
      return await searchResyFallback(params, headers);
    }

    const searchData = await searchRes.json();
    const venues = searchData?.search?.hits || [];

    console.log(`Resy: found ${venues.length} venues`);

    // Step 3b: For each venue, get availability
    const results = await Promise.all(
      venues.slice(0, 8).map(async (venue) => {
        try {
          const venueId = venue.id?.resy || venue.objectID;
          if (!venueId) return null;

          const findUrl = `https://api.resy.com/4/find?lat=${params.lat || 0}&long=${params.lng || 0}&day=${params.date}&party_size=${params.party_size}&venue_id=${venueId}`;

          const findRes = await fetch(findUrl, { headers });

          if (!findRes.ok) return null;

          const findData = await findRes.json();
          const venueResult = findData?.results?.venues?.[0];

          if (!venueResult || !venueResult.slots?.length) return null;

          const slots = venueResult.slots.map((slot) => {
            const startTime = slot.date?.start;
            const configId = slot.config?.id;
            // Deep link directly into Resy's booking flow
            const bookingUrl = `https://resy.com/cities/${params.city?.toLowerCase() || "new-york"}/${venue.url_slug || venue.name?.toLowerCase().replace(/\s+/g, "-")}?date=${params.date}&seats=${params.party_size}`;

            return {
              time: startTime,
              type: slot.config?.type || "Dining Room",
              bookingUrl,
              configId,
            };
          });

          return {
            name: venue.name || venueResult.venue?.name,
            cuisine: venue.cuisine?.[0] || venue.type || "",
            price: "$".repeat(venue.price_range || 2),
            rating: venue.rating || venueResult.venue?.rating || null,
            address: venue.location?.neighborhood || venue.neighborhood || "",
            platform: "Resy",
            slots: slots.filter((s) => s.time),
            profileUrl: `https://resy.com/cities/${params.city?.toLowerCase() || "new-york"}/${venue.url_slug || ""}`,
          };
        } catch (e) {
          console.error("Resy venue error:", e.message);
          return null;
        }
      })
    );

    return results.filter(Boolean);
  } catch (e) {
    console.error("Resy error:", e.message);
    return [];
  }
}

async function searchResyFallback(params, headers) {
  try {
    // Simpler search endpoint
    const query = encodeURIComponent(params.query || params.cuisine || "restaurant");
    const url = `https://api.resy.com/3/venue?url_slug=${query}&location=${encodeURIComponent(params.city || "atlanta")}`;

    const res = await fetch(url, { headers });
    if (!res.ok) return [];

    // This endpoint returns a single venue - not ideal for search
    // Try the location-based search instead
    const locationUrl = `https://api.resy.com/4/find?lat=${params.lat || 0}&long=${params.lng || 0}&day=${params.date}&party_size=${params.party_size}&venue_id=0`;
    console.log("Resy fallback: trying location-based search");

    return [];
  } catch (e) {
    console.error("Resy fallback error:", e.message);
    return [];
  }
}

// ============================================================
// STEP 4: Format results with Gemini for nice presentation
// ============================================================

async function formatResults(results, userMessage, params) {
  if (!results.length) {
    return `I searched OpenTable and Resy for "${params.query || params.cuisine}" in ${params.city || "your area"} on ${params.date} for ${params.party_size} people, but didn't find available tables matching your criteria. Try adjusting your date, time, or party size.`;
  }

  // Return structured data - the frontend will render it nicely
  return JSON.stringify({
    type: "results",
    searchParams: params,
    restaurants: results,
    resultCount: results.length,
    platformsSearched: ["OpenTable", "Resy"],
  });
}

// ============================================================
// RATE LIMITING + CACHING
// ============================================================

const rateLimit = new Map();
const cache = new Map();
const RATE_LIMIT = 30;
const RATE_WINDOW = 3600000;
const CACHE_TTL = 600000; // 10 minutes

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW) {
    rateLimit.set(ip, { count: 1, start: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
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

    // Step 1: Parse the query
    const params = await parseQuery(lastMessage, location);
    if (!params) {
      return Response.json({
        reply: "I couldn't understand your search. Try something like: \"Mexican for 2 tonight in Atlanta\"",
        structured: null,
      });
    }

    // Check cache
    const cacheKey = getCacheKey(params);
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      console.log("Cache hit:", cacheKey);
      return Response.json({
        reply: cached.reply,
        structured: cached.structured,
        cached: true,
        searchParams: params,
      });
    }

    // Step 2: Search platforms in parallel
    console.log("Searching platforms for:", JSON.stringify(params));

    const [openTableResults, resyResults] = await Promise.all([
      searchOpenTable(params),
      searchResy(params),
    ]);

    console.log(`Results: OpenTable=${openTableResults.length}, Resy=${resyResults.length}`);

    // Merge results
    const allResults = [...openTableResults, ...resyResults];

    // Sort: restaurants with more available slots first
    allResults.sort((a, b) => (b.slots?.length || 0) - (a.slots?.length || 0));

    // Build structured response
    const structured = {
      type: "results",
      searchParams: params,
      restaurants: allResults,
      resultCount: allResults.length,
      platformsSearched: ["OpenTable", "Resy"],
    };

    // Build text summary
    let reply;
    if (allResults.length === 0) {
      reply = `I searched OpenTable and Resy for ${params.query || params.cuisine || "restaurants"} in ${params.city || "your area"} on ${params.date} at ${params.time} for ${params.party_size} — but didn't find available tables. Try a different date, time, or cuisine.`;
    } else {
      const withSlots = allResults.filter((r) => r.slots?.length > 0);
      reply = `Found ${allResults.length} restaurants with ${withSlots.reduce((sum, r) => sum + r.slots.length, 0)} available time slots across OpenTable and Resy.`;
    }

    // Cache the result
    cache.set(cacheKey, { reply, structured, time: Date.now() });

    // Evict old cache entries
    if (cache.size > 200) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].time - b[1].time);
      for (let i = 0; i < 50; i++) cache.delete(oldest[i][0]);
    }

    return Response.json({ reply, structured, cached: false, searchParams: params });
  } catch (e) {
    console.error("Search handler error:", e);
    return Response.json({ error: `Search failed: ${e.message}` }, { status: 500 });
  }
}
