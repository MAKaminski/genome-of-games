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
are bolted on at the edges: five small Vercel Functions in `api/`, one client script, and nothing
else. There are still **no npm dependencies** and **no database** — Stripe and Resend are reached
over plain HTTP with `fetch`, and the "account" is a signed token.

| Piece | Where |
|---|---|
| Sign-in | `api/magic.mjs` emails a one-time link (signed token, one hour) through Resend; `api/session.mjs` exchanges it for a thirty-day session token the browser keeps in `localStorage` |
| Who is subscribed | Stripe. `api/status.mjs` looks the reader's email up as a Stripe customer and reads their subscription live — there is no subscriber table to keep in sync and no webhook |
| $10/mo subscription | Stripe Checkout → `api/checkout.mjs` |
| Billing changes and cancellation | Stripe billing portal → `api/portal.mjs` |
| The free-updates list | Resend contacts. Every sign-in adds the address (`addContact` in `lib/api.mjs`) |
| Analytics | PostHog, loaded only when `POSTHOG_KEY` is set; sign-in identifies the person by email |

Every function returns `503` with a plain message when its env vars are missing, so an unconfigured
deployment is obviously unconfigured rather than subtly broken.

**`/api` routes keep their trailing slash** (`/api/checkout/`). `vercel.json` sets
`trailingSlash: true` for the content pages, so the unslashed form 308-redirects — fine in a
browser, not fine for a POST.

### Conversion and analytics

The conversion this site optimises for is the **free sign-in**: it turns an anonymous reader into a
person with an email in PostHog and on the Resend list, which is what makes the $10/month newsletter
sellable later. Every entity page and the homepage carry one ask — the "Follow" panel (`followCta`
in `lib/shell.js`) — and everything a reader can do that predicts a sign-in is an event, so the
funnel can be read end to end:

| Event | Fired by | Meaning |
|---|---|---|
| `$pageview` | PostHog | Visit |
| `engaged_read` | `static/app.js` | 60% of the page scrolled, or 45 s on it, whichever first |
| `outbound_click` | `static/app.js` | Left for a linked source; `target` is `site`, `steam`, `gog`, `wikipedia`, `mobygames`, `igdb`, `x` or `giantbomb` |
| `search_used` / `search_result_click` | `static/app.js` | Header search, one event per settled query |
| `cta_viewed` / `cta_click` | `static/app.js` | Follow panel seen / clicked; `placement` is `home`, `mechanic`, `game` or `studio` |
| `mcp_snippet_copied` / `repo_click` | `static/app.js` | Developer intent: copied an MCP config, or opened the repository |
| `gog_signin_started` → `gog_magic_sent` → `gog_signed_in` | `static/gog.js` | Sign-in — **the conversion** |
| `gog_checkout_started` → `gog_subscribed` | `static/gog.js` | Stripe checkout for the paid tier |

The funnel and the supporting charts live on the PostHog dashboard **Genome of Games — conversion**
(project 199170). `cta_viewed` exists so the panel's click-through is a rate, not a count; compare
placements before moving or rewording it.

### Outbound links

`data/links.json` is committed output from two scripts, neither of which runs at build time:

1. `node scripts/verify-links.js` — resolves every entity to a **verified Wikipedia permalink**
   (or records that no article exists).
2. `node scripts/enrich-links.js` — from each verified article, reads the entity's other identities
   off Wikidata: official website, Steam, GOG, IGDB, MobyGames and the studio's X account. Nothing
   is guessed from a name; every link is a Wikidata claim.

Pages render them as followed links (`lib/shell.js` `externals`) and publish the same set as
schema.org `sameAs`, so a search or answer engine can merge each page with the studio's or game's
own presence. Re-run both scripts after adding entities.

### Environment variables

| Variable | Notes |
|---|---|
| `SITE_URL` | Canonicals, OG tags, sitemap, and the host in sign-in links. Set before the first production deploy. |
| `MAGIC_SECRET` | **Secret.** Signs sign-in links and session tokens. 32 random bytes as hex: `openssl rand -hex 32`. Rotating it signs everyone out. |
| `RESEND_API_KEY` | **Secret.** Sends the sign-in link and adds sign-ins to the contact list. A key with sending access is enough for the email; adding contacts needs full access. |
| `MAGIC_FROM` | From address for the sign-in email, e.g. `The Genome of Games <genome@yourdomain.com>`. The domain must be verified in Resend. |
| `STRIPE_SECRET_KEY` | **Secret.** Stripe → Developers → API keys. |
| `STRIPE_PRICE_ID` | The recurring $10/month price. |
| `POSTHOG_KEY` · `POSTHOG_HOST` | Project key is public. Host defaults to `https://us.i.posthog.com`. |
| `GITHUB_URL` | Defaults to this repository. |

Tokens are HMAC-signed, not stored, so a magic link stays valid until it expires even after it has
been used once; the hour-long window is the mitigation. Rotate `MAGIC_SECRET` if a link is ever
leaked at scale.

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
