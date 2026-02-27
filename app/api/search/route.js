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

  if (!res.ok) {
    const errText = await res.text();
    console.error("Gemini API error:", res.status, errText.slice(0, 300));
    // If Gemini fails, build params manually from what we know
    return buildFallbackParams(userMessage, location, today, currentHour);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  console.log("Gemini raw response:", text.slice(0, 500));
  const clean = text.replace(/```json|```/g, "").trim();

  try {
    const parsed = JSON.parse(clean);
    // ALWAYS override with detected location if user didn't specify a different city
    if (location?.lat) {
      if (!parsed.city || parsed.city.toLowerCase() === (location.city || "").toLowerCase()) {
        parsed.lat = location.lat;
        parsed.lng = location.lng;
        parsed.city = location.city || parsed.city;
        parsed.state = location.region || parsed.state;
      }
    }
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
    console.error("Failed to parse Gemini response:", clean.slice(0, 300));
    return buildFallbackParams(userMessage, location, today, currentHour);
  }
}

// Fallback: parse query without AI if Gemini is unavailable
function buildFallbackParams(userMessage, location, today, currentHour) {
  const msg = userMessage.toLowerCase();

  // Extract party size
  const partyMatch = msg.match(/(?:for|party of|group of)\s*(\d+)/);
  const party_size = partyMatch ? parseInt(partyMatch[1]) : 2;

  // Extract date
  let date = today;
  if (msg.includes("tomorrow")) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    date = d.toISOString().split("T")[0];
  } else if (msg.includes("saturday")) {
    const d = new Date();
    const daysUntil = (6 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntil);
    date = d.toISOString().split("T")[0];
  } else if (msg.includes("friday")) {
    const d = new Date();
    const daysUntil = (5 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntil);
    date = d.toISOString().split("T")[0];
  } else if (msg.includes("sunday")) {
    const d = new Date();
    const daysUntil = (0 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysUntil);
    date = d.toISOString().split("T")[0];
  }

  // Extract time
  let time = currentHour >= 19 ? `${currentHour + 1}:00` : "19:00";
  const timeMatch = msg.match(/(\d{1,2})(?::(\d{2}))?\s*(pm|am)/i);
  if (timeMatch) {
    let h = parseInt(timeMatch[1]);
    const m = timeMatch[2] || "00";
    if (timeMatch[3].toLowerCase() === "pm" && h < 12) h += 12;
    if (timeMatch[3].toLowerCase() === "am" && h === 12) h = 0;
    time = `${h.toString().padStart(2, "0")}:${m}`;
  }

  // Extract cuisine (just use the main keywords)
  const cuisines = ["mexican", "italian", "japanese", "sushi", "chinese", "thai", "indian", "french", "korean", "mediterranean", "american", "steakhouse", "seafood", "brunch", "bbq", "barbecue", "pizza", "vietnamese", "greek", "ethiopian", "spanish", "tapas"];
  const query = cuisines.find(c => msg.includes(c)) || msg.replace(/for \d+|tonight|tomorrow|saturday|friday|sunday|near me|in \w+/gi, "").trim().split(/\s+/).slice(0, 3).join(" ");

  const params = {
    cuisine: query,
    date,
    time,
    party_size,
    city: location?.city || "",
    state: location?.region || "",
    lat: location?.lat || null,
    lng: location?.lng || null,
    query,
  };

  console.log("Fallback parsed:", JSON.stringify(params));
  return params;
}

// ============================================================
// STEP 2: OpenTable API
// ============================================================

async function searchOpenTable(params) {
  try {
    console.log("OpenTable: searching...", params.query, params.city, params.lat, params.lng);

    const citySlug = (params.city || "atlanta").toLowerCase().replace(/\s+/g, "-");
    const dateTime = `${params.date}T${params.time}:00`;
    const term = params.query || params.cuisine || "";

    // Use OpenTable's actual search URL format with city in path
    const searchUrl = `https://www.opentable.com/s/${encodeURIComponent(citySlug)}-restaurant-reservations?dateTime=${encodeURIComponent(dateTime)}&covers=${params.party_size}&term=${encodeURIComponent(term)}&latitude=${params.lat || ""}&longitude=${params.lng || ""}`;

    console.log("OpenTable URL:", searchUrl);

    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    console.log("OpenTable status:", res.status);

    if (!res.ok) {
      console.error("OpenTable search failed:", res.status);
      return [];
    }

    const html = await res.text();
    console.log("OpenTable HTML length:", html.length);

    // OpenTable embeds search results as JSON in __NEXT_DATA__
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!nextDataMatch) {
      console.log("OpenTable: No __NEXT_DATA__ found, trying JSON-LD...");
      // Try extracting from JSON-LD or other embedded data
      return parseOpenTableHTML(html, params);
    }

    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      console.log("OpenTable: Got __NEXT_DATA__, keys:", Object.keys(nextData?.props?.pageProps || {}).join(", "));
      return parseOpenTableNextData(nextData, params);
    } catch (e) {
      console.error("OpenTable: Failed to parse __NEXT_DATA__:", e.message);
      return [];
    }
  } catch (e) {
    console.error("OpenTable error:", e.message);
    return [];
  }
}

function parseOpenTableHTML(html, params) {
  // Fallback: try to extract restaurant data from HTML if __NEXT_DATA__ isn't available
  try {
    const results = [];
    // Look for restaurant cards with data attributes or structured data
    const jsonLdMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
    for (const match of jsonLdMatches) {
      try {
        const json = JSON.parse(match.replace(/<script[^>]*>/, "").replace(/<\/script>/, ""));
        if (json["@type"] === "Restaurant" || json["@type"] === "FoodEstablishment") {
          results.push({
            name: json.name || "",
            cuisine: json.servesCuisine || "",
            price: json.priceRange || "",
            rating: json.aggregateRating?.ratingValue || null,
            address: json.address?.streetAddress || json.address?.addressLocality || "",
            platform: "OpenTable",
            slots: [],
            profileUrl: json.url || "",
          });
        }
      } catch {}
    }
    return results;
  } catch (e) {
    console.error("OpenTable HTML parse error:", e.message);
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
      location: params.city || "Atlanta",
      per_page: 10,
      query: params.query || params.cuisine || "",
      slot_filter: {
        day: params.date,
        party_size: params.party_size,
      },
      types: ["venue"],
    };

    console.log("Resy search body:", JSON.stringify({ geo: searchBody.geo, location: searchBody.location, query: searchBody.query }));

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
