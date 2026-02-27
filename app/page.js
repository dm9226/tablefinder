"use client";

import { useState, useRef, useEffect } from "react";

// ─── Markdown renderer with clickable booking links ──────────────────
function RenderMarkdown({ text }) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements = [];

  const renderInline = (str, key) => {
    const parts = [];
    let remaining = str;
    let idx = 0;

    while (remaining.length > 0) {
      const linkMatch = remaining.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      const urlMatch = remaining.match(/(https?:\/\/[^\s,)<>]+)/);

      let first = null;
      let firstPos = remaining.length;

      if (linkMatch && remaining.indexOf(linkMatch[0]) < firstPos) {
        firstPos = remaining.indexOf(linkMatch[0]);
        first = { type: "link", m: linkMatch };
      }
      if (boldMatch && remaining.indexOf(boldMatch[0]) < firstPos) {
        firstPos = remaining.indexOf(boldMatch[0]);
        first = { type: "bold", m: boldMatch };
      }
      if (!first && urlMatch && remaining.indexOf(urlMatch[0]) < firstPos) {
        firstPos = remaining.indexOf(urlMatch[0]);
        first = { type: "url", m: urlMatch };
      }

      if (!first) {
        parts.push(<span key={`${key}-${idx++}`}>{remaining}</span>);
        break;
      }

      const before = remaining.slice(0, firstPos);
      if (before) parts.push(<span key={`${key}-${idx++}`}>{before}</span>);

      if (first.type === "link") {
        const isBooking =
          first.m[2].includes("opentable") ||
          first.m[2].includes("resy.com") ||
          first.m[2].includes("yelp.com") ||
          first.m[2].includes("exploretock") ||
          first.m[2].includes("reserve") ||
          first.m[1].toLowerCase().includes("book");

        parts.push(
          <a
            key={`${key}-${idx++}`}
            href={first.m[2]}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: isBooking ? "#1A1612" : "#E8A86D",
              background: isBooking ? "#E8A86D" : "transparent",
              padding: isBooking ? "4px 12px" : "0",
              borderRadius: isBooking ? "6px" : "0",
              textDecoration: "none",
              borderBottom: isBooking ? "none" : "1px solid rgba(232,168,109,0.3)",
              fontWeight: isBooking ? 600 : 500,
              fontSize: isBooking ? "13px" : "inherit",
              display: isBooking ? "inline-flex" : "inline",
              alignItems: "center",
              gap: "4px",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              if (isBooking) {
                e.target.style.background = "#F0C090";
                e.target.style.transform = "translateY(-1px)";
              } else {
                e.target.style.borderBottomColor = "#E8A86D";
              }
            }}
            onMouseLeave={(e) => {
              if (isBooking) {
                e.target.style.background = "#E8A86D";
                e.target.style.transform = "translateY(0)";
              } else {
                e.target.style.borderBottomColor = "rgba(232,168,109,0.3)";
              }
            }}
          >
            {isBooking && "→ "}
            {first.m[1]}
          </a>
        );
        remaining = remaining.slice(firstPos + first.m[0].length);
      } else if (first.type === "bold") {
        parts.push(
          <strong key={`${key}-${idx++}`} style={{ color: "#F0E6D8", fontWeight: 600 }}>
            {first.m[1]}
          </strong>
        );
        remaining = remaining.slice(firstPos + first.m[0].length);
      } else if (first.type === "url") {
        const url = first.m[1];
        const isBooking =
          url.includes("opentable") ||
          url.includes("resy.com") ||
          url.includes("yelp.com/reservations") ||
          url.includes("exploretock") ||
          url.includes("sevenrooms");

        const label = isBooking
          ? url.includes("opentable")
            ? "Book on OpenTable"
            : url.includes("resy")
            ? "Book on Resy"
            : url.includes("yelp")
            ? "Book on Yelp"
            : url.includes("exploretock")
            ? "Book on Tock"
            : "Book Now"
          : url.length > 45
          ? url.slice(0, 42) + "..."
          : url;

        parts.push(
          <a
            key={`${key}-${idx++}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: isBooking ? "#1A1612" : "#E8A86D",
              background: isBooking ? "#E8A86D" : "transparent",
              padding: isBooking ? "4px 12px" : "0",
              borderRadius: isBooking ? "6px" : "0",
              textDecoration: "none",
              borderBottom: isBooking ? "none" : "1px solid rgba(232,168,109,0.3)",
              fontWeight: isBooking ? 600 : 500,
              fontSize: isBooking ? "13px" : "inherit",
              display: isBooking ? "inline-flex" : "inline",
              alignItems: "center",
              gap: "4px",
              transition: "all 0.2s",
              wordBreak: isBooking ? "normal" : "break-all",
            }}
            onMouseEnter={(e) => {
              if (isBooking) e.target.style.background = "#F0C090";
            }}
            onMouseLeave={(e) => {
              if (isBooking) e.target.style.background = "#E8A86D";
            }}
          >
            {isBooking && "→ "}
            {label}
          </a>
        );
        remaining = remaining.slice(firstPos + first.m[0].length);
      }
    }
    return parts;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^---+$/)) {
      elements.push(
        <hr key={i} style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.06)", margin: "18px 0" }} />
      );
    } else if (line.match(/^### /)) {
      elements.push(
        <h3 key={i} style={{ fontSize: "17px", fontWeight: 600, color: "#F0E6D8", margin: "22px 0 6px", fontFamily: "'Playfair Display', Georgia, serif" }}>
          {renderInline(line.replace(/^### /, ""), `h3-${i}`)}
        </h3>
      );
    } else if (line.match(/^## /)) {
      elements.push(
        <h2 key={i} style={{ fontSize: "20px", fontWeight: 600, color: "#F0E6D8", margin: "24px 0 8px", fontFamily: "'Playfair Display', Georgia, serif" }}>
          {renderInline(line.replace(/^## /, ""), `h2-${i}`)}
        </h2>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} style={{ height: "6px" }} />);
    } else {
      elements.push(
        <p key={i} style={{ margin: "3px 0", lineHeight: 1.7, color: "#C4B8A8" }}>
          {renderInline(line, `p-${i}`)}
        </p>
      );
    }
  }
  return <>{elements}</>;
}

const STATUS_MESSAGES = [
  "Understanding your preferences...",
  "Searching OpenTable...",
  "Checking Resy...",
  "Scanning Yelp reservations...",
  "Checking Google Reserve...",
  "Cross-referencing platforms...",
  "Compiling your options...",
];

const QUICK_SEARCHES = [
  { label: "Italian tonight, 2 people", icon: "🍝" },
  { label: "Brunch Saturday, party of 4", icon: "🥂" },
  { label: "Steakhouse Friday 8pm, 2 people", icon: "🥩" },
  { label: "Sushi this weekend, 4 people", icon: "🍣" },
];

const PLATFORMS = ["OpenTable", "Resy", "Yelp", "Google Reserve", "Tock", "Direct"];

export default function TableFinder() {
  const [view, setView] = useState("landing");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusIdx, setStatusIdx] = useState(0);
  const [userLocation, setUserLocation] = useState(null);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const statusTimer = useRef(null);

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
            lat: latitude,
            lng: longitude,
          });
        } catch {
          setUserLocation({ city: "", region: "", country: "", lat: latitude, lng: longitude });
        }
      },
      () => {}
    );
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (loading) {
      setStatusIdx(0);
      statusTimer.current = setInterval(() => {
        setStatusIdx((p) => Math.min(p + 1, STATUS_MESSAGES.length - 1));
      }, 2400);
    } else {
      clearInterval(statusTimer.current);
    }
    return () => clearInterval(statusTimer.current);
  }, [loading]);

  const send = async (overrideText) => {
    const text = (overrideText || input).trim();
    if (!text || loading) return;
    setInput("");
    if (view === "landing") setView("agent");

    const userMsg = { role: "user", content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setLoading(true);

    try {
      const apiMessages = updated.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));

      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, location: userLocation }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        if (res.status === 429) {
          throw new Error("You've hit the search limit. Grab a drink and try again shortly.");
        }
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const timestamp = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.content || "I couldn't find results. Try being more specific about location and cuisine.",
          searchCount: data.searchCount || 0,
          cached: data.cached || false,
          cacheAge: data.cacheAge || 0,
          timestamp,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Something went wrong: ${err.message}. Please try again.`,
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // LANDING PAGE
  // ═══════════════════════════════════════════════════════════════
  if (view === "landing") {
    return (
      <div style={{ minHeight: "100vh", background: "#12100E", fontFamily: "'Outfit', sans-serif" }}>
        <style>{globalCSS}</style>
        <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: "rgba(18,16,14,0.8)", backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: "14px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 24 }}>&#9673;</span>
              <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 20, color: "#F0E6D8", fontWeight: 500 }}>TableFinder</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {userLocation?.city && (
                <span style={{ fontSize: 13, color: "#8A7E70", fontWeight: 500 }}>
                  📍 {userLocation.city}{userLocation.region ? `, ${userLocation.region}` : ""}
                </span>
              )}
              <button onClick={() => { setView("agent"); setTimeout(() => inputRef.current?.focus(), 100); }} className="cta-btn" style={{ background: "#E8A86D", color: "#1A1612", border: "none", padding: "9px 20px", borderRadius: 8, fontSize: 14, fontFamily: "'Outfit', sans-serif", fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}>
                Find a Table →
              </button>
            </div>
          </div>
        </nav>

        <section style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "radial-gradient(ellipse at 50% 30%, rgba(232,168,109,0.06) 0%, transparent 60%)" }}>
          <div style={{ position: "relative", zIndex: 2, textAlign: "center", padding: "120px 28px 60px", maxWidth: 740 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(232,168,109,0.1)", border: "1px solid rgba(232,168,109,0.15)", borderRadius: 24, padding: "6px 16px", marginBottom: 28, fontSize: 12, fontWeight: 500, color: "#E8A86D", letterSpacing: "0.5px", animation: "fadeUp 0.8s ease both" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#E8A86D", animation: "pulse 2s infinite" }} />
              AI-Powered Reservation Search
            </div>

            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "clamp(40px, 7vw, 68px)", fontWeight: 500, color: "#F0E6D8", lineHeight: 1.1, marginBottom: 20, letterSpacing: "-0.02em", animation: "fadeUp 0.8s ease 0.05s both" }}>
              Stop searching.<br /><span style={{ color: "#E8A86D" }}>Start dining.</span>
            </h1>

            <p style={{ fontSize: 17, color: "#8A7E70", lineHeight: 1.65, maxWidth: 520, margin: "0 auto 40px", fontWeight: 300, animation: "fadeUp 0.8s ease 0.1s both" }}>
              One search across OpenTable, Resy, Yelp, and more. Tell us what you want &mdash; our AI finds every available table with direct booking links.
            </p>

            <div style={{ maxWidth: 620, margin: "0 auto", animation: "fadeUp 0.8s ease 0.2s both" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#1A1612", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "8px 8px 8px 18px", boxShadow: "0 8px 40px rgba(0,0,0,0.3), 0 0 0 1px rgba(232,168,109,0.05)" }}>
                <span style={{ fontSize: 20, opacity: 0.4 }}>🔍</span>
                <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={userLocation?.city ? `Italian dinner for 2 tonight in ${userLocation.city}...` : "Italian dinner for 2 tonight in Manhattan..."} style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "#F0E6D8", fontSize: 15, fontFamily: "'Outfit', sans-serif", padding: "10px 0" }} />
                <button onClick={() => send()} disabled={!input.trim()} className="cta-btn" style={{ background: "#E8A86D", color: "#1A1612", border: "none", padding: "12px 22px", borderRadius: 10, fontSize: 14, fontFamily: "'Outfit', sans-serif", fontWeight: 600, cursor: input.trim() ? "pointer" : "default", whiteSpace: "nowrap", opacity: input.trim() ? 1 : 0.4, transition: "all 0.2s", flexShrink: 0 }}>
                  Search All Platforms
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 16 }}>
                {QUICK_SEARCHES.map((q, i) => (
                  <button key={i} className="chip" onClick={() => send(q.label)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: "7px 14px", fontSize: 13, fontFamily: "'Outfit', sans-serif", color: "#8A7E70", cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", gap: 6, animation: `fadeUp 0.5s ease ${0.35 + i * 0.07}s both` }}>
                    <span>{q.icon}</span> {q.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 56, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, animation: "fadeUp 0.8s ease 0.5s both" }}>
              <span style={{ fontSize: 11, letterSpacing: "1.5px", textTransform: "uppercase", color: "rgba(255,255,255,0.2)", fontWeight: 500 }}>Searches across</span>
              <div style={{ display: "flex", gap: 28, flexWrap: "wrap", justifyContent: "center" }}>
                {PLATFORMS.map((p) => (
                  <span key={p} style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", fontWeight: 500, letterSpacing: "0.5px" }}>{p}</span>
                ))}
              </div>
            </div>
          </div>
          <div style={{ position: "absolute", inset: 0, zIndex: 1, backgroundImage: "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)", backgroundSize: "80px 80px", maskImage: "radial-gradient(ellipse at 50% 40%, black 20%, transparent 70%)", WebkitMaskImage: "radial-gradient(ellipse at 50% 40%, black 20%, transparent 70%)" }} />
        </section>

        <section style={{ maxWidth: 1000, margin: "0 auto", padding: "80px 28px 100px" }}>
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 32, fontWeight: 500, color: "#F0E6D8", textAlign: "center", marginBottom: 48 }}>Three steps to your table</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
            {[
              { step: "01", title: "Describe", icon: "💬", desc: "Tell us what you want in plain English. Location, date, party size, cuisine — whatever matters to you." },
              { step: "02", title: "Discover", icon: "🔍", desc: "AI searches every major reservation platform simultaneously, finding options you'd miss checking one by one." },
              { step: "03", title: "Dine", icon: "🍽", desc: "Click through directly to the platform to complete your reservation. No middleman, no markup, no new account." },
            ].map((item, i) => (
              <div key={i} style={{ background: "#1A1612", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "32px 24px", textAlign: "center", animation: `fadeUp 0.6s ease ${0.1 + i * 0.12}s both` }}>
                <div style={{ fontSize: 11, letterSpacing: "2px", color: "#E8A86D", fontWeight: 600, marginBottom: 4 }}>{item.step}</div>
                <div style={{ fontSize: 32, margin: "12px 0" }}>{item.icon}</div>
                <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, color: "#F0E6D8", fontWeight: 500, marginBottom: 10 }}>{item.title}</h3>
                <p style={{ fontSize: 14, color: "#8A7E70", lineHeight: 1.6, fontWeight: 300 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <footer style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "32px 28px", maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 16 }}>&#9673;</span>
            <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 16, color: "#F0E6D8" }}>TableFinder</span>
          </div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>AI-powered reservation discovery. Bookings are completed directly on each platform.</p>
        </footer>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // AGENT CHAT VIEW
  // ═══════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: "100vh", background: "#12100E", fontFamily: "'Outfit', sans-serif" }}>
      <style>{globalCSS}</style>

      <header style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(18,16,14,0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setView("landing")} style={{ background: "none", border: "none", color: "#C4B8A8", cursor: "pointer", fontSize: 18, padding: 4 }}>←</button>
            <span style={{ fontSize: 18 }}>&#9673;</span>
            <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 18, color: "#F0E6D8", fontWeight: 400 }}>TableFinder</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: loading ? "rgba(232,168,109,0.1)" : "rgba(100,200,100,0.08)", padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500, color: loading ? "#E8A86D" : "#7BC47F" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: loading ? "#E8A86D" : "#7BC47F", animation: loading ? "pulse 1.2s infinite" : "none" }} />
              {loading ? "Searching" : "Ready"}
            </div>
            {userLocation?.city && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#8A7E70", fontWeight: 500 }}>
                📍 {userLocation.city}{userLocation.region ? `, ${userLocation.region}` : ""}
              </div>
            )}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 780, margin: "0 auto", padding: "20px 20px 170px", minHeight: "calc(100vh - 56px)" }}>
        {messages.length === 0 && !loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", animation: "fadeUp 0.5s ease" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>&#9673;</div>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 28, color: "#F0E6D8", fontWeight: 400, marginBottom: 8 }}>What are you craving?</h2>
            <p style={{ color: "#8A7E70", fontSize: 14, maxWidth: 400, margin: "0 auto 24px", textAlign: "center" }}>Describe your ideal meal &mdash; I'll find available tables across every platform.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {QUICK_SEARCHES.map((q, i) => (
                <button key={i} className="chip" onClick={() => send(q.label)} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 20, padding: "8px 14px", fontSize: 13, fontFamily: "'Outfit', sans-serif", color: "#8A7E70", cursor: "pointer", transition: "all 0.2s" }}>
                  {q.icon} {q.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: 22, animation: "fadeUp 0.35s ease" }}>
            {msg.role === "user" ? (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{ background: "#E8A86D", color: "#1A1612", padding: "12px 18px", borderRadius: "18px 18px 4px 18px", maxWidth: "75%", fontSize: 15, lineHeight: 1.5, fontWeight: 500 }}>{msg.content}</div>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12, color: "#8A7E70", fontWeight: 500 }}>
                  <span style={{ fontSize: 14 }}>&#9673;</span>
                  TableFinder
                  {msg.searchCount > 0 && !msg.cached && (
                    <span style={{ background: "rgba(232,168,109,0.08)", border: "1px solid rgba(232,168,109,0.12)", borderRadius: 10, padding: "2px 8px", fontSize: 11, color: "#E8A86D", fontWeight: 500 }}>
                      {msg.searchCount} searches
                    </span>
                  )}
                  {msg.cached && (
                    <span style={{ background: "rgba(123,196,127,0.08)", border: "1px solid rgba(123,196,127,0.12)", borderRadius: 10, padding: "2px 8px", fontSize: 11, color: "#7BC47F", fontWeight: 500 }}>
                      ⚡ cached {msg.cacheAge > 0 ? `(${msg.cacheAge}m ago)` : "(just now)"}
                    </span>
                  )}
                  {msg.timestamp && (
                    <span style={{ fontSize: 11, color: "#5A5248", marginLeft: "auto" }}>{msg.timestamp}</span>
                  )}
                </div>
                <div style={{ marginLeft: 22, background: "#1A1612", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "4px 16px 16px 16px", padding: "18px 22px", fontSize: 14, lineHeight: 1.7 }}>
                  <RenderMarkdown text={msg.content} />
                </div>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ animation: "fadeUp 0.3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12, color: "#8A7E70", fontWeight: 500 }}>
              <span style={{ fontSize: 14 }}>&#9673;</span>
              TableFinder
            </div>
            <div style={{ marginLeft: 22, display: "inline-flex", alignItems: "center", gap: 12, background: "#1A1612", border: "1px solid rgba(232,168,109,0.1)", borderRadius: 12, padding: "14px 20px" }}>
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 1, 2].map((d) => (
                  <span key={d} style={{ width: 6, height: 6, borderRadius: "50%", background: "#E8A86D", animation: "dotBounce 1.2s infinite", animationDelay: `${d * 0.15}s` }} />
                ))}
              </div>
              <span style={{ color: "#E8A86D", fontSize: 13, fontWeight: 500 }}>{STATUS_MESSAGES[statusIdx]}</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </main>

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, background: "linear-gradient(transparent, #12100E 30%)", padding: "24px 20px 20px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", display: "flex", gap: 8, alignItems: "center", background: "#1A1612", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "5px 5px 5px 18px", boxShadow: "0 -4px 24px rgba(0,0,0,0.2)" }}>
          <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={userLocation?.city ? `Sushi for 4, this Saturday, ${userLocation.city}...` : "Sushi for 4, this Saturday, downtown..."} disabled={loading} style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "#F0E6D8", fontSize: 15, fontFamily: "'Outfit', sans-serif", padding: "10px 0" }} />
          <button onClick={() => send()} disabled={!input.trim() || loading} style={{ width: 42, height: 42, borderRadius: 10, border: "none", fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", flexShrink: 0, background: input.trim() && !loading ? "#E8A86D" : "rgba(255,255,255,0.06)", color: input.trim() && !loading ? "#1A1612" : "#5A5248", cursor: input.trim() && !loading ? "pointer" : "default" }}>
            ↑
          </button>
        </div>
        <p style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 8 }}>Results link directly to booking platforms · tablefinder.ai</p>
      </div>
    </div>
  );
}

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
  @keyframes dotBounce {
    0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
    40% { transform: scale(1); opacity: 1; }
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
