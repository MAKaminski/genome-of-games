# The Genome of Games

An ontology of video game mechanics. 168 mechanics, 618 games, 394 companies, 4,366 recorded links,
1962 to the present. Every mechanic has one credited origin game and a traceable chain of ancestors
reaching back to a root.

**1,243 static pages. Zero runtime dependencies. Builds in under two seconds.**

---

## Deploy to Vercel

```bash
npx vercel            # preview
npx vercel --prod     # production
```

Or connect the repo in the Vercel dashboard — `vercel.json` already sets the build command
(`node build.js`) and output directory (`out`). No framework, no `npm install`, nothing to configure.

**Set your domain before the first production deploy.** Canonical URLs, `sitemap.xml`, Open Graph
tags and JSON-LD all read from one environment variable:

```
SITE_URL = https://yourdomain.com
```

Add it in Vercel → Settings → Environment Variables, then redeploy. It defaults to
`https://genome-of-games.vercel.app` if unset. Getting this right on the first production deploy
matters: canonical URLs pointing at the wrong host will suppress indexing.

## Accounts, subscriptions and analytics

The 1,244 content pages are still pure static output with no runtime. Sign-in, billing and analytics
are bolted on at the edges: three Vercel Functions in `api/`, one client script, and nothing else.
There are still **no npm dependencies** — Supabase (GoTrue + PostgREST) and Stripe are both reached
over plain HTTP with `fetch`.

| Piece | Where |
|---|---|
| Google sign-in | Supabase Auth, redirect flow, tokens land in the URL fragment |
| Subscriber records | Supabase `public.gog_subscribers`, RLS on, read-own-row only |
| $10/mo subscription | Stripe Checkout → `api/checkout.mjs` |
| Billing changes and cancellation | Stripe billing portal → `api/portal.mjs` |
| Status sync | `api/stripe-webhook.mjs`, signature verified by hand over the raw body |
| Analytics | PostHog, loaded only when `POSTHOG_KEY` is set |

Every function returns `503` with a plain message when its env vars are missing, so an unconfigured
deployment is obviously unconfigured rather than subtly broken.

**`/api` routes keep their trailing slash** (`/api/checkout/`). `vercel.json` sets
`trailingSlash: true` for the content pages, so the unslashed form 308-redirects — which is fine in
a browser and not fine for a Stripe webhook. Register webhook URLs with the slash.

### Environment variables

| Variable | Notes |
|---|---|
| `SITE_URL` | Canonicals, OG tags, sitemap. Set before the first production deploy. |
| `SUPABASE_URL` · `SUPABASE_ANON_KEY` | Public by design — RLS is what protects the data. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret.** Server-only; bypasses RLS. Supabase → Settings → API. |
| `STRIPE_SECRET_KEY` | **Secret.** Stripe → Developers → API keys. |
| `STRIPE_PRICE_ID` | The recurring $10/month price. |
| `STRIPE_WEBHOOK_SECRET` | **Secret.** Shown when the webhook endpoint is created. |
| `POSTHOG_KEY` · `POSTHOG_HOST` | Project key is public. Host defaults to `https://us.i.posthog.com`. |
| `GITHUB_URL` | Defaults to this repository. |

### Enabling Google sign-in

Supabase needs Google OAuth credentials, which have to be created by hand:

1. Google Cloud Console → APIs & Services → Credentials → **OAuth client ID** → Web application.
2. Authorised redirect URI: `https://<your-project>.supabase.co/auth/v1/callback`
3. Supabase → Authentication → Providers → **Google**: paste the client ID and secret, enable.
4. Supabase → Authentication → URL Configuration → add `https://<your-domain>/newsletter/` to the
   redirect allow-list.

Until step 3 is done the sign-in button will bounce off Supabase with a provider error.

## Local development

```bash
node build.js     # writes ./out
node serve.js     # serves ./out at http://localhost:3000
```

## Repository layout

```
build.js              page generation — every route is defined here
serve.js              local static preview server
lib/data.js           loads JSON, builds slugs, indexes, adjacency and lineage helpers
lib/shell.js          HTML shell, <head>, nav, footer, shared components
data/graph.json       1,180 nodes and 4,366 edges with precomputed graph layouts
data/prose.json       ~34,000 words: three body paragraphs per mechanic
data/copy.json        homepage, 15 family essays, 7 era essays, methodology
data/features.json    the mechanic ontology (source of truth for families and parentage)
data/companies.json   company registry with lineage edges
static/styles.css     one stylesheet, no framework
static/app.js         header search — the only client JS outside the graph
static/graph.html     the interactive canvas graph (data injected at build time)
static/og/*.png       16 pre-rendered Open Graph images
out/                  build output (gitignored)
```

