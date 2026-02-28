"use client";
import { useState, useRef, useEffect, Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", background: "#1A1612", color: "#F0E6D8", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", flexDirection: "column", gap: 16, padding: 40 }}>
          <h2>Something went wrong</h2>
          <p style={{ color: "#8A7E70", maxWidth: 400, textAlign: "center" }}>{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()} style={{ padding: "10px 20px", background: "#E8A86D", color: "#1A1612", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Wrapper() {
  return <ErrorBoundary><TableFinder /></ErrorBoundary>;
}

function safe(val) {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  if (typeof val === "object") return val.name || val.label || val.average || val.value || "";
  return String(val);
}

// ============================================================
// Components
// ============================================================

function PlatformBadge({ platform }) {
  const colors = {
    Resy: { bg: "rgba(0,100,255,0.08)", text: "#4A90D9", border: "rgba(0,100,255,0.2)" },
    Yelp: { bg: "rgba(196,18,0,0.08)", text: "#C41200", border: "rgba(196,18,0,0.2)" },
  };
  const c = colors[platform] || { bg: "rgba(255,255,255,0.05)", text: "#aaa", border: "rgba(255,255,255,0.1)" };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: c.text, background: c.bg, border: `1px solid ${c.border}`, padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap" }}>
      {platform}
    </span>
  );
}

function BookingButton({ restaurant }) {
  const isResy = restaurant.platform === "Resy";
  const color = isResy ? { bg: "rgba(72,128,255,0.12)", border: "rgba(72,128,255,0.35)", text: "#4880FF", hover: "rgba(72,128,255,0.22)" }
    : { bg: "rgba(196,18,0,0.10)", border: "rgba(196,18,0,0.30)", text: "#C41200", hover: "rgba(196,18,0,0.18)" };
  const label = isResy ? "Reserve on Resy →" : "Reserve on Yelp →";

  return (
    <a href={restaurant.bookingUrl} target="_blank" rel="noopener noreferrer"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px", background: color.bg, border: `1px solid ${color.border}`, borderRadius: 8, color: color.text, fontSize: 13, fontWeight: 600, fontFamily: "'Outfit', sans-serif", textDecoration: "none", cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = color.hover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = color.bg; }}
    >
      {label}
    </a>
  );
}

function RestaurantCard({ restaurant }) {
  const ratingVal = typeof restaurant.rating === "object" ? restaurant.rating?.average : Number(restaurant.rating);
  const showRating = ratingVal > 0;

  return (
    <div className="result-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "20px 24px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontFamily: "'Playfair Display', Georgia, serif", color: "#F0E6D8", fontWeight: 500 }}>
            <a href={restaurant.profileUrl || restaurant.bookingUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#F0E6D8", textDecoration: "none" }}>
              {restaurant.name}
            </a>
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginTop: 4, fontSize: 13, color: "#8A7E70" }}>
            {restaurant.cuisine && <span>{safe(restaurant.cuisine)}</span>}
            {restaurant.price && <span>{safe(restaurant.price)}</span>}
            {showRating && <span>★ {ratingVal}{restaurant.reviewCount ? ` (${safe(restaurant.reviewCount)})` : ""}</span>}
          </div>
          {restaurant.address && (
            <div style={{ fontSize: 12, color: "#6A5E50", marginTop: 4 }}>{safe(restaurant.address)}</div>
          )}
        </div>
        <PlatformBadge platform={restaurant.platform} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
        <BookingButton restaurant={restaurant} />
        <span style={{ fontSize: 12, color: "#6BBF6B", fontWeight: 500 }}>✓ Available</span>
        {restaurant.distance && <span style={{ fontSize: 12, color: "#6A5E50" }}>{safe(restaurant.distance)}</span>}
      </div>
    </div>
  );
}

