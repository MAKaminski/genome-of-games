// Shared data layer: loads JSON, builds slugs, indexes and the link graph.
const fs = require('fs');
const path = require('path');
const D = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'));

const G = D('graph.json');
const PROSE = D('prose.json');
const COPY = D('copy.json');
const FEAT = D('features.json');
const CO = D('companies.json');

/* Verified outbound links, produced by scripts/verify-links.js and committed.
   { id: { wp: url } } verified · { id: { wp: null } } checked, no article exists.
   Absent id = never checked, so the page falls back to a search URL. */
let LINKS = {};
try { LINKS = D('links.json'); } catch { /* not generated yet — searches everywhere */ }

const N = Object.fromEntries(G.nodes.map(n => [n.id, n]));
const coById = Object.fromEntries(CO.map(c => [c.id, c]));

/* ---------- slugs ---------- */
const slugify = s => String(s).toLowerCase()
  .replace(/['’]/g, '')
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 70) || 'x';

const slug = {}, bySlug = {};
const taken = { F: new Set(), T: new Set(), C: new Set() };
for (const n of G.nodes.slice().sort((a, b) => (a.y || 0) - (b.y || 0) || a.id.localeCompare(b.id))) {
  let s = slugify(n.n);
  if (taken[n.t].has(s)) s = n.y ? `${s}-${n.y}` : `${s}-2`;
  let i = 2; const base = s;
  while (taken[n.t].has(s)) s = `${base}-${i++}`;
  taken[n.t].add(s);
  slug[n.id] = s;
  bySlug[n.t + ':' + s] = n.id;
}

const DIR = { F: 'feature', T: 'game', C: 'studio' };
const url = id => `/${DIR[N[id].t]}/${slug[id]}/`;

/* ---------- adjacency ---------- */
const E = {};
for (const k of ['derives', 'introduces', 'adopts', 'sequel', 'descends', 'spinoff', 'rename', 'acquired', 'developed', 'published']) E[k] = [];
for (const e of G.edges) if (E[e.k]) E[e.k].push(e);

const push = (o, k, v) => ((o[k] ||= []).push(v), o);
const kidsOf = {}, adoptersOf = {}, introBy = {}, devTitles = {}, pubTitles = {};
E.derives.forEach(e => push(kidsOf, e.s, e.t));
E.adopts.forEach(e => push(adoptersOf, e.t, e.s));
E.introduces.forEach(e => push(introBy, e.t, e.s));
E.developed.forEach(e => push(devTitles, e.s, e.t));
E.published.forEach(e => push(pubTitles, e.s, e.t));

const seqPrev = {}, seqNext = {}, descFrom = {}, descTo = {};
E.sequel.forEach(e => { push(seqPrev, e.t, e.s); push(seqNext, e.s, e.t); });
E.descends.forEach(e => { push(descFrom, e.t, e.s); push(descTo, e.s, e.t); });

const spunFrom = {}, spawned = {}, renamedFrom = {}, renamedTo = {}, acquiredBy = {}, acquiredList = {};
E.spinoff.forEach(e => { spunFrom[e.t] = e.s; push(spawned, e.s, e.t); });
E.rename.forEach(e => { renamedFrom[e.t] = e.s; renamedTo[e.s] = e.t; });
E.acquired.forEach(e => { acquiredBy[e.s] = e; push(acquiredList, e.t, e); });

/* ---------- collections ---------- */
const features = G.nodes.filter(n => n.t === 'F').sort((a, b) => a.y - b.y || a.n.localeCompare(b.n));
const games = G.nodes.filter(n => n.t === 'T').sort((a, b) => a.y - b.y || a.n.localeCompare(b.n));
const studios = G.nodes.filter(n => n.t === 'C').sort((a, b) => a.n.localeCompare(b.n));

const FAM = FEAT.families;
const famSlug = Object.fromEntries(Object.keys(FAM).map(k => [k, slugify(FAM[k].name)]));
const famBySlug = Object.fromEntries(Object.entries(famSlug).map(([k, v]) => [v, k]));
const famOrder = G.famOrder;
const featuresByFam = {};
features.forEach(f => push(featuresByFam, f.fam, f.id));

const franchises = {};
games.forEach(g => { if (g.fr) push(franchises, g.fr, g.id); });
Object.values(franchises).forEach(l => l.sort((a, b) => N[a].y - N[b].y));

const DECADES = [1960, 1970, 1980, 1990, 2000, 2010, 2020];
const decadeOf = y => DECADES.reduce((a, d) => (y >= d ? d : a), 1960);
const gamesByDecade = {};
games.forEach(g => push(gamesByDecade, decadeOf(g.y), g.id));

const ERAS = Object.entries(COPY.eras).map(([range, v]) => {
  const [a, b] = range.split('-').map(Number);
  return { slug: slugify(v.name), range, a, b, name: v.name, essay: v.essay };
});
const eraOf = y => ERAS.find(e => y >= e.a && y < e.b) || ERAS[ERAS.length - 1];

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const letterOf = n => { const c = n.replace(/^(the|a) /i, '').trim()[0].toUpperCase(); return LETTERS.includes(c) ? c : '#'; };
const studiosByLetter = {};
studios.forEach(s => push(studiosByLetter, letterOf(s.n), s.id));

/* ---------- lineage helpers ---------- */
function ancestorChain(fid) {
  // longest single path back to a root, deepest-parent-first
  const path = [];
  let cur = fid, guard = 0;
  while (cur && guard++ < 40) {
    path.push(cur);
    const ps = N[cur].par || [];
    if (!ps.length) break;
    cur = ps.slice().sort((a, b) => (N[a].depth || 0) - (N[b].depth || 0)).pop();
  }
  return path.reverse();
}
function allAncestors(fid) { return G.featAnc[fid] || []; }
function allDescendants(fid) {
  const seen = new Set(), stack = [...(kidsOf[fid] || [])];
  while (stack.length) { const x = stack.pop(); if (seen.has(x)) continue; seen.add(x); (kidsOf[x] || []).forEach(k => stack.push(k)); }
  return [...seen];
}
// features whose origin game was made by this studio
const studioFeatures = {};
features.forEach(f => {
  const g = N[f.origin]; if (!g) return;
  if (g.dev) push(studioFeatures, g.dev, f.id);
});

/* ---------- text ---------- */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = esc;
const enc = encodeURIComponent;
const wiki = n => `https://en.wikipedia.org/w/index.php?search=${enc(n)}&title=Special%3ASearch&go=Go`;
const moby = n => `https://www.mobygames.com/search/?q=${enc(n)}`;
const giant = n => `https://www.giantbomb.com/search/?q=${enc(n)}`;

const SITE = process.env.SITE_URL || 'https://genome-of-games.vercel.app';

module.exports = {
  G, N, PROSE, COPY, FEAT, CO, coById, LINKS, FAM, famSlug, famBySlug, famOrder,
  slug, bySlug, url, DIR, slugify,
  E, kidsOf, adoptersOf, introBy, devTitles, pubTitles,
  seqPrev, seqNext, descFrom, descTo,
  spunFrom, spawned, renamedFrom, renamedTo, acquiredBy, acquiredList,
  features, games, studios, featuresByFam, franchises,
  DECADES, decadeOf, gamesByDecade, ERAS, eraOf, LETTERS, letterOf, studiosByLetter,
  ancestorChain, allAncestors, allDescendants, studioFeatures,
  esc, attr, enc, wiki, moby, giant, SITE
};
