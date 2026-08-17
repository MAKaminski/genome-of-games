#!/usr/bin/env node
/* Verify Wikipedia articles for every entity in the dataset.

   Run manually — never part of the build. The build stays offline and
   reproducible; data/links.json is committed output.

     node scripts/verify-links.js              # all 1,181 entities
     node scripts/verify-links.js --only F     # mechanics only (F | T | C)
     node scripts/verify-links.js --limit 40   # smoke test

   Writes:
     data/links.json         id -> { wp: url }  verified, or { wp: null } checked and rejected
     data/links-review.json  every rejection, with the candidates tried and why they failed
*/
const fs = require('fs');
const path = require('path');
const T = require('../lib/data');

const API = 'https://en.wikipedia.org/w/api.php';
const UA = 'GenomeOfGames-LinkVerifier/1.0 (https://genome-of-games.vercel.app; dataset link verification)';
const PAUSE = 150;          // ms between requests — polite, well inside Wikipedia's limits
const TITLE_BATCH = 50;     // API cap for prop=info|pageprops
const EXTRACT_BATCH = 20;   // API cap for prop=extracts

const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const ONLY = flag('--only');
const LIMIT = Number(flag('--limit')) || 0;

/* An article has to look like it is about this medium. Checked against the
   plain-text intro — this is what stops the game "Portal" resolving to the
   architectural feature, or "Karateka" to the martial artist.

   Wikipedia rarely writes the bare phrase "video game": it writes "a 1984
   fighting game", "a space combat simulation game". So match a genre word in
   front of "game", never "game" on its own — "the Olympic Games" must not
   qualify an article as being about this medium. */
const TOPICAL = new RegExp([
  '\\b(?:video|computer|arcade|console|handheld|mobile|browser|online|indie|puzzle|fighting|racing',
  '|shooter|strategy|simulation|adventure|platform|platforming|role-playing|sports|action|party|rhythm',
  '|stealth|survival|horror|sandbox|roguelike|management|tactical|combat)[\\s-]?games?\\b',
  '|\\bvideo ?game|\\bgame (?:developer|publisher|company|studio|engine|console|series|design|industry)',
  '|\\b(?:developer|publisher) (?:and|&) publisher|\\bgameplay\\b|\\bgaming\\b',
  '|\\bfirst-person shooter\\b|\\bthird-person shooter\\b|\\breal-time strategy\\b|\\bmmorpg\\b',
  '|\\bbeat .?em up\\b|\\bshoot .?em up\\b|\\bmetroidvania\\b|\\bvisual novel\\b|\\bgame boy\\b',
  '|\\broguelike\\b|\\bdungeon crawl|\\bplay(?:st|er)ation\\b|\\bnintendo\\b|\\bxbox\\b|\\bsega\\b|\\bsteam \\(service\\)'
].join(''), 'i');

const sentenceCase = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/* Year-qualified first for games: "Doom" is a disambiguation and
   "Doom (video game)" redirects to the franchise article, but this dataset
   means the 1993 title. The most specific candidate has to win. */
function candidates(n) {
  const name = n.n;
  if (n.t === 'T') return [`${name} (${n.y} video game)`, name, `${name} (video game)`];
  if (n.t === 'C') return [name, `${name} (company)`, `${name} (video game company)`];
  return [name, sentenceCase(name), `${name} (video games)`];
}

/* A studio's article has to be about the studio. Many studio names redirect to
   the one game they made — Shedworks lands on "Sable (video game)" — and a game
   article sails through the topical check.

   Name similarity is the wrong test for this: DMA Design → Rockstar North and
   Apogee Software → 3D Realms are renames, and they are exactly the corporate
   lineage this dataset exists to trace. What the article is *about* is the
   right test. A one-person studio resolving to its founder — ConcernedApe →
   Eric Barone — is also the correct referent, so people are allowed. */
const PRODUCT_TITLE = /\((?:\d{4} )?(?:video game|arcade game|film|album|song|novel|TV series)\)$/i;
const SERIES_TITLE = /\((?:franchise|series|video game series)\)$/i;
/* Prose is a bad way to tell a company article from a game article — company
   names contain "Games", and game articles credit their "developer". Categories
   are decisive: every game article carries a "<year> video games" category and
   no company or person article does. */
const YEAR_GAMES_CAT = /^Category:\d{4} video games$/;
const isGameArticle = cats => cats.some(c => YEAR_GAMES_CAT.test(c));

/* Categories are also the better topical signal. The genre list above will
   never be complete — Wikipedia calls Teamfight Tactics an "auto battler
   game" — but every article in this medium is categorised for it. */
const GAMEY_CAT = /video game|arcade game|game (?:compan|developer|publisher|studio|design)/i;
const isTopical = (text, cats) => cats.some(c => GAMEY_CAT.test(c)) || TOPICAL.test(text);

/* A glossary or list entry is not a permalink to a concept. */
const NOT_AN_ARTICLE = /^(?:List|Glossary|Index|Outline|Timeline) of /i;

function articleFitsEntity(n, title, cats) {
  if (n.t !== 'C') return true;
  if (PRODUCT_TITLE.test(title)) return false;
  return !isGameArticle(cats);   // a studio that redirects to its own game
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(params) {
  const qs = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', ...params });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${API}?${qs}`, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip' } });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()).query || {};
    } catch (err) {
      if (attempt === 3) throw err;
      await sleep(1000 * attempt);
    }
  }
}

/* The API rewrites titles twice — normalisation then redirects — so map the
   title we asked for onto the title we got back before reading the result. */
function resolveMap(q) {
  const hop = {};
  for (const r of q.normalized || []) hop[r.from] = r.to;
  for (const r of q.redirects || []) hop[r.from] = r.to;
  return t => { let cur = t, guard = 0; while (hop[cur] && guard++ < 8) cur = hop[cur]; return cur; };
}

