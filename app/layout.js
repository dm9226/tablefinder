export const metadata = {
  title: "TableFinder — Find Restaurant Reservations Across Every Platform",
  description:
    "One AI-powered search across OpenTable, Resy, Yelp, and Google. Tell us what you want and we'll find every available table.",
  openGraph: {
    title: "TableFinder — Stop Searching. Start Dining.",
    description:
      "AI-powered restaurant reservation search across OpenTable, Resy, Yelp, and Google.",
    url: "https://tablefinder.ai",
    siteName: "TableFinder",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TableFinder — Stop Searching. Start Dining.",
    description:
      "One AI-powered search across every reservation platform.",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Outfit:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#12100E" }}>
        {children}
      </body>
    </html>
  );
}
