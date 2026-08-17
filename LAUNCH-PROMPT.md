# Launch prompt — paste into a Cowork session

Everything below the line is the prompt. It is written to be pasted whole. The facts in it were
verified against `data/graph.json` on 2026-08-17; if you re-run it much later, re-check the counts
with `node build.js` (the build prints them) before posting anything.

**The one rule it enforces:** draft everything, post nothing without your explicit go-ahead. A
launch is a one-shot resource — a bad HN title cannot be retried for 30 days, and asking for upvotes
gets a domain banned.

---

You are helping me launch a research project I built. Your job this session is to **draft and
stage** launch posts, get my approval on each, and only then post the ones I have connected
accounts for. Do not post, submit, tweet, email, or publish anything until I say "post it" for that
specific item. If you cannot post something yourself, produce it as copy-paste-ready text with the
exact destination URL.

## The thing being launched

**The Genome of Games** — https://genome-of-games.vercel.app
Source and full dataset — https://github.com/MAKaminski/genome-of-games (CC BY 4.0)

An ontology of video game mechanics. Every mechanic has one credited origin game and a traceable
chain of ancestors reaching back to a root in 1962. It is a static site of 1,244 pages plus an
interactive canvas graph you can pan, zoom, and deep-link into.

Verified numbers — use these exactly, do not round up or embellish:

- 168 mechanics, 618 games, 394 companies, 4,366 recorded links, 1962–2025
- 1,244 static pages, no runtime dependencies, builds in under two seconds
- 949 of 1,180 entities carry a Wikipedia permalink verified against the Wikipedia API; entities
  with no article carry no link rather than a dead search

## Facts that actually make people click

These are the hooks. Each one is verified in the dataset — do not invent others, and if you want to
use a new one, check it against the JSON in the repo first.

1. **Battle royale is a 1980 mechanic plus a 2004 one.** Shrinking-Circle Battle Royale (PUBG, 2017)
   has exactly two parents in the dataset: Automated Skill Matchmaking (2004) and Rogue's Survival
   Needs Clock (1980). The genre is a food clock wearing a lobby.
2. **Loot boxes descend from the arcade coin slot.** Randomized Loot Box (Team Fortress 2, 2010)
   traces back through the Free-to-Play Service Model and the Coin-Op Difficulty Economy to Lives
   and Continues (1978) and Numeric Score (1972). The quarter never went away; it just moved.
3. **The most contested credit on the site is one it gives away.** Over-the-Shoulder Aim is credited
   to kill.switch (2003), two years before Resident Evil 4 — which is the game designers actually
   copied. The dataset takes the earlier date and says so on the page rather than pretending it is
   settled.
4. **The deepest chain is ten steps.** Contextual Execution (2006) → Snap-to-Cover Combat →
   Over-the-Shoulder Aim → Dual-Analog Move + Look → Graded Analog Input → Analog Free-Roam 3D
   Movement → Momentum-Based Platform Control → Continuous Scrolling Playfield → Single-Screen
   Arena → Object Collision As Verb (Spacewar!, 1962).
5. **Rogue shipped five mechanics in 1980 that are still standard:** permadeath, XP and levels, hit
   points, a survival clock, and procedurally generated levels.
6. **Regenerating health rewired level design more than combat.** Halo (2001); 14 later adopters in
   the dataset. Arenas replaced corridors because health stopped being a resource on the map.

## Tone rules, learned the hard way

- Describe the *artifact*, never the act of making it. "I built" and "interactive" both underperform.
- Lead with a limitation, not a feature list. The methodology page is the reason a journalist or
  academic links to this instead of ignoring it — it is candid about coverage bias (thin on
  arcade-era Japan, PC strategy, mobile) and about `adopts` links being deliberately incomplete.
- No exclamation marks. No "excited to share". No emoji in the HN or Reddit copy.
- Never ask anyone to upvote. Never post the same link to multiple subreddits within a day.

## What to draft

Work through these in order and show me each before moving on.

1. **Hacker News.** Submit the root domain, not a deep link. Draft three title options, all
   describing the artifact. Then draft the first comment I post immediately after submitting — it
   should open with the hardest problem in the project (deciding what counts as an "origin"), use
   the kill.switch/RE4 example concretely, name where the data is weakest, and invite corrections.
   Best timing: Tue–Thu, 8–10am US Eastern; never Friday or a US holiday.
2. **Reddit**, one post per sub, each framed differently:
   - r/gamedesign — the taxonomy as a design-history argument; lead with the ontology, not visuals
   - r/truegaming — "genre is the wrong lens, descent is a better one"; long-form text, link inline
   - r/gamedev — the studio-lineage view and the open dataset
   - r/dataisbeautiful — the graph, one screenshot, OC tag, source and tool named in a comment
   Check each sub's self-promotion rules first and tell me if any needs comment history I lack.
3. **Bluesky and Mastodon.** One short post built on hook 1 or 2, plus a reply with the methodology
   link. Suggest what to screen-record from the graph — a specific lineage trace, not a general pan.
4. **Three cold emails**, three sentences each, one link, no attachments: one to a games-industry
   design newsletter, one to a data-visualization roundup, one to a games-history publication.
   Suggest specific current outlets and find the right editor's address where you can.
5. **A short list of university game-studies courses** whose syllabus this fits, with the professor
   and a two-sentence pitch. `.edu` links outlast every other kind. Do not draft anything that
   touches Wikipedia — adding your own project there is a conflict of interest and gets reverted.

## After I approve

Post only what I approved, in the order above, HN first and alone. Wait for HN to resolve before
anything else goes out — if it lands, the other channels pick it up for free; if it stalls, do not
resubmit for 30 days.

Then set up a tracking note: which channels went out when, and what referrers show up in PostHog.
The site tracks pageviews plus `gog_signin_started`, `gog_signed_in`, `gog_checkout_started` and
`gog_subscribed`, so we can see which channel actually converts rather than which one felt loudest.
