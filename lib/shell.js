const T = require('./data');
const { esc, SITE } = T;

/* Counts come from the data, never from a literal — the dataset has already
   drifted from its own advertised totals once. */
const num = n => n.toLocaleString('en-US');
const COUNT = {
  get entries() { return num(T.G.nodes.length); },
  get mechanics() { return num(T.features.length); },
  get games() { return num(T.games.length); },
  get studios() { return num(T.studios.length); },
  get edges() { return num(T.G.edges.length); }
};

const NAV = [
  ['/features/', 'Mechanics'],
  ['/games/', 'Games'],
  ['/studios/', 'Studios'],
  ['/eras/', 'Eras'],
  ['/graph/', 'Graph'],
  ['/methodology/', 'Method'],
  ['/mcp/', 'MCP'],
  ['/newsletter/', 'Newsletter']
];

function head({ title, desc, canonical, og, jsonld, noindex, accent }) {
  const ogImg = SITE + (og || '/og/default.png');
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${canonical}">
${noindex ? '<meta name="robots" content="noindex,follow">' : ''}
<meta property="og:type" content="article">
<meta property="og:site_name" content="The Genome of Games">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${canonical}">
<meta property="og:image" content="${ogImg}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${ogImg}">
<meta name="theme-color" content="#0a0a0a">
<link rel="stylesheet" href="/styles.css">
${accent ? `<style>:root{--fam:${accent}}</style>` : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="sitemap" type="application/xml" href="/sitemap.xml">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
<script>window.__GOG=${JSON.stringify(T.PUBLIC).replace(/</g, '\\u003c')}</script>
${analytics()}
</head><body>`;
}

/* PostHog's official loader stub: it queues calls made before the library
   finishes downloading, so the pageview fires even on a fast bounce. Emitted
   only when POSTHOG_KEY is set, so local builds stay analytics-free. */
function analytics() {
  const { posthogKey, posthogHost } = T.PUBLIC;
  if (!posthogKey) return '';
  return `<script>!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init(${JSON.stringify(posthogKey)},{api_host:${JSON.stringify(posthogHost)},person_profiles:'identified_only',defaults:'2025-05-24'})</script>`;
}

function header(active) {
  return `<header class="site"><div class="hin">
<a class="logo" href="/"><b>The Genome of Games</b><span>Feature lineage · ${T.games[0].y}–${T.games[T.games.length-1].y}</span></a>
<nav class="main">${NAV.map(([h, l]) =>
    `<a href="${h}"${active === h ? ' class="on"' : ''}>${l}</a>`).join('')}</nav>
<div class="srch"><input id="sq" type="search" placeholder="Search ${COUNT.entries} entries…" autocomplete="off" aria-label="Search"><div id="sres"></div></div>
<a class="acct" id="gog-nav" href="/newsletter/">Sign in</a>
</div></header><main>`;
}

function crumbs(items) {
  return `<div class="crumbs">` + items.map((it, i) =>
    (i ? '<i>›</i>' : '') + (it[1] ? `<a href="${it[1]}">${esc(it[0])}</a>` : `<span>${esc(it[0])}</span>`)
  ).join('') + `</div>`;
}

function breadcrumbLd(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem', position: i + 1, name: it[0],
      ...(it[1] ? { item: SITE + it[1] } : {})
    }))
  };
}

function footer() {
  const fams = T.famOrder.map(f => `<a href="/features/${T.famSlug[f]}/">${esc(T.FAM[f].name)}</a>`).join('');
  const decs = T.DECADES.map(d => `<a href="/games/${d}s/">${d}s</a>`).join('');
  const eras = T.ERAS.map(e => `<a href="/era/${e.slug}/">${esc(e.name)}</a>`).join('');
  return `</main><footer class="site"><div class="fin">
<div><h4>Mechanic families</h4>${fams}</div>
<div><h4>Games by decade</h4>${decs}<a href="/games/">All ${COUNT.games} games</a></div>
<div><h4>Eras</h4>${eras}</div>
<div><h4>The project</h4>
  <a href="/">Home</a><a href="/graph/">Interactive graph</a><a href="/features/">All ${COUNT.mechanics} mechanics</a>
  <a href="/studios/">All ${COUNT.studios} studios</a><a href="/methodology/">Methodology &amp; limits</a>
  <a href="/newsletter/">Newsletter</a>
  <a href="/mcp/">MCP server for agents</a>
  <a href="${T.GITHUB}" rel="noopener">Source &amp; dataset on GitHub ↗</a>
  <a href="/llms.txt">llms.txt</a>
  <a href="/sitemap.xml">Sitemap</a></div>
</div><div class="fbot">
The Genome of Games is an independent research project tracing the descent of game mechanics from 1962 to the present.
${COUNT.mechanics} mechanics, ${COUNT.games} games, ${COUNT.studios} companies, ${COUNT.edges} recorded links. Attribution of "firsts" in games history is frequently
contested; see the <a href="/methodology/">methodology</a> for how origins are assigned and where the data is weakest.
Corrections are welcome.
</div></footer>
<script src="/app.js" defer></script>
<script src="/gog.js" defer></script>
</body></html>`;
}

function page(opts, body) {
  return head(opts) + header(opts.active) + body + footer();
}

/* ---------- shared components ---------- */
const famColor = f => T.FAM[f].color;
const KIND = { developer:'Developer', publisher:'Publisher', both:'Developer & publisher', platform:'Platform holder' };
const kindLabel = k => KIND[k] || k;

function featureChip(id) {
  const n = T.N[id];
  return `<a class="chip" href="${T.url(id)}"><i style="background:${famColor(n.fam)}"></i>${esc(n.n)} <s>${n.y}</s></a>`;
}
function gameChip(id) {
  const n = T.N[id];
  return `<a class="chip" href="${T.url(id)}">${esc(n.n)} <s>${n.y}</s></a>`;
}
function studioChip(id, extra) {
  const n = T.N[id];
  return `<a class="chip" href="${T.url(id)}">${esc(n.n)}${extra ? ` <s>${esc(extra)}</s>` : ''}</a>`;
}
function chipOf(id, extra) {
  const t = T.N[id].t;
  return t === 'F' ? featureChip(id) : t === 'T' ? gameChip(id) : studioChip(id, extra);
}

function featureCard(id) {
  const n = T.N[id], p = T.PROSE[id] || {};
  const o = T.N[n.origin];
  return `<a class="card" href="${T.url(id)}">
  <div class="k"><i style="background:${famColor(n.fam)}"></i>${esc(T.FAM[n.fam].name)} · ${n.y}</div>
  <div class="t">${esc(n.n)}</div>
  <div class="d">${esc((p.lede || n.d).slice(0, 118))}${(p.lede || n.d).length > 118 ? '…' : ''}</div>
  ${o ? `<div class="d" style="margin-top:6px;color:var(--dim2)">Origin: ${esc(o.n)}</div>` : ''}
</a>`;
}
function gameCard(id) {
  const n = T.N[id];
  const nIntro = (n.intro || []).length;
  return `<a class="card" href="${T.url(id)}">
  <div class="k">${n.y}${n.fr ? ' · ' + esc(n.fr) : ''}${nIntro ? ` · <span style="color:var(--gold)">${nIntro} first${nIntro > 1 ? 's' : ''}</span>` : ''}</div>
  <div class="t">${esc(n.n)}</div>
  <div class="d">${esc(n.d || '')}</div>
  <div class="d" style="margin-top:6px;color:var(--dim2)">${esc(n.devN || '')}</div>
</a>`;
}
function studioCard(id) {
  const n = T.N[id];
  return `<a class="card" href="${T.url(id)}">
  <div class="k">${n.y || '—'}${n.end ? '–' + n.end : ''} · ${esc(n.ctry || '')}</div>
  <div class="t">${esc(n.n)}</div>
  <div class="d">${esc(n.d || '')}</div>
  ${n.nt ? `<div class="d" style="margin-top:6px;color:var(--dim2)">${n.nt} title${n.nt === 1 ? '' : 's'} in the dataset</div>` : ''}
</a>`;
}
function cardOf(id) {
  const t = T.N[id].t;
  return t === 'F' ? featureCard(id) : t === 'T' ? gameCard(id) : studioCard(id);
}

function section(title, inner, id) {
  if (!inner) return '';
  return `<div class="sec"${id ? ` id="${id}"` : ''}><h2>${esc(title)}</h2>${inner}</div>`;
}
function chipList(ids, extra) {
  if (!ids || !ids.length) return '';
  return `<div class="chips">${ids.map(i => chipOf(i, extra && extra[i])).join('')}</div>`;
}
/* Outbound links, verified first. The official site, store pages and the
   reference databases are Wikidata claims resolved by scripts/enrich-links.js
   from each entity's verified Wikipedia article, so they are followed — a real
   citation, not a search. Wikipedia gets its verified permalink, and no link at
   all where the article was checked and does not exist: a search that lands
   nowhere is worse than an absent link. Unverified fallbacks stay site searches
   and stay nofollow. Every link carries data-out/data-entity so app.js can
   record which sources readers actually use. */
function externalLinks(id) {
  const n = T.N[id];
  const v = T.LINKS[id] || {};
  const out = [];
  const add = (label, href, kind, verified) => out.push({ label, href, kind, verified });
  if (v.site) add('Official site', v.site, 'site', true);
  if (v.steam) add('Steam', v.steam, 'steam', true);
  if (v.gog) add('GOG', v.gog, 'gog', true);
  if (v.wp) add('Wikipedia', v.wp, 'wikipedia', true);
  else if (!T.LINKS[id]) add('Wikipedia', T.wiki(n.n), 'wikipedia', false);
  if (n.t !== 'F') add('MobyGames', v.moby || T.moby(n.n), 'mobygames', !!v.moby);
  if (v.igdb) add('IGDB', v.igdb, 'igdb', true);
  if (v.x) add('X', v.x, 'x', true);
  add('Giant Bomb', T.giant(n.n), 'giantbomb', false);
  return out;
}
function externals(id) {
  return `<div class="ext">${externalLinks(id).map(l =>
    `<a href="${T.attr(l.href)}" rel="${l.verified ? 'noopener' : 'noopener nofollow'}" target="_blank" data-out="${l.kind}" data-entity="${id}"${l.verified ? '' : ' data-search="1"'}>${l.label} ↗</a>`).join('')}</div>`;
}
/* schema.org sameAs: the verified identities of this entity elsewhere. This is
   what lets a search engine or answer engine merge the page with the studio's
   or game's own presence rather than treating it as an unrelated mention. */
function sameAs(id) {
  return externalLinks(id).filter(l => l.verified && l.kind !== 'giantbomb').map(l => l.href);
}
/* The entity's own site as a meta-row entry: bare host, no scheme. */
function siteMeta(id) {
  const v = T.LINKS[id];
  if (!v || !v.site) return '';
  let host = v.site;
  try { host = new URL(v.site).host.replace(/^www\./, ''); } catch { /* keep the raw value */ }
  return `<span>Website <b><a href="${T.attr(v.site)}" rel="noopener" target="_blank" data-out="site" data-entity="${id}">${esc(host)} ↗</a></b></span>`;
}
/* The one ask on every entity page. Free sign-in is the conversion this site
   optimises for (see README, "Conversion and analytics"): it turns an anonymous
   reader into an addressable person. `data-cta` names the placement so PostHog
   can compare them. */
function followCta(placement, what) {
  return `<div class="follow" data-cta-box="${placement}">
  <div><b>Follow ${esc(what)}</b>
  <span>Free updates when a mechanic is added or an origin is corrected. One email a month at most; no spam, ever.</span></div>
  <a class="gog-btn" href="/newsletter/" data-cta="${placement}">Get updates</a>
</div>`;
}
function prevNext(prev, next, labels) {
  let h = '';
  if (prev) h += `<a href="${T.url(prev)}"><s>← ${esc(labels[0])}</s>${esc(T.N[prev].n)}</a>`;
  if (next) h += `<a href="${T.url(next)}" style="text-align:right"><s>${esc(labels[1])} →</s>${esc(T.N[next].n)}</a>`;
  return h ? `<div class="pn">${h}</div>` : '';
}

module.exports = {
  kindLabel,
  page, head, header, footer, crumbs, breadcrumbLd, section, chipList, chipOf,
  featureChip, gameChip, studioChip, featureCard, gameCard, studioCard, cardOf,
  externals, externalLinks, sameAs, siteMeta, followCta, prevNext, famColor, NAV
};
