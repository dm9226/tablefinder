"use client";

import { useState, useRef, useEffect } from "react";

// ─── Build a smart Perplexity search URL ─────────────────────────────
function buildPerplexityURL(query, location) {
  let fullQuery = `Find available restaurant reservations: ${query}`;

  if (location?.city) {
    // Only append location if the user didn't already mention a city
    const lowerQuery = query.toLowerCase();
    const lowerCity = location.city.toLowerCase();
    if (!lowerQuery.includes(lowerCity)) {
      fullQuery += ` near ${location.city}, ${location.region || ""}`;
    }
  }

  fullQuery += `. Search OpenTable, Resy, Yelp reservations, and Tock. For each restaurant provide the direct booking link from the platform. Show at least 5 options.`;

  return `https://www.perplexity.ai/search?q=${encodeURIComponent(fullQuery)}`;
}

// ─── Quick search options ────────────────────────────────────────────
const QUICK_SEARCHES = [
  { label: "Italian tonight, 2 people", icon: "🍝" },
  { label: "Brunch Saturday, party of 4", icon: "🥂" },
  { label: "Steakhouse Friday 8pm, 2 people", icon: "🥩" },
  { label: "Sushi this weekend, 4 people", icon: "🍣" },
];

const PLATFORMS = ["OpenTable", "Resy", "Yelp", "Google Reserve", "Tock", "Direct"];