function SearchSummary({ structured }) {
  if (!structured?.searchParams) return null;
  const p = structured.searchParams;
  return (
    <div style={{ background: "rgba(232,168,109,0.05)", border: "1px solid rgba(232,168,109,0.15)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#C4B8A8" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
        <span><strong style={{ color: "#6BBF6B" }}>{structured.resultCount}</strong> available</span>
        <span style={{ opacity: 0.6 }}>|</span>
        <span>{safe(p.query || p.cuisine) || "All cuisines"}</span>
        <span>{safe(p.city)}</span>
        <span>{safe(p.date)} at {safe(p.time)}</span>
        <span>Party of {safe(p.party_size)}</span>
        {structured.elapsed && <span style={{ opacity: 0.4, fontSize: 11 }}>{(structured.elapsed / 1000).toFixed(1)}s</span>}
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP — single page, search on hero
// ============================================================

function TableFinder() {
  const [results, setResults] = useState(null); // { structured, reply, cached }
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const [searchHistory, setSearchHistory] = useState([]);
  const inputRef = useRef(null);
  const resultsRef = useRef(null);

  const detectLocation = () => {
    if (!navigator.geolocation) { setLocationError(true); return; }
    setLocationLoading(true);
    setLocationError(false);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
          const data = await res.json();
          setUserLocation({
            city: data.city || data.locality || "",
            region: data.principalSubdivision || "",
            zip: data.postcode || "",
            neighborhood: data.localityInfo?.administrative?.[3]?.name || data.localityInfo?.administrative?.[2]?.name || "",
            lat: latitude, lng: longitude,
          });
        } catch {
          setUserLocation({ city: "", region: "", zip: "", neighborhood: "", lat: latitude, lng: longitude });
        }
        setLocationLoading(false);
      },
      () => { setLocationError(true); setLocationLoading(false); },
      { timeout: 10000 }
    );
  };

  useEffect(() => { detectLocation(); }, []);

  const search = async (overrideText) => {
    const text = (overrideText || input).trim();
    if (!text || loading) return;
    if (!overrideText) setInput("");
    setLoading(true);
    setResults(null);

    try {
      const now = new Date();
      const localDate = now.toLocaleDateString('en-CA'); // YYYY-MM-DD
      const localHour = now.getHours();
      const localTime = `${localHour.toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: text }],
          location: userLocation,
          localDate,
          localTime,
          localHour,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setResults({
        query: text,
        structured: data.structured || null,
        reply: data.reply || "No results found.",
        cached: data.cached || false,
      });

      // Save to history
      setSearchHistory(prev => [text, ...prev.filter(h => h !== text)].slice(0, 5));

      // Scroll to results
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (e) {
      setResults({ query: text, structured: null, reply: `Something went wrong: ${e.message}`, cached: false });
    }

    setLoading(false);
  };

  const locationLabel = userLocation?.neighborhood || userLocation?.city;
  const locationDetail = locationLabel ? `${locationLabel}${userLocation.zip ? ` ${userLocation.zip}` : ""}` : null;

  return (
    <div style={{ minHeight: "100vh", background: "#1A1612", color: "#F0E6D8", fontFamily: "'Outfit', sans-serif" }}>
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=Outfit:wght@300;400;500;600&display=swap");
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #1A1612; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .result-card { animation: fadeIn 0.3s ease-out; }
        input::placeholder { color: #6A5E50; }
      `}</style>

      {/* Header */}
      <header style={{ position: "sticky", top: 0, background: "rgba(26,22,18,0.95)", backdropFilter: "blur(12px)", zIndex: 10, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => { setResults(null); setInput(""); }}>
            <span style={{ fontSize: 20, color: "#E8A86D" }}>&#9673;</span>
            <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 18, color: "#F0E6D8", fontWeight: 400 }}>TableFinder</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(232,168,109,0.1)", padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500, color: "#E8A86D" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#E8A86D", animation: "pulse 1.2s infinite" }} />
                Searching
              </div>
            )}
            {locationDetail ? (
              <span style={{ fontSize: 12, color: "#8A7E70", fontWeight: 500 }}>📍 {locationDetail}</span>
            ) : (
              <button onClick={detectLocation} disabled={locationLoading}
                style={{ fontSize: 11, color: "#E8A86D", fontWeight: 500, background: "none", border: "1px solid rgba(232,168,109,0.25)", borderRadius: 16, padding: "4px 10px", cursor: "pointer", fontFamily: "'Outfit', sans-serif" }}>
                {locationLoading ? "..." : "📍 Detect"}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero + Search */}
      <div style={{ maxWidth: 780, margin: "0 auto", padding: results ? "24px 20px 16px" : "80px 20px 40px", textAlign: "center", transition: "padding 0.3s" }}>
        {!results && (
          <>
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "clamp(32px, 5vw, 48px)", fontWeight: 400, lineHeight: 1.15, color: "#F0E6D8", marginBottom: 12 }}>
              Every table. One search.
            </h1>
            <p style={{ fontSize: 16, color: "#8A7E70", maxWidth: 440, margin: "0 auto 28px", lineHeight: 1.5 }}>
              Search Resy & Yelp for restaurants with available reservations near you.
            </p>
          </>
        )}

        {/* Search bar — always visible */}
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ display: "flex", gap: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "6px 6px 6px 18px", alignItems: "center" }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder={userLocation?.city ? `Italian for 2, tonight in ${userLocation.city}...` : "Italian for 2, tonight..."}
              disabled={loading}
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "#F0E6D8", fontSize: 15, fontFamily: "'Outfit', sans-serif", padding: "10px 0" }}
            />
            <button
              onClick={() => search()}
              disabled={loading || !input.trim()}
              style={{ background: input.trim() ? "#E8A86D" : "rgba(232,168,109,0.2)", color: "#1A1612", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 14, cursor: input.trim() ? "pointer" : "default", transition: "all 0.2s", fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}
            >
              {loading ? "..." : "Search"}
            </button>
          </div>
        </div>

        {/* Quick suggestions removed */}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "20px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#8A7E70", fontSize: 14 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#E8A86D", animation: `pulse 1.2s infinite ${i * 0.2}s` }} />
            ))}
          </div>
          Searching Resy & Yelp...
        </div>
      )}

      {/* Results */}
      {results && (
        <div ref={resultsRef} style={{ maxWidth: 780, margin: "0 auto", padding: "0 20px 60px" }}>
          {/* What was searched */}
          <div style={{ fontSize: 13, color: "#6A5E50", marginBottom: 12 }}>
            Results for <span style={{ color: "#C4B8A8", fontWeight: 500 }}>"{results.query}"</span>
            {results.cached && <span style={{ color: "#7BC47F", marginLeft: 8 }}>⚡ cached</span>}
          </div>

          {results.structured?.restaurants?.length > 0 ? (
            <>
              <SearchSummary structured={results.structured} />
              {results.structured.restaurants.map((r, i) => (
                <RestaurantCard key={i} restaurant={r} />
              ))}
            </>
          ) : (
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", padding: "20px 24px", borderRadius: 12, fontSize: 15, lineHeight: 1.6, color: "#C4B8A8" }}>
              {results.reply}
            </div>
          )}
        </div>
      )}

      {/* How it works — only on home with no results */}
      {!results && !loading && (
        <div style={{ maxWidth: 700, margin: "0 auto", padding: "40px 24px 60px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 24 }}>
            {[
              { step: "01", title: "Describe", desc: "Cuisine, date, party size — just type naturally." },
              { step: "02", title: "Discover", desc: "We search Resy & Yelp for real-time availability." },
              { step: "03", title: "Book", desc: "Click to reserve directly. No middleman." },
            ].map((item) => (
              <div key={item.step} style={{ padding: 20, background: "rgba(255,255,255,0.02)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ fontSize: 11, color: "#E8A86D", fontWeight: 600, letterSpacing: 2, marginBottom: 8 }}>{item.step}</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: "#F0E6D8", marginBottom: 6 }}>{item.title}</div>
                <div style={{ fontSize: 13, color: "#8A7E70", lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{ textAlign: "center", padding: "20px 24px", fontSize: 11, color: "rgba(255,255,255,0.15)" }}>
        Real-time availability from Resy & Yelp · tablefinder.ai
      </footer>
    </div>
  );
}
