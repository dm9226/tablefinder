export const maxDuration = 60;

// ─── Rate Limiting ───────────────────────────────────────────────────
const RATE_LIMIT = { windowMs: 60 * 60 * 1000, maxRequests: 30 };
const ipHits = new Map();

function rateLimit(ip) {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return { allowed: true, remaining: RATE_LIMIT.maxRequests - 1 };
  }
  if (entry.count >= RATE_LIMIT.maxRequests) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT.maxRequests - entry.count };
}

// ─── Response Cache ──────────────────────────────────────────────────
const CACHE_TTL = 10 * 60 * 1000;
const responseCache = new Map();

function getCacheKey(messages, location) {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMsg) return null;
  const loc = location ? `${location.city || ""}:${location.region || ""}` : "";
  return `${lastUserMsg.content.toLowerCase().trim().replace(/\s+/g, " ")}|${loc}`;
}

function getCachedResponse(key) {
  if (!key) return null;
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) { responseCache.delete(key); return null; }
  return entry;
}

function setCachedResponse(key, content, searchCount) {
  if (!key) return;
  responseCache.set(key, { content, searchCount, timestamp: Date.now() });
  if (responseCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of responseCache) {
      if (now - v.timestamp > CACHE_TTL) responseCache.delete(k);
    }
  }
}

// Cleanup every 10 min
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipHits) { if (now > entry.resetAt) ipHits.delete(ip); }
  for (const [k, v] of responseCache) { if (now - v.timestamp > CACHE_TTL) responseCache.delete(k); }
}, 10 * 60 * 1000);

// ─── System Prompt ───────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are TableFinder, an AI reservation concierge. You search across ALL major reservation platforms to find restaurants for users.

When a user gives you location, cuisine, date, party size, etc., use Google Search to find matching restaurants on these platforms:
- OpenTable (opentable.com)
- Resy (resy.com)
- Yelp Reservations (yelp.com)
- Tock / Exploretock
- SevenRooms
- Restaurant direct booking pages

BOOKING LINKS — THIS IS YOUR #1 JOB:
- Every restaurant MUST have a clickable booking link
- Use the ACTUAL URL from search results (opentable.com/r/..., resy.com/cities/..., etc.)
- If you find a restaurant on multiple platforms, list ALL booking links
- NEVER make up or guess URLs — only use URLs you actually found
- If you find a restaurant name but no booking URL, mention which platform it's likely on

RESPONSE FORMAT — use this exactly for each restaurant:

### 🍽 [Restaurant Name]
**Cuisine:** [Type] | **Price:** [$$-$$$$] | **Rating:** [X.X/5]
**📍** [Address or neighborhood]
**Book on OpenTable:** [actual opentable.com URL] ← include if found
**Book on Resy:** [actual resy.com URL] ← include if found
**Book on Yelp:** [actual yelp.com URL] ← include if found
[One sentence description or availability note]

---

RULES:
- Find 4-8 restaurants per search
- If you can't confirm exact time slots, say "Check platform for real-time availability" but STILL include the link
- Lead with results, not disclaimers
- Show EVERY platform a restaurant is available on, not just one
- End with: "⏱ Results may change quickly — click through to check real-time availability and book directly on the platform."
- If user mentions a large party (6+), note that large party availability is limited and suggest calling directly
- If user mentions dietary restrictions, factor that into your search

CRITICAL: You must find REAL booking URLs from OpenTable, Resy, and Yelp. These are the most important platforms.`;

export async function POST(request) {
  try {
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
    const limit = rateLimit(ip);

    if (!limit.allowed) {
      return Response.json(
        { error: `Rate limit exceeded. Try again in ${limit.retryAfter} seconds.` },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
      );
    }

    const { messages, location } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }

    // ── Check cache ──
    const cacheKey = getCacheKey(messages, location);
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      return Response.json({
        content: cached.content,
        searchCount: cached.searchCount,
        cached: true,
        cacheAge: Math.round((Date.now() - cached.timestamp) / 60000),
      });
    }

    // ── Build prompt with location context ──
    let systemInstruction = SYSTEM_PROMPT;
    if (location && (location.city || location.region)) {
      const locStr = [location.city, location.region, location.country].filter(Boolean).join(", ");
      systemInstruction += `\n\nUSER LOCATION: The user is currently in ${locStr}. If they say "near me", "nearby", "around here", or don't specify a location, use ${location.city || location.region} as the default location.`;
    }

    // ── Convert messages to Gemini format ──
    const geminiContents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "Server configuration error: missing API key" }, { status: 500 });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: geminiContents,
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          tools: [{ google_search: {} }],
          generationConfig: {
            maxOutputTokens: 4096,
            temperature: 0.7,
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("Gemini API error:", response.status, err);
      return Response.json({ error: `AI service error: ${response.status} - ${err.slice(0, 200)}` }, { status: response.status });
    }

    const data = await response.json();

    // ── Extract text from Gemini response ──
    let textContent = "";
    let searchCount = 0;

    if (data.candidates && data.candidates[0]) {
      const candidate = data.candidates[0];

      // Get text parts
      if (candidate.content && candidate.content.parts) {
        textContent = candidate.content.parts
          .filter((p) => p.text)
          .map((p) => p.text)
          .join("\n\n");
      }

      // Count grounding sources as "searches"
      if (candidate.groundingMetadata) {
        const gm = candidate.groundingMetadata;
        searchCount = (gm.webSearchQueries || []).length;
      }
    }

    if (!textContent) {
      textContent = "I couldn't find results for that query. Try being more specific about location and cuisine.";
    }

    // ── Cache and return ──
    setCachedResponse(cacheKey, textContent, searchCount);

    return Response.json({
      content: textContent,
      searchCount,
      cached: false,
    });
  } catch (err) {
    console.error("Search API error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
