# Earning inbound links — a launch plan

Nobody can manufacture backlinks ethically. What follows is the part that actually works: putting a
genuinely link-worthy artifact in front of the specific people whose job is to link to things.

**One rule before anything below:** do not submit anywhere until the production domain is set
(`SITE_URL`) and `/methodology/` is live. The methodology page is the single biggest determinant of
whether a games journalist or an academic links to this or ignores it. It is the page that says
"this person knows what they don't know."

---

## Realistic expectations

| Tier | Effort | Likely referring domains | Timeline |
|---|---|---|---|
| Tier 1 — communities | ~4 hours | 3–15 | 1–2 weeks |
| Tier 2 — newsletters & press | ~6 hours | 2–8 | 2–8 weeks |
| Tier 3 — reference & academic | ~5 hours | 1–5, but high authority | 1–6 months |
| Tier 4 — passive | ongoing | compounding | 6+ months |

A front-page Hacker News hit alone typically produces 20–60 referring domains within a week, because
aggregators and newsletters scrape it. That single outcome dominates every other line in this table,
which is why the HN submission deserves more care than everything else combined.

---

## Tier 1 — Communities (do these first, in this order)

### Hacker News
The highest-variance, highest-return submission. Post the **root domain**, not a deep link.

- **Title:** `The Genome of Games: tracing every game mechanic back to its origin`
  Avoid "I built", avoid "interactive", avoid exclamation. HN titles that describe the *artifact*
  outperform titles that describe the *act of making it*.
- **Timing:** Tuesday–Thursday, 8–10am US Eastern. Avoid Fridays and US holidays entirely.
- **First comment, posted by you immediately after submitting** — this is what converts curiosity
  into links:

  > Author here. The part I found hardest was deciding what counts as an "origin." Over-the-shoulder
  > aim is the clean example: kill.switch (2003) shipped it two years before Resident Evil 4, but RE4
  > is what designers actually copied. I went with the earlier date and flagged the dispute on the
  > page rather than pretending it's settled. The methodology page lists every case like that, plus
  > where the data is weakest (arcade-era Japan and PC strategy are both thinner than they should be).
  > Corrections very welcome — the whole dataset is JSON in the repo.

  Admitting a specific limitation in the first comment reliably outperforms a feature list on HN.
- **If it stalls:** do not resubmit within 30 days and never ask anyone to upvote. Both are
  detectable and both get domains banned.

### Reddit
Different subs reward completely different framings. Read each sub's rules on self-promotion first;
several require a comment-history ratio before you post.

| Subreddit | Angle | Notes |
|---|---|---|
| r/gamedesign | The ontology as a design-history argument | Highest fit. Lead with the taxonomy, not the visuals |
| r/truegaming | "Genre is the wrong lens; descent is a better one" | Long-form text post; link inline, not as the title |
| r/gamedev | Studio-lineage view + the open dataset | Devs care about the spinoff graph |
| r/dataisbeautiful | The graph view, single screenshot | Strict rules: OC tag, source and tool comment required |
| r/patientgamers, r/Games | Weakest fit — skip unless the others land | Heavy self-promo filtering |

### Bluesky / Mastodon
Where a large share of working game developers and games-press people now are. Post the graph as a
short screen recording, tag nothing, and reply to your own post with the methodology link. Devs
sharing "this is where my mechanic came from" is the mechanic of virality here — consider seeding
that by @-ing nobody but posting one genuinely surprising lineage (Rogue → Diablo → Minecraft).

---

## Tier 2 — Newsletters and press

Send a **short** email. Three sentences, one link, no attachments, no deck. Editors delete anything
longer.

**Targets, roughly in order of fit:**

1. Games-industry analysis newsletters (Game Developer / GDC-adjacent writers, indie business
   newsletters, design-focused Substacks)
2. Data-visualization roundups — several weekly newsletters exist purely to link new interactive
   viz; these are the easiest links on this list
3. Games-history and preservation publications
4. General "interesting web" newsletters, which have an outsized appetite for exactly this format

**Template:**

> Subject: A graph of where every game mechanic came from
>
> I built an ontology of 168 game mechanics — each traced to the game that first shipped it, and to
> its parent mechanics, back to Spacewar! in 1962. Battle royale decomposes into matchmaking plus a
> 1980 food clock; regenerating health rewired a decade of level design.
>
> It's free, has no ads, and the methodology page is candid about where the attributions are
> contested. If it's useful to you: [link]
>
> Happy to answer anything or send the raw dataset.

Send individually. Never BCC a list — it is visible and it is fatal.

---

## Tier 3 — Reference and academic

These are slow and produce the most durable links.

- **Wikipedia.** Do *not* add links to your own project — that is a conflict of interest under
  WP:COI and will get reverted and logged. What you *can* do: post on the talk page of relevant
  articles (Video game design, Game mechanics, History of video games) disclosing that you built it
  and asking whether editors consider it a useful external link. Sometimes yes, sometimes no. The
  honest route is the only route that survives.
- **University game-studies reading lists and syllabi.** Email professors who teach game design
  history directly. A free, citable, well-sourced artifact with a stated methodology is exactly what
  a syllabus wants. `.edu` links are worth many times a forum link.
- **DiGRA and game-studies mailing lists.** Present it as a research artifact with known
  limitations, not as a product.
- **Library and research guides** (LibGuides) on game studies — librarians actively solicit
  suggestions and link generously.

---

## Tier 4 — Passive link earning

Structural work already built into the site that keeps earning links without further effort:

- **Every mechanic page carries a "Cite this entry" block** with a formatted citation and the
  permalink, which makes linking the path of least resistance for anyone writing about that mechanic.
- **168 pages answer a specific question** ("Which game invented X?") and each carries `FAQPage`
  structured data, so they compete for the exact query someone types before writing a blog post.
- **The dataset is open (CC BY 4.0).** Anyone reusing it must attribute. Say so loudly on the
  homepage and README.
- **Deep-linkable graph states** (`/graph/?node=…&trace=1`) mean people share a *specific claim*
  rather than the front page, which spreads links across the site instead of concentrating them.

---

## Highest-value improvement before launching

Upgrade the external links from resolvers to hand-verified permalinks. Right now every entity page
links to a Wikipedia search that lands on the article when an exact title match exists. Verified
canonical URLs would:

1. make the pages materially more useful, which is what actually earns links
2. remove the one thing a skeptical editor could point at and call sloppy

For the ~200 highest-traffic entities (all 168 mechanic origin games, plus the top studios) this is a
bounded job — a batch lookup against the Wikipedia API and a manual pass on the ambiguous ones. It is
the difference between "nice project" and "reference I'd cite."

---

## What not to do

Guest-post networks, paid link placements, directory submissions, comment links, PBNs, and
"link exchange" offers are all either detectable, penalized, or both. A single link from a games
studies syllabus is worth more than a thousand of them, and it does not put the domain at risk.
