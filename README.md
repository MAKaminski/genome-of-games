# The Genome of Games

An ontology of video game mechanics. 168 mechanics, 619 games, 394 companies, 4,371 recorded links,
1962 to the present. Every mechanic has one credited origin game and a traceable chain of ancestors
reaching back to a root.

**1,244 static pages. Zero runtime dependencies. Builds in under two seconds.**

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
data/graph.json       1,181 nodes and 4,371 edges with precomputed graph layouts
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
| `/game/<slug>/` | 619 | |
| `/studios/` + `/studios/<letter>/` | 28 | Index and A–Z pages |
| `/studio/<slug>/` | 394 | |
| `/eras/` + `/era/<slug>/` | 8 | |
| `/methodology/` | 1 | How origins are assigned; known limits |
| `/graph/` | 1 | Interactive canvas, deep-linkable |
| **Total** | **1,244** | plus `sitemap.xml`, `robots.txt`, `search-index.json`, `404.html` |

## SEO surface

- **89,351 internal links.** Zero broken. Zero orphan pages. Median 13 inbound links per page.
- **Structured data** on every page: `BreadcrumbList` everywhere, plus `DefinedTerm` + `FAQPage`
  on mechanics, `VideoGame` on games, `Organization` on studios, `WebSite` + `Dataset` on the homepage.
- **Unique title and meta description** per page, generated from that page's own data.
- **16 Open Graph images**, one per mechanic family plus a default.
- **Outbound citation links** on every entity page to Wikipedia, MobyGames and Giant Bomb.
  These are resolver links (they land on the exact article when one exists, a search when it does
  not) rather than hand-verified permalinks — see *Known limitations* below.
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
- **External links are resolvers, not verified permalinks.** Upgrading them to hand-checked
  Wikipedia and MobyGames URLs is the single highest-value improvement available to this dataset.

## Editing the data

All content lives in `data/`. Change a JSON file, run `node build.js`, and the affected pages
regenerate. Adding a mechanic means adding an entry to `features.json` (with `parents` that predate
it) and a matching key in `prose.json`. The build fails loudly on dangling references.

## License

Data and prose: CC BY 4.0. Code: MIT. Attribution appreciated — a link back to the site is the
whole point.
