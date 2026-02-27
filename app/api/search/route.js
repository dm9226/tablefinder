export const maxDuration = 60; // Allow up to 60s for AI + web search

// ─── Rate Limiting ───────────────────────────────────────────────────
// Simple in-memory rate limiter. Works per serverless instance — not
// bulletproof across cold starts, but catches most abuse. For heavier
// traffic, swap in Vercel KV or Upstash Redis (see README).
const RATE_LIMIT = {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 20,           // 20 searches per hour per IP
};

const ipHits = new Map(); // Map<ip, { count, resetAt }>

function rateLimit(ip) {
  const now = Date.now();
  const entry = ipHits.get(ip);

  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return { allowed: true, remaining: RATE_LIMIT.maxRequests - 1 };
  }

  if (entry.count >= RATE_LIMIT.maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT.maxRequests - entry.count };
}

// Clean up stale entries every 10 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipHits) {
    if (now > entry.resetAt) ipHits.delete(ip);
  }
}, 10 * 60 * 1000);

// ─── System Prompt ───────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are TableFinder, an AI reservation concierge. You help users find available restaurant reservations across all major platforms.

CRITICAL INSTRUCTIONS:
1. When a user provides their requirements (location, date/time, party size, cuisine), IMMEDIATELY search for matching restaurants.
2. Search MULTIPLE times with different queries to cover different platforms:
   - "[cuisine] restaurant [location] OpenTable reservation"
   - "[cuisine] restaurant [location] Resy"  
   - "[location] restaurants available [date]"
   - "[restaurant name] reservation [platform]" for specific restaurants
3. For EVERY restaurant you find, you MUST include a direct booking link. Use these URL patterns:
   - OpenTable: https://www.opentable.com/r/[restaurant-slug] (find the actual URL from search results)
   - Resy: https://resy.com/cities/[city]/[restaurant-slug] (find the actual URL from search results)  
   - Yelp: https://www.yelp.com/reservations/[restaurant-slug] (find the actual URL)
   - Google: The Google Maps or reserve URL from search results
   - Restaurant's own website booking page if available
   ALWAYS prefer the ACTUAL URLs you find in search results over constructed ones.

4. Present results in this EXACT format for each restaurant (use this structure precisely):

### 🍽 [Restaurant Name]
**Cuisine:** [Type] | **Price:** [$$-$$$$] | **Rating:** [X.X/5 or X/5]
**Platform:** [OpenTable/Resy/Yelp/etc.]
**📍** [Address or neighborhood]
**🔗 Book now:** [ACTUAL booking URL from search results]
[One sentence about the restaurant or availability note]

---

5. Find at least 4-6 restaurants when possible. Search broadly.
6. If you cannot confirm exact time-slot availability, say "Check platform for current availability" but STILL provide the booking link.
7. Be conversational but efficient. Lead with results, not disclaimers.
8. If the user asks a follow-up, maintain context about their original search.
9. At the end of your results, add a brief note: "Click any booking link to check real-time availability and complete your reservation directly on the platform."

IMPORTANT: Your PRIMARY job is to find REAL booking URLs. Every restaurant MUST have a clickable link to where the user can actually make a reservation. Search thoroughly to find these URLs.`;

export async function POST(request) {
  try {
    // ── Rate limit check ──
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
    const limit = rateLimit(ip);

    if (!limit.allowed) {
      return Response.json(
        { error: `Rate limit exceeded. Try again in ${limit.retryAfter} seconds.` },
        {
          status: 429,
          headers: {
            "Retry-After": String(limit.retryAfter),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: "Invalid request: messages array required" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "Server configuration error: missing API key" }, { status: 500 });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic API error:", err);
      return Response.json({ error: "AI service error" }, { status: response.status });
    }

    const data = await response.json();

    // Extract only what the client needs
    const textContent = data.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n\n");

    const searchCount = data.content.filter((block) => block.type === "tool_use").length;

    return Response.json({
      content: textContent,
      searchCount,
    });
  } catch (err) {
    console.error("Search API error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