// ─── Main Component ──────────────────────────────────────────────────
export default function TableFinder() {
  const [input, setInput] = useState("");
  const [userLocation, setUserLocation] = useState(null);
  const inputRef = useRef(null);

  // ── Detect user location on mount ──
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          );
          const data = await res.json();
          setUserLocation({
            city: data.city || data.locality || "",
            region: data.principalSubdivision || "",
            country: data.countryName || "",
          });
        } catch {
          // silently fail
        }
      },
      () => {} // denied
    );
  }, []);

  const handleSearch = (overrideText) => {
    const query = (overrideText || input).trim();
    if (!query) return;
    const url = buildPerplexityURL(query, userLocation);
    window.open(url, "_blank");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#12100E", fontFamily: "'Outfit', sans-serif" }}>
      <style>{globalCSS}</style>

      {/* NAV */}
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          background: "rgba(18,16,14,0.8)",
          backdropFilter: "blur(24px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "14px 28px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>◉</span>
            <span
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 20,
                color: "#F0E6D8",
                fontWeight: 500,
              }}
            >
              TableFinder
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {userLocation?.city && (
              <span style={{ fontSize: 13, color: "#8A7E70", fontWeight: 500 }}>
                📍 {userLocation.city}{userLocation.region ? `, ${userLocation.region}` : ""}
              </span>
            )}
            <button
              onClick={() => inputRef.current?.focus()}
              className="cta-btn"
              style={{
                background: "#E8A86D",
                color: "#1A1612",
                border: "none",
                padding: "9px 20px",
                borderRadius: 8,
                fontSize: 14,
                fontFamily: "'Outfit', sans-serif",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              Find a Table →
            </button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section
        style={{
          position: "relative",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          background:
            "radial-gradient(ellipse at 50% 30%, rgba(232,168,109,0.06) 0%, transparent 60%)",
        }}
      >
        <div
          style={{
            position: "relative",
            zIndex: 2,
            textAlign: "center",
            padding: "120px 28px 60px",
            maxWidth: 740,
          }}
        >
          {/* Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(232,168,109,0.1)",
              border: "1px solid rgba(232,168,109,0.15)",
              borderRadius: 24,
              padding: "6px 16px",
              marginBottom: 28,
              fontSize: 12,
              fontWeight: 500,
              color: "#E8A86D",
              letterSpacing: "0.5px",
              animation: "fadeUp 0.8s ease both",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#E8A86D",
                animation: "pulse 2s infinite",
              }}
            />
            AI-Powered Reservation Search
          </div>

          {/* Title */}
          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "clamp(40px, 7vw, 68px)",
              fontWeight: 500,
              color: "#F0E6D8",
              lineHeight: 1.1,
              marginBottom: 20,
              letterSpacing: "-0.02em",
              animation: "fadeUp 0.8s ease 0.05s both",
            }}
          >
            Stop searching.
            <br />
            <span style={{ color: "#E8A86D" }}>Start dining.</span>
          </h1>

          <p
            style={{
              fontSize: 17,
              color: "#8A7E70",
              lineHeight: 1.65,
              maxWidth: 520,
              margin: "0 auto 40px",
              fontWeight: 300,
              animation: "fadeUp 0.8s ease 0.1s both",
            }}
          >
            One search across OpenTable, Resy, Yelp, and more. Tell us what you
            want — we'll find every available table with direct booking links.
          </p>

          {/* SEARCH BOX */}
          <div style={{ maxWidth: 620, margin: "0 auto", animation: "fadeUp 0.8s ease 0.2s both" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: "#1A1612",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 14,
                padding: "8px 8px 8px 18px",
                boxShadow:
                  "0 8px 40px rgba(0,0,0,0.3), 0 0 0 1px rgba(232,168,109,0.05)",
              }}
            >
              <span style={{ fontSize: 20, opacity: 0.4 }}>🔍</span>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder={
                  userLocation?.city
                    ? `Italian dinner for 2 tonight in ${userLocation.city}...`
                    : "Italian dinner for 2 tonight in Manhattan..."
                }
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "#F0E6D8",
                  fontSize: 15,
                  fontFamily: "'Outfit', sans-serif",
                  padding: "10px 0",
                }}
              />
              <button
                onClick={() => handleSearch()}
                disabled={!input.trim()}
                className="cta-btn"
                style={{
                  background: "#E8A86D",
                  color: "#1A1612",
                  border: "none",
                  padding: "12px 22px",
                  borderRadius: 10,
                  fontSize: 14,
                  fontFamily: "'Outfit', sans-serif",
                  fontWeight: 600,
                  cursor: input.trim() ? "pointer" : "default",
                  whiteSpace: "nowrap",
                  opacity: input.trim() ? 1 : 0.4,
                  transition: "all 0.2s",
                  flexShrink: 0,
                }}
              >
                Search All Platforms
              </button>
            </div>

            {/* Quick chips */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                justifyContent: "center",
                marginTop: 16,
              }}
            >
              {QUICK_SEARCHES.map((q, i) => (
                <button
                  key={i}
                  className="chip"
                  onClick={() => handleSearch(q.label)}
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 20,
                    padding: "7px 14px",
                    fontSize: 13,
                    fontFamily: "'Outfit', sans-serif",
                    color: "#8A7E70",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    animation: `fadeUp 0.5s ease ${0.35 + i * 0.07}s both`,
                  }}
                >
                  <span>{q.icon}</span> {q.label}
                </button>
              ))}
            </div>
          </div>

          {/* Platforms */}
          <div
            style={{
              marginTop: 56,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
              animation: "fadeUp 0.8s ease 0.5s both",
            }}
          >
            <span
              style={{
                fontSize: 11,
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.2)",
                fontWeight: 500,
              }}
            >
              Searches across
            </span>
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap", justifyContent: "center" }}>
              {PLATFORMS.map((p) => (
                <span
                  key={p}
                  style={{
                    fontSize: 13,
                    color: "rgba(255,255,255,0.3)",
                    fontWeight: 500,
                    letterSpacing: "0.5px",
                  }}
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Grid overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
            maskImage:
              "radial-gradient(ellipse at 50% 40%, black 20%, transparent 70%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at 50% 40%, black 20%, transparent 70%)",
          }}
        />
      </section>

      {/* HOW IT WORKS */}
      <section style={{ maxWidth: 1000, margin: "0 auto", padding: "80px 28px 100px" }}>
        <h2
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 32,
            fontWeight: 500,
            color: "#F0E6D8",
            textAlign: "center",
            marginBottom: 48,
          }}
        >
          Three steps to your table
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 20,
          }}
        >
          {[
            {
              step: "01",
              title: "Describe",
              icon: "💬",
              desc: "Tell us what you want in plain English. Location, date, party size, cuisine — whatever matters to you.",
            },
            {
              step: "02",
              title: "Discover",
              icon: "🔍",
              desc: "AI searches every major reservation platform simultaneously, finding options you'd miss checking one by one.",
            },
            {
              step: "03",
              title: "Dine",
              icon: "🍽",
              desc: "Click through directly to the platform to complete your reservation. No middleman, no markup, no new account.",
            },
          ].map((item, i) => (
            <div
              key={i}
              style={{
                background: "#1A1612",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 16,
                padding: "32px 24px",
                textAlign: "center",
                animation: `fadeUp 0.6s ease ${0.1 + i * 0.12}s both`,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: "2px",
                  color: "#E8A86D",
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                {item.step}
              </div>
              <div style={{ fontSize: 32, margin: "12px 0" }}>{item.icon}</div>
              <h3
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: 22,
                  color: "#F0E6D8",
                  fontWeight: 500,
                  marginBottom: 10,
                }}
              >
                {item.title}
              </h3>
              <p style={{ fontSize: 14, color: "#8A7E70", lineHeight: 1.6, fontWeight: 300 }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer
        style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "32px 28px",
          maxWidth: 1100,
          margin: "0 auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 16 }}>◉</span>
          <span
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: 16,
              color: "#F0E6D8",
            }}
          >
            TableFinder
          </span>
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
          AI-powered reservation discovery. Bookings are completed directly on
          each platform.
        </p>
      </footer>
    </div>
  );
}

// ─── Global CSS ──────────────────────────────────────────────────────
const globalCSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #12100E; }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  input::placeholder { color: #8A7E70; }

  .chip:hover {
    background: rgba(232,168,109,0.1) !important;
    border-color: rgba(232,168,109,0.25) !important;
  }
  .cta-btn:hover {
    filter: brightness(1.1);
    transform: translateY(-1px);
  }

  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }

  @media (max-width: 600px) {
    h1 { font-size: 36px !important; }
  }
`;
