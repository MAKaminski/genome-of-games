#!/usr/bin/env node
/* Enrich data/links.json with official, store and database links from Wikidata.

   Run manually, after scripts/verify-links.js — never part of the build. The
   build stays offline and reproducible; data/links.json is committed output.

     node scripts/enrich-links.js              # every entity with a verified Wikipedia article
     node scripts/enrich-links.js --only C     # studios only (F | T | C)
     node scripts/enrich-links.js --limit 40   # smoke test

   The verified Wikipedia permalink is the key: Wikidata's schema:about maps an
   article URL to its item, and the item carries the links this site wants —
   the official website (P856), Steam (P1733), GOG (P2725), IGDB (P5794),
   MobyGames game (P1933) and company (P4773) IDs, and the X handle (P2002).
   Nothing is guessed from a name; every link below is a Wikidata claim.

   Writes data/links.json: id -> { wp, site, steam, gog, igdb, moby, x }
   (absent keys mean Wikidata has no claim; existing wp values are kept). */
const fs = require('fs');
const path = require('path');

const SPARQL = 'https://query.wikidata.org/sparql';
const UA = 'GenomeOfGames-LinkEnricher/1.0 (https://genome-of-games.vercel.app; dataset link enrichment)';
const BATCH = 60;           // article URLs per query — keeps each query well under the 60s limit
const PAUSE = 400;          // ms between queries; the endpoint asks for restraint

const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const ONLY = flag('--only');
const LIMIT = Number(flag('--limit')) || 0;

const dir = path.join(__dirname, '..', 'data');
const linksPath = path.join(dir, 'links.json');
const links = JSON.parse(fs.readFileSync(linksPath, 'utf8'));
const G = JSON.parse(fs.readFileSync(path.join(dir, 'graph.json'), 'utf8'));
const typeOf = Object.fromEntries(G.nodes.map(n => [n.id, n.t]));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/* Wikidata stores sitelinks as https://en.wikipedia.org/wiki/Title with the
   title percent-encoded; the API's fullurl uses the same form. Normalise both
   sides so odd characters (apostrophes, parentheses) still match. */
const norm = u => {
  try { return decodeURIComponent(u).replace(/^http:/, 'https:'); } catch { return u; }
};

async function query(urls) {
  const values = urls.map(u => `<${u}>`).join(' ');
  const q = `SELECT ?article ?item ?site ?steam ?gog ?igdb ?mobyG ?mobyC ?x WHERE {
  VALUES ?article { ${values} }
  ?article schema:about ?item .
  OPTIONAL { ?item wdt:P856 ?site }
  OPTIONAL { ?item wdt:P1733 ?steam }
  OPTIONAL { ?item wdt:P2725 ?gog }
  OPTIONAL { ?item wdt:P5794 ?igdb }
  OPTIONAL { ?item wdt:P1933 ?mobyG }
  OPTIONAL { ?item wdt:P4773 ?mobyC }
  OPTIONAL { ?item wdt:P2002 ?x }
}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${SPARQL}?query=${encodeURIComponent(q)}`, {
        headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()).results.bindings;
    } catch (err) {
      if (attempt === 3) throw err;
      await sleep(2000 * attempt);
    }
  }
}

const isHttp = u => /^https?:\/\//i.test(u);

async function main() {
  let ids = Object.keys(links).filter(id => links[id].wp && (!ONLY || typeOf[id] === ONLY));
  if (LIMIT) ids = ids.slice(0, LIMIT);
  console.log(`enriching ${ids.length} entities with a verified Wikipedia article\n`);

  const byArticle = new Map();
  for (const id of ids) byArticle.set(norm(links[id].wp), id);

  const found = {};
  const batches = chunk([...byArticle.keys()], BATCH);
  for (const [i, batch] of batches.entries()) {
    const rows = await query(batch);
    for (const r of rows) {
      const id = byArticle.get(norm(r.article.value));
      if (!id) continue;
      const t = typeOf[id];
      const o = (found[id] ||= {});
      /* First claim wins per property; SPARQL returns one row per combination. */
      if (r.site && !o.site && isHttp(r.site.value)) o.site = r.site.value;
      if (t === 'T') {
        /* App 480 is Valve's own "Spacewar" test app, which Wikidata attaches to the 1962 game. */
        if (r.steam && !o.steam && r.steam.value !== '480') o.steam = `https://store.steampowered.com/app/${r.steam.value}/`;
        if (r.gog && !o.gog) o.gog = `https://www.gog.com/${r.gog.value}`;   // P2725 values already carry the game/ prefix
        if (r.igdb && !o.igdb) o.igdb = `https://www.igdb.com/games/${r.igdb.value}`;
        if (r.mobyG && !o.moby) o.moby = `https://www.mobygames.com/game/${r.mobyG.value}/`;
      }
      if (t === 'C') {
        if (r.mobyC && !o.moby) o.moby = `https://www.mobygames.com/company/${r.mobyC.value}/`;
        if (r.x && !o.x) o.x = `https://x.com/${r.x.value}`;
      }
    }
    process.stdout.write(`\r  ${i + 1}/${batches.length} batches`);
    await sleep(PAUSE);
  }
  console.log('\n');

  const KEYS = ['site', 'steam', 'gog', 'igdb', 'moby', 'x'];
  for (const id of ids) {
    const cur = links[id];
    KEYS.forEach(k => delete cur[k]);           // re-derive every run
    Object.assign(cur, found[id] || {});
  }
  fs.writeFileSync(linksPath, JSON.stringify(links, null, 0) + '\n');

  const count = (t, k) => ids.filter(id => typeOf[id] === t && links[id][k]).length;
  const tot = t => ids.filter(id => typeOf[id] === t).length;
  console.log(`games    ${tot('T')}: site ${count('T', 'site')} · steam ${count('T', 'steam')} · gog ${count('T', 'gog')} · igdb ${count('T', 'igdb')} · mobygames ${count('T', 'moby')}`);
  console.log(`studios  ${tot('C')}: site ${count('C', 'site')} · mobygames ${count('C', 'moby')} · x ${count('C', 'x')}`);
  console.log(`mechanics ${tot('F')}: site ${count('F', 'site')}`);
  console.log('\ndata/links.json written');
}

main().catch(e => { console.error('\n' + e.stack); process.exit(1); });
