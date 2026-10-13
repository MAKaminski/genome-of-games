# Architecture

The Genome of Games has three moving parts. The site is static HTML on Vercel. A handful of
Vercel Functions handle sign-in and billing. The public MCP server runs on a Cloudflare Worker.
There is no database: the dataset is committed JSON and the account system is a signed token.

> **Why the MCP server moved (October 2026).** The open MCP endpoint was ~98% of this
> project's Vercel traffic. That was ~84% of the whole team's CDN requests and ~97% of its
> function invocations, enough to push the team past Vercel Hobby limits. The server now runs on
> Cloudflare Workers with a per-IP rate limit. The server code did not change:
> `lib/mcp-core.mjs` uses only the Fetch API, so it moved hosts as-is.

## Systems architecture, by layer

```mermaid
flowchart TB
  subgraph clients["Clients"]
    browser["Browser readers"]
    agents["MCP clients<br/>(Claude, Cursor, SDKs, curl)"]
  end

  subgraph fe["Front-end · Vercel CDN (static)"]
    pages["1,245 static pages<br/>out/ from build.js"]
    assets["styles.css · app.js · graph.html<br/>search-index.json · og/*.png"]
    seo["sitemap.xml · robots.txt · llms.txt<br/>/mcp/ docs page"]
    legacy["vercel.json redirect<br/>/api/mcp/ → 308 to the Worker<br/>(7 days, then firewall deny)"]
  end

  subgraph mw["Middleware · APIs"]
    subgraph cf["Cloudflare Workers (public MCP endpoint)"]
      worker["worker/src/index.mjs<br/>routing + per-IP rate limit (60/min)"]
    end
    subgraph vfn["Vercel Functions"]
      auth["api/magic.mjs · api/session.mjs<br/>sign-in"]
      bill["api/checkout.mjs · api/portal.mjs<br/>api/status.mjs · billing"]
    end
    core["lib/mcp-core.mjs<br/>JSON-RPC handlers · 8 tools"]
  end

  subgraph be["Back-end · data"]
    idx["data/mcp-index.json<br/>denormalised, built by build.js"]
    src["data/graph.json · features.json<br/>companies.json · prose.json<br/>copy.json · links.json"]
    stripe[("Stripe<br/>customers · subscriptions")]
    resend[("Resend<br/>contacts · email")]
  end

  subgraph infra["Infrastructure"]
    vfw["Vercel Firewall<br/>/api/* rate limit · empty-UA deny<br/>AI Bots deny · Bot Protection"]
    cfedge["Cloudflare edge<br/>*.workers.dev"]
    gh["GitHub → Vercel build<br/>node build.js"]
    wr["wrangler deploy<br/>(worker/)"]
  end

  browser --> vfw --> pages & assets & seo
  browser --> vfw --> auth & bill
  agents --> cfedge --> worker --> core
  agents -. old URL .-> vfw --> legacy -. 308 .-> cfedge
  core --> idx
  src --> gh --> idx
  gh --> pages
  wr --> worker
  auth --> resend
  bill --> stripe
```

| Layer | Component | Where it runs | Notes |
|---|---|---|---|
| Front-end | Static pages, assets, `llms.txt`, `/mcp/` docs | Vercel CDN | No runtime. Built by `build.js` into `out/` |
| Middleware | MCP server (`lib/mcp-core.mjs`) | **Cloudflare Worker** `genome-of-games-mcp` | The public endpoint. Per-IP rate limit of 60/min via the Workers Rate Limiting binding |
| Front-end | `/api/mcp/` | Vercel CDN | Transitional. A `vercel.json` 308 to the Worker, no function. MCP SDK clients don't follow cross-origin redirects by default and fail with an error naming the new URL; generic HTTP clients follow it. Replaced by a firewall deny after 7 days |
| Middleware | Sign-in, billing (`api/*.mjs`) | Vercel Functions | Zero dependencies, `fetch` only |
| Back-end | Dataset JSON, `mcp-index.json` | Committed to git, bundled into the Worker | Read-only. Changing data means a rebuild and a redeploy |
| Back-end | Stripe, Resend | SaaS | The only state outside git |
| Infrastructure | Vercel Firewall, Cloudflare edge, GitHub → Vercel build, `wrangler deploy` | — | Firewall config is managed team-wide by the edge-guard template |

The public MCP URL lives in one place: `MCP_ENDPOINT` in `lib/data.js` (override it with the
`MCP_ENDPOINT` env var). `build.js` writes it into the docs page, `llms.txt`, and
`meta.endpoint` in `data/mcp-index.json`, and the server's own GET description reads it from there.

## Data model (ERD)

There is no database. These are the entities in the committed JSON and how they relate.
`graph.json` holds the 1,180 nodes and 4,366 typed edges. `features.json` and `companies.json`
are the editable sources. `mcp-index.json` is a denormalised projection of all of it, built for
the MCP server.

```mermaid
erDiagram
  FAMILY ||--o{ MECHANIC : groups
  ERA ||--o{ MECHANIC : "dates (by year)"
  MECHANIC }o--o{ MECHANIC : "derives (parent → child)"
  GAME ||--o{ MECHANIC : "introduces (exactly one origin per mechanic)"
  GAME }o--o{ MECHANIC : adopts
  GAME }o--o{ GAME : "sequel · descends"
  STUDIO ||--o{ GAME : developed
  STUDIO ||--o{ GAME : published
  STUDIO }o--o{ STUDIO : "acquired · rename · spinoff"
  ENTITY ||--o| LINK : "verified outbound links"
  MECHANIC ||--|| PROSE : "three-paragraph essay"
  READER ||--o| STRIPE_CUSTOMER : "email lookup (live)"
  READER ||--o| RESEND_CONTACT : "added on sign-in"

  FAMILY { string key PK "e.g. CBT" string name string blurb string color }
  ERA { string slug PK string name int from int to string essay }
  MECHANIC { string id PK "f_*" string name int year string family FK string origin FK "game id" }
  GAME { string id PK "t_*" string name int year string platform string genre }
  STUDIO { string id PK "c_*" string name int founded int ended string country string kind }
  LINK { string id PK "entity id" string wp "Wikipedia permalink" }
  PROSE { string id PK "mechanic id" json paragraphs "three body paragraphs" }
  ENTITY { string id PK "any f_/t_/c_ node" }
  READER { string email PK "signed token, not stored" }
  STRIPE_CUSTOMER { string id PK string email string subscription_status }
  RESEND_CONTACT { string email PK }
```

| Edge kind | From → To | Count |
|---|---|---|
| `adopts` | game → mechanic | 2,487 |
| `developed` | studio → game | 617 |
| `published` | studio → game | 376 |
| `derives` | mechanic → mechanic | 199 |
| `sequel` | game → game | 198 |
| `introduces` | game → mechanic | 168 |
| `acquired` | studio → studio | 155 |
| `descends` | game → game | 110 |
| `spinoff` | studio → studio | 42 |
| `rename` | studio → studio | 14 |