## Routes

| Route | Count | Notes |
|---|---|---|
| `/` | 1 | Homepage |
| `/features/` + `/features/<family>/` | 16 | Index and 15 family hubs, ~250-word essay each |
| `/feature/<slug>/` | 168 | The primary content pages |
| `/games/` + `/games/<decade>s/` | 8 | Index and 7 decade pages |
| `/game/<slug>/` | 618 | |
| `/studios/` + `/studios/<letter>/` | 28 | Index and A–Z pages |
| `/studio/<slug>/` | 394 | |
| `/eras/` + `/era/<slug>/` | 8 | |
| `/methodology/` | 1 | How origins are assigned; known limits |
| `/graph/` | 1 | Interactive canvas, deep-linkable |
| **Total** | **1,243** | plus `sitemap.xml`, `robots.txt`, `search-index.json`, `404.html` |

## SEO surface

- **89,351 internal links.** Zero broken. Zero orphan pages. Median 13 inbound links per page.
- **Structured data** on every page: `BreadcrumbList` everywhere, plus `DefinedTerm` + `FAQPage`
  on mechanics, `VideoGame` on games, `Organization` on studios, `WebSite` + `Dataset` on the homepage.
- **Unique title and meta description** per page, generated from that page's own data.
- **16 Open Graph images**, one per mechanic family plus a default.
- **Outbound citation links** on every entity page. Wikipedia links are **verified permalinks**:
  every entity was resolved against the Wikipedia API, and where no article exists the link is
  omitted rather than pointing at an empty search. MobyGames and Giant Bomb remain site searches.
  Re-run with `node scripts/verify-links.js` — see *Verifying outbound links* below.
- **`sitemap.xml`** with per-route priority, referenced from `robots.txt`.

## Graph deep links

The interactive graph accepts URL parameters, so any page can link into a specific graph state:

```
/graph/?node=f_battle_royale&trace=1      # select a node and trace its lineage to the root
/graph/?node=c_valve&lens=3               # open the studio-lineage lens on a company
/graph/?lens=2                            # franchise trees
```

The graph rewrites its own URL as you navigate, so any view is shareable.

## Known limitations

Read `/methodology/` — it is deliberately candid, and it is what makes the project citable rather
than dismissible. In short:

- **"Origin" means first notable shipped implementation, not invention.** Contested cases
  (over-the-shoulder aim, dual-analog, loot boxes, battle royale) are flagged in the prose on the
  page itself rather than asserted.
- **Coverage is biased** toward Western PC and Japanese console history. Arcade-era Japan, PC
  strategy and mobile interaction design are all thinner than they should be.
- **`adopts` edges are illustrative and incomplete** by design. They show that an idea spread; they
  do not claim to enumerate everywhere it spread.
- **Wikipedia links are verified; MobyGames and Giant Bomb are not.** Those two remain site
  searches, because verifying them needs API keys. `data/links-review.json` lists every entity the
  Wikipedia pass refused to guess at, and is where the remaining link errors live.

## Verifying outbound links

```bash
node scripts/verify-links.js              # all entities, ~3 minutes
node scripts/verify-links.js --only C     # studios only (F | T | C)
node scripts/verify-links.js --limit 40   # smoke test
```

Run manually, never as part of the build — `data/links.json` is committed output, so the build stays
offline and reproducible. The script resolves candidate titles against the Wikipedia API, rejects
disambiguation pages, glossaries and lists, and classifies the result by its **categories**: every
article about a game carries a `<year> video games` category and no company or person article does.
That is what stops a studio linking to the one game it made — `Shedworks` redirects to
`Sable (video game)` — while still allowing the renames this dataset exists to trace
(`DMA Design` → `Rockstar North`) and solo studios that resolve to their founder
(`ConcernedApe` → `Eric Barone`).

Everything it refuses to guess at lands in `data/links-review.json` with the candidates it tried and
why each failed. That file is the manual-pass worklist.

## Editing the data

All content lives in `data/`. Change a JSON file, run `node build.js`, and the affected pages
regenerate. Adding a mechanic means adding an entry to `features.json` (with `parents` that predate
it) and a matching key in `prose.json`. The build fails loudly on dangling references.

## License

Data and prose: CC BY 4.0. Code: MIT. Attribution appreciated — a link back to the site is the
whole point.
