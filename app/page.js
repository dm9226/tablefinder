"use client";
import { useState, useRef, useEffect, Component } from "react";

// Error boundary to catch render crashes
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", background: "#1A1612", color: "#F0E6D8", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", flexDirection: "column", gap: 16, padding: 40 }}>
          <h2>Something went wrong</h2>
          <p style={{ color: "#8A7E70", maxWidth: 400, textAlign: "center" }}>{this.state.error?.message || "Unknown error"}</p>
          <button onClick={() => window.location.reload()} style={{ padding: "10px 20px", background: "#E8A86D", color: "#1A1612", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function TableFinderWrapper() {
  return <ErrorBoundary><TableFinder /></ErrorBoundary>;
}

// Safely convert any value to a displayable string
function safe(val) {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  if (typeof val === "object") {
    return val.name || val.label || val.text || val.average || val.value || JSON.stringify(val);
  }
  return String(val);
}

function formatTime(dateTimeStr) {
  if (!dateTimeStr) return "";
  try {
    const d = new Date(dateTimeStr);
    if (isNaN(d.getTime())) {
      // Try parsing "HH:MM" format
      const parts = dateTimeStr.match(/(\d{1,2}):(\d{2})/);
      if (parts) {
        const h = parseInt(parts[1]);
        const m = parts[2];
        const ampm = h >= 12 ? "PM" : "AM";
        const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
        return `${h12}:${m} ${ampm}`;
      }
      return dateTimeStr;
    }
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return dateTimeStr;
  }
}

function PlatformBadge({ platform }) {
  const colors = {
    OpenTable: { bg: "rgba(218,55,67,0.12)", text: "#DA3743", border: "rgba(218,55,67,0.25)" },
    Resy: { bg: "rgba(0,100,255,0.08)", text: "#4A90D9", border: "rgba(0,100,255,0.2)" },
  };
  const c = colors[platform] || { bg: "rgba(255,255,255,0.05)", text: "#aaa", border: "rgba(255,255,255,0.1)" };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: c.text, background: c.bg, border: `1px solid ${c.border}`, padding: "3px 8px", borderRadius: 4 }}>
      {platform}
    </span>
  );
}

function TimeSlotButton({ slot }) {
  const time = formatTime(slot.time);
  if (!time) return null;
  return (
    <a
      href={slot.bookingUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: "inline-block", padding: "8px 16px", background: "rgba(232,168,109,0.1)", border: "1px solid rgba(232,168,109,0.3)", borderRadius: 8, color: "#E8A86D", fontSize: 14, fontWeight: 600, fontFamily: "'Outfit', sans-serif", textDecoration: "none", cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap" }}
      onMouseEnter={(e) => { e.target.style.background = "rgba(232,168,109,0.2)"; e.target.style.borderColor = "#E8A86D"; }}
      onMouseLeave={(e) => { e.target.style.background = "rgba(232,168,109,0.1)"; e.target.style.borderColor = "rgba(232,168,109,0.3)"; }}
    >
      {time}
      {slot.type && slot.type !== "Dining Room" && (
        <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>{safe(slot.type)}</span>
      )}
    </a>
  );
}

function RestaurantCard({ restaurant }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "20px 24px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontFamily: "'Playfair Display', Georgia, serif", color: "#F0E6D8", fontWeight: 500 }}>
            {restaurant.profileUrl ? (
              <a href={restaurant.profileUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#F0E6D8", textDecoration: "none" }}>
                {restaurant.name}
              </a>
            ) : (
              restaurant.name
            )}
          </h3>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 4, fontSize: 13, color: "#8A7E70" }}>
            {restaurant.cuisine && <span>{safe(restaurant.cuisine)}</span>}
            {restaurant.price && <span>{safe(restaurant.price)}</span>}
            {restaurant.rating != null && (() => {
              const r = typeof restaurant.rating === "object" ? restaurant.rating.average || restaurant.rating.overall : Number(restaurant.rating);
              return r > 0 ? <span>{"★".repeat(Math.min(5, Math.round(r)))} {r}</span> : null;
            })()}
          </div>
          {restaurant.address && (
            <div style={{ fontSize: 12, color: "#6A5E50", marginTop: 4 }}>
              {safe(restaurant.address)}
            </div>
          )}
        </div>
        <PlatformBadge platform={restaurant.platform} />
      </div>

      {restaurant.slots?.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {restaurant.slots.map((slot, i) => (
            <TimeSlotButton key={i} slot={slot} />
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 12, fontSize: 13, color: "#6A5E50", fontStyle: "italic" }}>
          No available slots for this time — try a different time or date
        </div>
      )}
    </div>
  );
}