const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function main() {
  let nodes = T.G.nodes.filter(n => !ONLY || n.t === ONLY);
  if (LIMIT) nodes = nodes.slice(0, LIMIT);
  console.log(`verifying ${nodes.length} entities against Wikipedia\n`);

  const wanted = new Map();   // node id -> candidate titles, in priority order
  const allTitles = new Set();
  for (const n of nodes) {
    const c = candidates(n);
    wanted.set(n.id, c);
    c.forEach(t => allTitles.add(t));
  }

  /* ---- pass 1: which candidate titles exist, and are they disambiguations? ---- */
  const page = new Map();     // resolved title -> { url, disambig }
  const resolvedTo = new Map(); // requested title -> resolved title
  const batches1 = chunk([...allTitles], TITLE_BATCH);
  for (const [i, batch] of batches1.entries()) {
    const q = await api({ titles: batch.join('|'), redirects: '1', prop: 'info|pageprops', inprop: 'url' });
    const resolve = resolveMap(q);
    batch.forEach(t => resolvedTo.set(t, resolve(t)));
    for (const p of q.pages || []) {
      if (p.missing) continue;
      page.set(p.title, { url: p.fullurl, disambig: !!(p.pageprops && p.pageprops.disambiguation !== undefined) });
    }
    process.stdout.write(`\r  pass 1 — existence  ${i + 1}/${batches1.length} batches`);
    await sleep(PAUSE);
  }
  console.log(`\n  ${page.size} of ${allTitles.size} candidate titles exist`);

  /* ---- shortlist: existing, not a disambiguation, not a list article ---- */
  const shortlist = new Map();  // node id -> [{ title, url }]
  const needExtract = new Set();
  for (const [id, cands] of wanted) {
    const live = [];
    for (const c of cands) {
      const title = resolvedTo.get(c) || c;
      const p = page.get(title);
      if (!p || p.disambig || NOT_AN_ARTICLE.test(title)) continue;
      if (T.N[id].t === 'C' && PRODUCT_TITLE.test(title)) continue;
      if (!live.some(x => x.title === title)) { live.push({ title, url: p.url }); needExtract.add(title); }
    }
    if (live.length) shortlist.set(id, live);
  }
  console.log(`  ${shortlist.size} entities have at least one live candidate; ${needExtract.size} intros to read\n`);

  /* ---- pass 2: intro text (is it about this medium?) and categories (is it
         a game, a company or a person?) ---- */
  const intro = new Map(), cats = new Map();
  const batches2 = chunk([...needExtract], EXTRACT_BATCH);
  for (const [i, batch] of batches2.entries()) {
    const q = await api({
      titles: batch.join('|'), redirects: '1', prop: 'extracts|categories',
      exintro: '1', explaintext: '1', cllimit: 'max', clshow: '!hidden'
    });
    const resolve = resolveMap(q);
    const gotText = new Map((q.pages || []).map(p => [p.title, (p.extract || '').slice(0, 1500).toLowerCase()]));
    const gotCats = new Map((q.pages || []).map(p => [p.title, (p.categories || []).map(c => c.title)]));
    batch.forEach(t => {
      intro.set(t, gotText.get(resolve(t)) || '');
      cats.set(t, gotCats.get(resolve(t)) || []);
    });
    process.stdout.write(`\r  pass 2 — topical check  ${i + 1}/${batches2.length} batches`);
    await sleep(PAUSE);
  }
  console.log('\n');

  /* ---- decide ---- */
  const links = {}, review = [];
  for (const n of nodes) {
    const live = shortlist.get(n.id) || [];
    let hit = null, why = null;
    /* Two sweeps: a specific article beats a series article. "inFAMOUS" redirects
       to "Infamous (series)", but this dataset means the 2009 game. */
    for (const preferSpecific of [true, false]) {
      for (const c of live) {
        if (preferSpecific && SERIES_TITLE.test(c.title)) continue;
        const text = intro.get(c.title) || '';
        const cat = cats.get(c.title) || [];
        if (!text && !cat.length) { why = 'no intro text'; continue; }
        if (!isTopical(text, cat)) { why = 'not about video games'; continue; }
        if (!articleFitsEntity(n, c.title, cat)) { why = 'article is about a game, not this company'; continue; }
        hit = c; break;
      }
      if (hit) break;
    }
    if (hit) {
      links[n.id] = { wp: hit.url };
    } else {
      links[n.id] = { wp: null };
      review.push({
        id: n.id, name: n.n, type: n.t, year: n.y || null, page: T.url(n.id),
        reason: live.length ? why : 'no article under any candidate title',
        tried: wanted.get(n.id),
        liveButRejected: live.map(c => c.title)
      });
    }
  }

  const dir = path.join(__dirname, '..', 'data');
  fs.writeFileSync(path.join(dir, 'links.json'), JSON.stringify(links, null, 0) + '\n');
  fs.writeFileSync(path.join(dir, 'links-review.json'), JSON.stringify(review, null, 1) + '\n');

  const ok = Object.values(links).filter(v => v.wp).length;
  const by = t => nodes.filter(n => n.t === t).filter(n => links[n.id].wp).length;
  const tot = t => nodes.filter(n => n.t === t).length;
  console.log(`verified ${ok} of ${nodes.length} (${(ok / nodes.length * 100).toFixed(1)}%)`);
  console.log(`  mechanics ${by('F')}/${tot('F')} · games ${by('T')}/${tot('T')} · studios ${by('C')}/${tot('C')}`);
  console.log(`\ndata/links.json written · ${review.length} entries in data/links-review.json for a manual pass`);
}

main().catch(e => { console.error('\n' + e.stack); process.exit(1); });
