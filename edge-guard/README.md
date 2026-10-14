# Edge Guard

One Vercel Firewall template for every project in team **Kaminski** (`makaminski1337`). It's here
because genome-of-games is the main traffic driver. It isn't specific to this site, and it can move
to its own repo unchanged.

| File | What it does |
|---|---|
| `firewall.json` | The template, written in **log** mode. Three custom rules, two managed rulesets, per-project overrides. |
| `resolve.mjs` | `node resolve.mjs <log\|enforce> <hobby\|pro> [project]` prints the concrete config. It is the single definition of what "enforce" means. |
| `apply.sh` | Applies the resolved config to every project in the team through the Vercel REST API. |

## The rules

Hobby allows 3 custom rules per project, and only 1 of them can be rate limiting. The template uses exactly that.

| # | Rule | Log mode | Enforce mode |
|---|---|---|---|
| 1 | `/api/*`: more than 60 requests per 60s from one IP | log | deny, plus a **15m** persistent block on Pro (10m is not an available duration) |
| 2 | `/api/*` with a missing or blank User-Agent | log | deny, plus 15m on Pro |
| 3 | `/api/*` bypasses Bot Protection | bypass | bypass |
| — | AI Bots managed ruleset | log | deny |
| — | Bot Protection managed ruleset | log | challenge |

**Why rule 3 exists.** In challenge mode, Bot Protection serves a JavaScript challenge to anything
that isn't a browser. That would break webhooks (Stripe, Twilio, Slack), MCP clients and other
server-to-server calls. Custom rules run before managed rulesets, so `/api/*` still goes through
rules 1 and 2 first. Abusive ASNs or user agents found in measurement go in as extra OR groups
inside rule 2.

**Per-project override.** On `genome-of-games`, AI Bots stays at **log** even in enforce mode,
because that site invites AI crawlers on purpose (`robots.txt`, `llms.txt`). Change it in
`projectOverrides` once there's a decision.

**Persistent actions are Pro-only.** `--plan hobby` strips `actionDuration`. The deny itself still applies.

## Billing

Requests the firewall denies, challenges or rate-limits **do not count** as CDN Requests or Fast
Data Transfer. That also applies to persistent actions, DDoS mitigation and IP blocks. A request
that *passes* a challenge counts as normal traffic.
Source: [Usage & Pricing for Vercel WAF](https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing).

## Running it

```bash
export VERCEL_TOKEN=...            # https://vercel.com/account/settings/tokens. Never commit it.
./apply.sh --mode log --dry-run    # print every change, touch nothing
./apply.sh --mode log              # 24h observation window
./apply.sh --mode enforce --plan pro
./apply.sh --mode enforce --plan hobby   # after the downgrade
./apply.sh --mode log --only genome-of-games,top-github-users
```

Re-running is idempotent. Rules are matched by name (`edge-guard: …`), and rules the script didn't
create, plus IP blocks, are never touched. Every project's current config is backed up to
`backups/` (gitignored) before any write. If a project would exceed Hobby's 3 custom rules, the
script skips it and says so instead of deleting anything.

**Known prerequisite.** A project that has never had a firewall config returns
`404 "Seawall Config not found"` to every API write. Publish any one change in that project's
Firewall dashboard once (for example AI Bots → Log), and the API works from then on.