function SearchSummary({ structured }) {
  if (!structured?.searchParams) return null;
  const p = structured.searchParams;
  const withSlots = structured.restaurants?.filter((r) => r.slots?.length > 0) || [];
  const totalSlots = withSlots.reduce((sum, r) => sum + r.slots.length, 0);

  return (
    <div style={{ background: "rgba(232,168,109,0.05)", border: "1px solid rgba(232,168,109,0.15)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#C4B8A8" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
        <span>
          <strong style={{ color: "#E8A86D" }}>{structured.resultCount}</strong> restaurants
        </span>
        <span>
          <strong style={{ color: "#E8A86D" }}>{totalSlots}</strong> time slots
        </span>
        <span style={{ opacity: 0.6 }}>|</span>
        <span>{safe(p.query || p.cuisine) || "All cuisines"}</span>
        <span>{safe(p.city)}</span>
        <span>{safe(p.date)} at {safe(p.time)}</span>
        <span>Party of {safe(p.party_size)}</span>
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================

function TableFinder() {
  const [view, setView] = useState("landing");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

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
            country: data.countryName || "",
            zip: data.postcode || "",
            neighborhood: data.localityInfo?.administrative?.[3]?.name || data.localityInfo?.administrative?.[2]?.name || "",
            lat: latitude,
            lng: longitude,
          });
        } catch {
          setUserLocation({ city: "", region: "", country: "", zip: "", neighborhood: "", lat: latitude, lng: longitude });
        }
        setLocationLoading(false);
      },
      (err) => {
        console.error("Geolocation error:", err.code, err.message);
        setLocationError(true);
        setLocationLoading(false);
      },
      { timeout: 10000 }
    );
  };

  useEffect(() => { detectLocation(); }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (overrideText) => {
    const text = (overrideText || input).trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);

    const userMsg = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const apiMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, location: userLocation }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || "No results found.",
          structured: data.structured || null,
          cached: data.cached || false,
          searchParams: data.searchParams || null,
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Something went wrong: ${e.message}. Please try again.` },
      ]);
    }

    setLoading(false);
  };

  // ============================================================
  // LANDING PAGE
  // ============================================================

  if (view === "landing") {
    return (
      <div style={{ minHeight: "100vh", background: "#1A1612", color: "#F0E6D8", fontFamily: "'Outfit', sans-serif" }}>
        <style>{`
          @import url("https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=Outfit:wght@300;400;500;600&display=swap");
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #1A1612; }
          .cta-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
        `}</style>

        <nav style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ maxWidth: 1000, margin: "0 auto", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 24, color: "#E8A86D" }}>&#9673;</span>
              <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 20, color: "#F0E6D8", fontWeight: 500 }}>TableFinder</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {userLocation?.city ? (
                <span style={{ fontSize: 13, color: "#8A7E70", fontWeight: 500 }}>
                  📍 {userLocation.neighborhood || userLocation.city}{userLocation.zip ? ` ${userLocation.zip}` : (userLocation.region ? `, ${userLocation.region}` : "")}
                </span>
              ) : (
                <button onClick={detectLocation} disabled={locationLoading}
                  style={{ fontSize: 13, color: "#E8A86D", fontWeight: 500, background: "none", border: "1px solid rgba(232,168,109,0.25)", borderRadius: 20, padding: "5px 12px", cursor: "pointer", fontFamily: "'Outfit', sans-serif" }}>
                  {locationLoading ? "Detecting..." : locationError ? "📍 Enable location" : "📍 Detect my location"}
                </button>
              )}
              <button onClick={() => { setView("agent"); setTimeout(() => inputRef.current?.focus(), 100); }} className="cta-btn"
                style={{ background: "#E8A86D", color: "#1A1612", border: "none", padding: "9px 20px", borderRadius: 8, fontSize: 14, fontFamily: "'Outfit', sans-serif", fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}>
                Find a Table →
              </button>
            </div>
          </div>
        </nav>

        {/* Hero */}
        <div style={{ maxWidth: 700, margin: "0 auto", padding: "100px 24px 60px", textAlign: "center" }}>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "clamp(36px, 6vw, 56px)", fontWeight: 400, lineHeight: 1.15, color: "#F0E6D8", marginBottom: 20 }}>
            Every table.<br />One search.
          </h1>
          <p style={{ fontSize: 18, color: "#8A7E70", maxWidth: 480, margin: "0 auto 40px", lineHeight: 1.6 }}>
            Search OpenTable and Resy simultaneously. Real availability, real time slots, direct booking links.
          </p>

          {/* Search bar */}
          <div onClick={() => { setView("agent"); setTimeout(() => inputRef.current?.focus(), 100); }}
            style={{ maxWidth: 520, margin: "0 auto", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "14px 20px", cursor: "text", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20, opacity: 0.4 }}>🔍</span>
            <span style={{ color: "#6A5E50", fontSize: 15 }}>
              {userLocation?.city ? `Italian for 2, tonight in ${userLocation.city}...` : "Italian for 2, tonight in Atlanta..."}
            </span>
          </div>
        </div>

        {/* How it works */}
        <div style={{ maxWidth: 700, margin: "0 auto", padding: "40px 24px 80px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 24 }}>
            {[
              { step: "01", title: "Describe", desc: "Tell us what you want. Cuisine, date, party size, location." },
              { step: "02", title: "Discover", desc: "We search OpenTable and Resy simultaneously for real availability." },
              { step: "03", title: "Book", desc: "Click any time slot to book directly on the platform. No middleman." },
            ].map((item) => (
              <div key={item.step} style={{ padding: 20, background: "rgba(255,255,255,0.02)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ fontSize: 11, color: "#E8A86D", fontWeight: 600, letterSpacing: 2, marginBottom: 8 }}>{item.step}</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: "#F0E6D8", marginBottom: 6 }}>{item.title}</div>
                <div style={{ fontSize: 13, color: "#8A7E70", lineHeight: 1.5 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <footer style={{ textAlign: "center", padding: "20px 24px", fontSize: 11, color: "rgba(255,255,255,0.15)" }}>
          Real availability from OpenTable & Resy · tablefinder.ai
        </footer>
      </div>
    );
  }

  // ============================================================
  // AGENT / SEARCH VIEW
  // ============================================================

  return (
    <div style={{ minHeight: "100vh", background: "#1A1612", color: "#F0E6D8", fontFamily: "'Outfit', sans-serif" }}>
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=Outfit:wght@300;400;500;600&display=swap");
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #1A1612; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .result-card { animation: fadeIn 0.3s ease-out; }
      `}</style>

      {/* Header */}
      <header style={{ position: "sticky", top: 0, background: "rgba(26,22,18,0.95)", backdropFilter: "blur(12px)", zIndex: 10, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setView("landing")} style={{ background: "none", border: "none", color: "#C4B8A8", cursor: "pointer", fontSize: 18, padding: 4 }}>←</button>
            <span style={{ fontSize: 18, color: "#E8A86D" }}>&#9673;</span>
            <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 18, color: "#F0E6D8", fontWeight: 400 }}>TableFinder</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: loading ? "rgba(232,168,109,0.1)" : "rgba(100,200,100,0.08)", padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500, color: loading ? "#E8A86D" : "#7BC47F" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: loading ? "#E8A86D" : "#7BC47F", animation: loading ? "pulse 1.2s infinite" : "none" }} />
              {loading ? "Searching" : "Ready"}
            </div>
            {userLocation?.city ? (
              <div style={{ fontSize: 12, color: "#8A7E70", fontWeight: 500 }}>
                📍 {userLocation.neighborhood || userLocation.city}{userLocation.zip ? ` ${userLocation.zip}` : (userLocation.region ? `, ${userLocation.region}` : "")}
              </div>
            ) : (
              <button onClick={detectLocation} disabled={locationLoading}
                style={{ fontSize: 11, color: "#E8A86D", fontWeight: 500, background: "none", border: "1px solid rgba(232,168,109,0.25)", borderRadius: 16, padding: "4px 10px", cursor: "pointer", fontFamily: "'Outfit', sans-serif" }}>
                {locationLoading ? "..." : "📍 Detect"}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Chat area */}
      <main style={{ maxWidth: 780, margin: "0 auto", padding: "20px 20px 170px", minHeight: "calc(100vh - 56px)" }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 20px" }}>
            <div style={{ fontSize: 48, marginBottom: 16, color: "#E8A86D" }}>&#9673;</div>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 24, fontWeight: 400, marginBottom: 8 }}>What are you in the mood for?</h2>
            <p style={{ color: "#8A7E70", fontSize: 15 }}>Search across OpenTable & Resy with real-time availability</p>

            {/* Quick suggestions */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 24 }}>
              {[
                "Mexican for 2 tonight",
                "Italian fine dining Saturday",
                "Sushi this Friday, 4 people",
                "Brunch Sunday for 6",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => { send(suggestion); }}
                  style={{ padding: "8px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, color: "#C4B8A8", fontSize: 13, cursor: "pointer", fontFamily: "'Outfit', sans-serif", transition: "all 0.2s" }}
                  onMouseEnter={(e) => { e.target.style.borderColor = "rgba(232,168,109,0.3)"; e.target.style.color = "#E8A86D"; }}
                  onMouseLeave={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.08)"; e.target.style.color = "#C4B8A8"; }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            {msg.role === "user" ? (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{ background: "#E8A86D", color: "#1A1612", padding: "10px 18px", borderRadius: "16px 16px 4px 16px", maxWidth: "75%", fontSize: 15, fontWeight: 500 }}>
                  {msg.content}
                </div>
              </div>
            ) : (
              <div className="result-card">
                {/* Cached badge */}
                {msg.cached && (
                  <div style={{ fontSize: 11, color: "#7BC47F", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
                    ⚡ cached results
                  </div>
                )}

                {/* Structured results */}
                {msg.structured?.restaurants?.length > 0 ? (
                  <div>
                    <SearchSummary structured={msg.structured} />
                    {msg.structured.restaurants.map((restaurant, j) => (
                      <RestaurantCard key={j} restaurant={restaurant} />
                    ))}
                  </div>
                ) : (
                  /* Text-only response */
                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", padding: "14px 20px", borderRadius: "16px 16px 16px 4px", maxWidth: "90%", fontSize: 15, lineHeight: 1.6, color: "#C4B8A8" }}>
                    {msg.content}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0", color: "#8A7E70", fontSize: 14 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#E8A86D", animation: `pulse 1.2s infinite ${i * 0.2}s` }} />
              ))}
            </div>
            Searching OpenTable & Resy...
          </div>
        )}

        <div ref={chatEndRef} />
      </main>

      {/* Input bar */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, #1A1612 30%)", padding: "40px 20px 20px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto" }}>
          <div style={{ display: "flex", gap: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "6px 6px 6px 18px", alignItems: "center" }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={userLocation?.city ? `Sushi for 4, this Saturday, ${userLocation.city}...` : "Sushi for 4, this Saturday, downtown..."}
              disabled={loading}
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "#F0E6D8", fontSize: 15, fontFamily: "'Outfit', sans-serif", padding: "10px 0" }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{ background: input.trim() ? "#E8A86D" : "rgba(232,168,109,0.2)", color: "#1A1612", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 16, cursor: input.trim() ? "pointer" : "default", transition: "all 0.2s", fontWeight: 600 }}
            >
              ↑
            </button>
          </div>
          <p style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.15)", marginTop: 8 }}>
            Real availability from OpenTable & Resy · tablefinder.ai
          </p>
        </div>
      </div>
    </div>
  );
}
