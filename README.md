# TableFinder

AI-powered restaurant reservation search across OpenTable, Resy, Yelp, Google, and more.

## Project Structure

```
tablefinder/
├── app/
│   ├── api/
│   │   └── search/
│   │       └── route.js    ← Server-side API proxy (hides your Anthropic key)
│   ├── layout.js           ← Root layout with SEO metadata
│   └── page.js             ← Main app (landing page + AI agent)
├── public/                  ← Static assets (add favicon, OG image here)
├── .env.example            ← Environment variable template
├── .gitignore
├── next.config.js
├── package.json
└── README.md
```

## Deployment to Vercel (with your GoDaddy domains)

### Step 1: Get an Anthropic API Key

1. Go to https://console.anthropic.com/
2. Create an account or sign in
3. Go to API Keys → Create Key
4. Copy the key (starts with `sk-ant-`)
5. **Important:** Add credits to your account. The web search + Claude Sonnet calls cost roughly $0.03-0.08 per search query.

### Step 2: Push to GitHub

```bash
# In the tablefinder directory:
git init
git add .
git commit -m "Initial commit"

# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/tablefinder.git
git branch -M main
git push -u origin main
```

### Step 3: Deploy on Vercel

1. Go to https://vercel.com and sign in with GitHub
2. Click "Add New Project"
3. Import your `tablefinder` repository
4. **Framework Preset** will auto-detect Next.js
5. Under **Environment Variables**, add:
   - Key: `ANTHROPIC_API_KEY`
   - Value: your `sk-ant-...` key
6. Click **Deploy**
7. Wait ~60 seconds. Your site is live at `tablefinder.vercel.app`

### Step 4: Connect Your GoDaddy Domains

#### In Vercel:
1. Go to your project → Settings → Domains
2. Add `tablefinder.ai`
3. Add `tablefinder.io`
4. Add `www.tablefinder.ai` (redirects to tablefinder.ai)
5. Add `www.tablefinder.io` (redirects to tablefinder.io)
6. Vercel will show you the DNS records you need to add

#### In GoDaddy:
1. Go to https://dcc.godaddy.com/ → your domain → DNS
2. **Delete any existing A records or CNAME for @**
3. Add the records Vercel tells you (typically):
   - Type: `A` | Name: `@` | Value: `76.76.21.21`
   - Type: `CNAME` | Name: `www` | Value: `cname.vercel-dns.com`
4. Repeat for both tablefinder.ai and tablefinder.io
5. DNS propagation takes 5-30 minutes (sometimes up to 48h)

#### Make tablefinder.ai the primary:
In Vercel Domains settings, set `tablefinder.ai` as primary and configure `tablefinder.io` to redirect to `tablefinder.ai`.

### Step 5: Verify

1. Visit `tablefinder.ai` — you should see the landing page
2. Try a search — the AI agent should find restaurants and return booking links
3. Click a booking link — it should open the platform in a new tab
4. Check Vercel logs (Deployments → Functions) if anything fails

## Local Development

```bash
# Copy env template
cp .env.example .env.local

# Add your Anthropic API key to .env.local

# Install dependencies
npm install

# Run dev server
npm run dev

# Open http://localhost:3000
```

## Cost Estimate

Each user search costs approximately $0.03-0.08 in Anthropic API usage (Claude Sonnet + web search tool calls). At 100 searches/day, expect ~$5-8/day. Monitor usage at console.anthropic.com.

## Rate Limiting (Recommended for Production)

The current build has no rate limiting. Before getting significant traffic, you should add:

1. **IP-based rate limiting** — Vercel Edge Middleware or `@vercel/kv`
2. **Optional: User auth** — so you can track per-user usage
3. **Optional: Usage caps** — e.g., 10 free searches/day, then require signup

These are not included in the MVP to keep it simple to ship.
