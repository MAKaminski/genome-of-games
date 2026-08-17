#!/usr/bin/env node
/* The Genome of Games — zero-dependency static site build.
   node build.js  →  ./out                                     */
const fs = require('fs');
const path = require('path');
const T = require('./lib/data');
const S = require('./lib/shell');
const { N, esc, url, SITE } = T;

const OUT = path.join(__dirname, 'out');
const urls = [];
let pages = 0, links = 0;

function write(route, html, priority, changefreq) {
  const dir = route === '/' ? OUT : path.join(OUT, route);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  urls.push({ loc: route, priority: priority || 0.5, changefreq: changefreq || 'monthly' });
  pages++;
  links += (html.match(/href="\//g) || []).length;
}
function writeRaw(name, content) {
  fs.mkdirSync(path.dirname(path.join(OUT, name)), { recursive: true });
  fs.writeFileSync(path.join(OUT, name), content);
}

const num = n => n.toLocaleString('en-US');
const famOg = f => `/og/${T.famSlug[f]}.png`;

/* The genome strip — the site's signature graphic. One tick per mechanic, left
   to right by year of introduction, coloured by family, and as tall as that
   mechanic's downstream reach (later adopters plus descendants). It is drawn
   entirely from the dataset, so it changes when the data does and cannot be
   lifted from the stylesheet. sqrt keeps Numeric Score's 85 adopters from
   flattening everything else into a baseline. */
function genomeStrip() {
  const feats = T.features;
  const reach = f => (T.adoptersOf[f.id] || []).length + T.allDescendants(f.id).length;
  const max = Math.sqrt(Math.max(...feats.map(reach)) || 1);
  const y0 = feats[0].y, y1 = feats[feats.length - 1].y;
  const ticks = feats.map(f => {
    const h = 12 + Math.round((Math.sqrt(reach(f)) / max) * 88);
    return `<i style="height:${h}%;background:${S.famColor(f.fam)}" title="${esc(f.n)} · ${f.y} · ${reach(f)} downstream"></i>`;
  }).join('');
  return `<div class="genome" aria-hidden="true">${ticks}</div>
<div class="genome-key"><span>${y0}</span><span>${num(feats.length)} mechanics · bar height = downstream reach</span><span>${y1}</span></div>`;
}

/* ======================= MCP INDEX (generated data) =====================
   api/mcp.mjs serves the dataset over the Model Context Protocol. Rather than
   have the function re-derive slugs, adjacency and lineage — duplicating
   lib/data.js and risking drift — the build denormalises everything it needs
   into one file the function imports statically. Committed output, same as
   data/links.json. */
function mcpIndex() {
  const ref = id => (N[id] ? { id, name: N[id].n, year: N[id].y || null, url: url(id) } : null);
  const refs = ids => (ids || []).map(ref).filter(Boolean);
  const byYear = ids => (ids || []).slice().sort((a, b) => (N[a].y || 0) - (N[b].y || 0));
  const wiki = id => (T.LINKS[id] && T.LINKS[id].wp) || null;

  const entities = {};

  for (const f of T.features) {
    const p = T.PROSE[f.id] || {};
    entities[f.id] = {
      id: f.id, type: 'mechanic', name: f.n, year: f.y, url: url(f.id),
      family: { key: f.fam, name: T.FAM[f.fam].name, url: `/features/${T.famSlug[f.fam]}/` },
      summary: p.lede || f.d,
      prose: p.body || [f.d],
      alsoKnownAs: p.alsoKnownAs || [],
      origin: ref(f.origin),
      originDeveloper: N[f.origin] && N[f.origin].dev ? ref(N[f.origin].dev) : null,
      era: (() => { const e = T.eraOf(f.y); return { name: e.name, from: e.a, to: e.b, url: `/era/${e.slug}/` }; })(),
      parents: refs(f.par),
      children: refs(byYear(T.kidsOf[f.id])),
      descendants: refs(byYear(T.allDescendants(f.id))),
      adoptedBy: refs(byYear(T.adoptersOf[f.id])),
      lineage: refs(T.ancestorChain(f.id)),
      wikipedia: wiki(f.id)
    };
  }

  for (const g of T.games) {
    entities[g.id] = {
      id: g.id, type: 'game', name: g.n, year: g.y, url: url(g.id),
      summary: g.d || '',
      developer: g.dev ? ref(g.dev) : null,
      publisher: g.pub && g.pub !== g.dev ? ref(g.pub) : null,
      platform: g.pf || null, genre: g.g || null, franchise: g.fr || null,
      introduced: refs(byYear(g.intro)),
      adopted: refs(byYear(g.ad)),
      series: refs(g.fr ? T.franchises[g.fr] : []),
      wikipedia: wiki(g.id)
    };
  }

  for (const c of T.studios) {
    entities[c.id] = {
      id: c.id, type: 'studio', name: c.n, url: url(c.id),
      founded: c.y || null, closed: c.end || null, country: c.ctry || null,
      kind: S.kindLabel(c.kind), summary: c.d || '',
      developed: refs(byYear(T.devTitles[c.id])),
      published: refs(byYear(T.pubTitles[c.id])),
      mechanicsCredited: refs(byYear(T.studioFeatures[c.id])),
      foundersLeft: c.spun ? ref(c.spun) : null,
      partOf: c.own ? ref(c.own) : null,
      renamedFrom: T.renamedFrom[c.id] ? ref(T.renamedFrom[c.id]) : null,
      renamedTo: T.renamedTo[c.id] ? ref(T.renamedTo[c.id]) : null,
      spawned: refs(T.spawned[c.id]),
      acquired: (T.acquiredList[c.id] || []).map(e => ({ ...ref(e.s), acquiredYear: e.y || null })).filter(x => x.id),
      wikipedia: wiki(c.id)
    };
  }

  const index = {
    meta: {
      name: 'The Genome of Games',
      site: SITE,
      repository: T.GITHUB,
      license: 'CC BY 4.0',
      mechanics: T.features.length, games: T.games.length, studios: T.studios.length,
      links: T.G.edges.length,
      firstYear: T.games[0].y, lastYear: T.games[T.games.length - 1].y,
      verifiedWikipediaLinks: Object.values(T.LINKS).filter(v => v.wp).length
    },
    families: T.famOrder.map(k => ({
      key: k, name: T.FAM[k].name, blurb: T.FAM[k].blurb, color: T.FAM[k].color,
      url: `/features/${T.famSlug[k]}/`, mechanics: (T.featuresByFam[k] || []).length
    })),
    eras: T.ERAS.map(e => ({ name: e.name, from: e.a, to: e.b, url: `/era/${e.slug}/`, essay: e.essay })),
    entities
  };

  fs.writeFileSync(path.join(__dirname, 'data', 'mcp-index.json'), JSON.stringify(index));
  return Object.keys(entities).length;
}

/* ============================ FEATURE PAGES ============================ */
function featurePage(f) {
  const p = T.PROSE[f.id] || {};
  const fam = T.FAM[f.fam];
  const origin = N[f.origin];
  const chain = T.ancestorChain(f.id);
  const kids = (T.kidsOf[f.id] || []).sort((a, b) => N[a].y - N[b].y);
  const adopters = (T.adoptersOf[f.id] || []).sort((a, b) => N[a].y - N[b].y);
  const descAll = T.allDescendants(f.id);
  const siblings = (T.featuresByFam[f.fam] || []).filter(x => x !== f.id);
  const idx = (T.featuresByFam[f.fam] || []).indexOf(f.id);
  const famList = T.featuresByFam[f.fam] || [];
  const crumb = [['Home', '/'], ['Mechanics', '/features/'], [fam.name, `/features/${T.famSlug[f.fam]}/`], [f.n]];

  const ladder = `<div class="ladder">` + chain.map(cid => {
    const c = N[cid], co = N[c.origin];
    return `<div class="lrow${cid === f.id ? ' hi' : ''}">
      <div class="a"><a href="${url(cid)}" style="color:${S.famColor(c.fam)}">${esc(c.n)}</a></div>
      <div class="b">${c.y} · introduced in ${co ? `<a href="${url(c.origin)}">${esc(co.n)}</a>` : '—'}</div>
    </div>`;
  }).join('') + `</div>`;

  const eras = T.eraOf(f.y);
  const body = `
${S.crumbs(crumb)}
<div class="cols"><div>
  <div class="eyebrow" style="color:${fam.color}">${esc(fam.name)}</div>
  <h1>${esc(f.n)}</h1>
  <p class="lede">${esc(p.lede || f.d)}</p>
  <div class="meta">
    <span>Introduced <b>${f.y}</b></span>
    <span>Origin <b><a href="${url(f.origin)}">${esc(origin ? origin.n : '—')}</a></b></span>
    ${origin && origin.dev ? `<span>Developer <b><a href="${url(origin.dev)}">${esc(N[origin.dev].n)}</a></b></span>` : ''}
    ${kids.length ? `<span>Direct forks <b>${kids.length}</b></span>` : ''}
    ${descAll.length > kids.length ? `<span>All descendants <b>${descAll.length}</b></span>` : ''}
    ${adopters.length ? `<span>Later adopters <b>${adopters.length}</b></span>` : ''}
  </div>
  <div class="prose">${(p.body || [f.d]).map(x => `<p>${esc(x)}</p>`).join('')}</div>

  ${S.section('Lineage — traced back to a root', `
    <p style="color:var(--dim);font-size:14px;max-width:36em">Every mechanic in this dataset resolves to an ancestral
    chain. This one is ${chain.length} step${chain.length === 1 ? '' : 's'} deep, beginning with
    <a href="${url(chain[0])}">${esc(N[chain[0]].n)}</a> in ${N[chain[0]].y}.</p>${ladder}
    <p style="font-size:13.5px;color:var(--dim2)"><a href="/graph/?node=${f.id}&trace=1">Open this lineage in the interactive graph →</a></p>`, 'lineage')}

  ${f.par && f.par.length ? S.section('Descends directly from', S.chipList(f.par)) : ''}
  ${kids.length ? S.section('Forked into', S.chipList(kids) +
      (p.spread ? `<p class="prose" style="margin-top:14px;font-size:16px">${esc(p.spread)}</p>` : '')) : ''}
  ${adopters.length ? S.section(`Carried forward by ${adopters.length} later game${adopters.length === 1 ? '' : 's'}`,
      S.chipList(adopters)) : ''}
  ${descAll.length > kids.length ? S.section('Everything downstream',
      `<p style="color:var(--dim);font-size:14px;max-width:36em">${descAll.length} mechanics ultimately descend from this one.</p>` +
      S.chipList(descAll.sort((a, b) => N[a].y - N[b].y))) : ''}

  <div class="sec"><h2>Look this mechanic up elsewhere</h2>
    ${S.externals(f.id)}
    ${p.alsoKnownAs && p.alsoKnownAs.length ? `<p style="font-size:13px;color:var(--dim2);margin-top:10px">Also called: ${p.alsoKnownAs.map(esc).join(', ')}</p>` : ''}
    <h3>Cite this entry</h3>
    <div class="note" style="font-family:var(--serif);font-size:14px">
      &ldquo;${esc(f.n)}.&rdquo; <i>The Genome of Games</i>, an ontology of game mechanics.
      Origin: ${esc(origin ? origin.n : '')} (${f.y}).
      <span style="display:block;margin-top:8px;font-family:var(--sans);font-size:12.5px;color:var(--dim)">${SITE}${url(f.id)}</span>
    </div>
  </div>

  ${S.prevNext(famList[idx - 1], famList[idx + 1], [`Earlier in ${fam.name}`, `Later in ${fam.name}`])}
</div>
<aside class="side">
  <div class="note"><b style="color:${fam.color}">${esc(fam.name)}</b><br>${esc(fam.blurb)}
    <br><br><a href="/features/${T.famSlug[f.fam]}/">All ${famList.length} mechanics in this family →</a></div>
  ${origin ? `<h3>Origin title</h3>${S.gameCard(f.origin)}` : ''}
  <h3>Era</h3>
  <a class="card" href="/era/${eras.slug}/"><div class="k">${eras.a}–${eras.b}</div>
    <div class="t">${esc(eras.name)}</div><div class="d">${esc(eras.essay.slice(0, 110))}…</div></a>
  <h3>Elsewhere in ${esc(fam.name)}</h3>
  <div class="chips">${siblings.slice(0, 14).map(S.featureChip).join('')}</div>
</aside></div>`;

  const jsonld = {
    '@context': 'https://schema.org', '@graph': [
      S.breadcrumbLd(crumb),
      {
        '@type': 'DefinedTerm', '@id': SITE + url(f.id) + '#term',
        name: f.n, description: p.lede || f.d, url: SITE + url(f.id),
        inDefinedTermSet: { '@type': 'DefinedTermSet', name: 'The Genome of Games — mechanic ontology', url: SITE + '/features/' }
      },
      ...(p.question ? [{
        '@type': 'FAQPage', mainEntity: [{
          '@type': 'Question', name: p.question,
          acceptedAnswer: { '@type': 'Answer', text: `${f.n} is first recorded in ${origin ? origin.n : 'this dataset'} (${f.y}). ${p.lede || f.d}` }
        }]
      }] : [])
    ]
  };
  write(url(f.id), S.page({
    title: `${f.n} — origin, lineage and the ${adopters.length} games that used it`,
    desc: p.lede || f.d, canonical: url(f.id), og: famOg(f.fam), active: '/features/', accent: fam.color, jsonld
  }, body), 0.9);
}

/* ============================== GAME PAGES ============================== */
function gamePage(g) {
  const intro = (g.intro || []).slice().sort((a, b) => N[a].y - N[b].y);
  const adopts = (g.ad || []).slice().sort((a, b) => N[a].y - N[b].y);
  const series = g.fr ? (T.franchises[g.fr] || []) : [];
  const si = series.indexOf(g.id);
  const from = T.descFrom[g.id] || [], to = T.descTo[g.id] || [];
  const dev = g.dev ? N[g.dev] : null, pub = g.pub && g.pub !== g.dev ? N[g.pub] : null;
  const stable = (T.devTitles[g.dev] || []).filter(x => x !== g.id).sort((a, b) => N[a].y - N[b].y);
  const era = T.eraOf(g.y), dec = T.decadeOf(g.y);
  const crumb = [['Home', '/'], ['Games', '/games/'], [`${dec}s`, `/games/${dec}s/`], [g.n]];

  const desc = intro.length
    ? `${g.n} (${g.y}, ${g.devN}) introduced ${intro.length} mechanic${intro.length > 1 ? 's' : ''} to the medium, including ${N[intro[0]].n}. ${g.d}`
    : `${g.n} (${g.y}, ${g.devN}) — ${g.d} Built on ${adopts.length} mechanic${adopts.length === 1 ? '' : 's'} traced back to their origins.`;

  const seriesTl = series.length > 1 ? `<div class="tl">` + series.map(id =>
    `<div class="yr"><b>${N[id].y}</b><div>${id === g.id
      ? `<span class="chip" style="border-color:var(--line2);color:#fff">${esc(N[id].n)} <s>this page</s></span>`
      : S.gameChip(id)}</div></div>`).join('') + `</div>` : '';

  const body = `
${S.crumbs(crumb)}
<div class="cols"><div>
  <div class="eyebrow" style="color:${intro.length ? 'var(--gold)' : 'var(--dim2)'}">
    ${intro.length ? `Introduced ${intro.length} mechanic${intro.length > 1 ? 's' : ''}` : 'Game'}${g.fr ? ` · ${esc(g.fr)}${g.en ? ' ' + esc(g.en) : ''}` : ''}</div>
  <h1>${esc(g.n)}</h1>
  <p class="lede">${esc(g.d)}</p>
  <div class="meta">
    <span>Released <b>${g.y}</b></span>
    ${dev ? `<span>Developer <b><a href="${url(g.dev)}">${esc(dev.n)}</a></b></span>` : `<span>Developer <b>${esc(g.devN)}</b></span>`}
    ${pub ? `<span>Publisher <b><a href="${url(g.pub)}">${esc(pub.n)}</a></b></span>` : ''}
    ${g.pf ? `<span>Platform <b>${esc(g.pf)}</b></span>` : ''}
    ${g.g ? `<span>Genre <b>${esc(g.g)}</b></span>` : ''}
    <span>Era <b><a href="/era/${era.slug}/">${esc(era.name)}</a></b></span>
  </div>

  ${intro.length ? S.section('Mechanics this game introduced', `
    <p style="color:var(--dim);font-size:14px;max-width:36em">These are recorded as first appearing here. Each links to
    a full history of where the idea went next.</p>
    <div class="grid">${intro.map(S.featureCard).join('')}</div>`, 'introduced') : ''}

  ${adopts.length ? S.section('Mechanics it built on', `
    <p style="color:var(--dim);font-size:14px;max-width:36em">Ideas ${esc(g.n)} inherited rather than invented — each
    traceable back through the ontology to a root.</p>${S.chipList(adopts)}`, 'built-on') : ''}

  ${from.length ? S.section('Descends from', S.chipList(from)) : ''}
  ${to.length ? S.section('Directly influenced', S.chipList(to)) : ''}
  ${seriesTl ? S.section(`The ${g.fr} series in this dataset`, seriesTl, 'series') : ''}

  <div class="sec"><h2>Look this game up elsewhere</h2>${S.externals(g.id)}</div>

  ${S.prevNext(series[si - 1], series[si + 1], ['Previous in series', 'Next in series'])}
</div>
<aside class="side">
  ${dev ? `<h3>Developer</h3>${S.studioCard(g.dev)}` : ''}
  ${pub ? `<h3>Publisher</h3>${S.studioCard(g.pub)}` : ''}
  ${stable.length ? `<h3>More from ${esc(dev.n)}</h3><div class="chips">${stable.slice(0, 12).map(S.gameChip).join('')}</div>` : ''}
  <h3>Explore</h3>
  <div class="chips">
    <a class="chip" href="/games/${dec}s/">All ${dec}s games</a>
    <a class="chip" href="/era/${era.slug}/">${esc(era.name)}</a>
    <a class="chip" href="/graph/?node=${g.id}">See it in the graph</a>
  </div>
</aside></div>`;

  const jsonld = {
    '@context': 'https://schema.org', '@graph': [
      S.breadcrumbLd(crumb),
      {
        '@type': 'VideoGame', name: g.n, url: SITE + url(g.id),
        datePublished: String(g.y), description: g.d,
        ...(g.g ? { genre: g.g } : {}), ...(g.pf ? { gamePlatform: g.pf } : {}),
        author: { '@type': 'Organization', name: g.devN, ...(dev ? { url: SITE + url(g.dev) } : {}) },
        ...(pub ? { publisher: { '@type': 'Organization', name: pub.n, url: SITE + url(g.pub) } } : {}),
        ...(g.fr ? { partOfSeries: { '@type': 'CreativeWorkSeries', name: g.fr } } : {})
      }
    ]
  };
  write(url(g.id), S.page({
    title: `${g.n} (${g.y}) — what it invented and what it inherited`,
    desc: desc.slice(0, 300), canonical: url(g.id), active: '/games/', jsonld
  }, body), intro.length ? 0.8 : 0.6);
}

/* ============================= STUDIO PAGES ============================= */
function studioPage(c) {
  const titles = (T.devTitles[c.id] || []).sort((a, b) => N[a].y - N[b].y);
  const published = (T.pubTitles[c.id] || []).sort((a, b) => N[a].y - N[b].y);
  const feats = (T.studioFeatures[c.id] || []).sort((a, b) => N[a].y - N[b].y);
  const spawn = T.spawned[c.id] || [], acq = T.acquiredList[c.id] || [];
  const crumb = [['Home', '/'], ['Studios', '/studios/'], [T.letterOf(c.n), `/studios/${T.letterOf(c.n).toLowerCase().replace('#', 'other')}/`], [c.n]];

  const lineageBits = [];
  if (c.ren) lineageBits.push(`Continues <a href="${url(c.ren)}">${esc(N[c.ren].n)}</a> under a new name`);
  if (c.spun) lineageBits.push(`Founded by people who left <a href="${url(c.spun)}">${esc(N[c.spun].n)}</a>`);
  if (c.own) lineageBits.push(`Part of <a href="${url(c.own)}">${esc(N[c.own].n)}</a>${c.ownY ? ` since ${c.ownY}` : ''}`);

  const desc = `${c.n}${c.y ? `, founded ${c.y}` : ''}${c.ctry ? ` in ${c.ctry}` : ''} — ${c.d} ${titles.length} title${titles.length === 1 ? '' : 's'} in the dataset${feats.length ? `, credited with ${feats.length} first${feats.length > 1 ? 's' : ''}` : ''}.`;

  const body = `
${S.crumbs(crumb)}
<div class="cols"><div>
  <div class="eyebrow" style="color:#34d399">${esc(S.kindLabel(c.kind))}${c.ctry ? ' · ' + esc(c.ctry) : ''}</div>
  <h1>${esc(c.n)}</h1>
  <p class="lede">${esc(c.d)}</p>
  <div class="meta">
    ${c.y ? `<span>Founded <b>${c.y}</b></span>` : ''}
    ${c.end ? `<span>Closed <b>${c.end}</b></span>` : ''}
    ${c.ctry ? `<span>Country <b>${esc(c.ctry)}</b></span>` : ''}
    ${titles.length ? `<span>Titles here <b>${titles.length}</b></span>` : ''}
    ${feats.length ? `<span>Mechanics credited <b>${feats.length}</b></span>` : ''}
  </div>

  ${lineageBits.length || spawn.length || acq.length ? S.section('Corporate lineage', `
    ${lineageBits.length ? `<ul style="color:var(--ink2);font-size:15px;line-height:1.9;padding-left:18px;margin:0 0 14px">${lineageBits.map(b => `<li>${b}</li>`).join('')}</ul>` : ''}
    ${T.renamedTo[c.id] ? `<p style="font-size:15px">Later became <a href="${url(T.renamedTo[c.id])}">${esc(N[T.renamedTo[c.id]].n)}</a>.</p>` : ''}
    ${spawn.length ? `<h3>Studios founded by former staff</h3>${S.chipList(spawn)}` : ''}
    ${acq.length ? `<h3>Teams and companies brought in-house</h3><div class="chips">${acq.map(e => S.studioChip(e.s, e.y ? String(e.y) : '')).join('')}</div>` : ''}
    <p style="font-size:13.5px;color:var(--dim2);margin-top:12px"><a href="/graph/?node=${c.id}&lens=3">See this lineage in the interactive graph →</a></p>`) : ''}

  ${feats.length ? S.section(`Mechanics first shipped by ${c.n}`, `
    <p style="color:var(--dim);font-size:14px;max-width:36em">Ideas this studio is credited with introducing to the
    medium, each with a full downstream history.</p>
    <div class="grid">${feats.map(S.featureCard).join('')}</div>`, 'firsts') : ''}

  ${titles.length ? S.section(`Games developed (${titles.length})`, `<div class="tl">` +
      titles.map(id => `<div class="yr"><b>${N[id].y}</b><div>${S.gameChip(id)}${(N[id].intro || []).length ? ` <span class="tag" style="color:var(--gold)">${N[id].intro.length} first${N[id].intro.length > 1 ? 's' : ''}</span>` : ''}</div></div>`).join('') +
      `</div>`, 'games') : ''}

  ${published.length ? S.section(`Games published (${published.length})`, S.chipList(published)) : ''}

  <div class="sec"><h2>Look this company up elsewhere</h2>${S.externals(c.id)}</div>
</div>
<aside class="side">
  <h3>Explore</h3>
  <div class="chips">
    <a class="chip" href="/studios/">All 394 studios</a>
    <a class="chip" href="/studios/${T.letterOf(c.n).toLowerCase().replace('#', 'other')}/">Studios: ${esc(T.letterOf(c.n))}</a>
    <a class="chip" href="/graph/?node=${c.id}&lens=3">Lineage graph</a>
  </div>
  ${c.own ? `<h3>Part of</h3>${S.studioCard(c.own)}` : ''}
  ${c.spun ? `<h3>Founders came from</h3>${S.studioCard(c.spun)}` : ''}
</aside></div>`;

  const jsonld = {
    '@context': 'https://schema.org', '@graph': [
      S.breadcrumbLd(crumb),
      {
        '@type': 'Organization', name: c.n, url: SITE + url(c.id), description: c.d,
        ...(c.y ? { foundingDate: String(c.y) } : {}),
        ...(c.ctry ? { location: { '@type': 'Place', name: c.ctry } } : {}),
        ...(c.own ? { parentOrganization: { '@type': 'Organization', name: N[c.own].n, url: SITE + url(c.own) } } : {})
      }
    ]
  };
  write(url(c.id), S.page({
    title: `${c.n} — studio lineage, games and the mechanics they shipped first`,
    desc: desc.slice(0, 300), canonical: url(c.id), active: '/studios/', jsonld
  }, body), feats.length ? 0.7 : 0.5);
}

/* ============================== INDEX PAGES ============================= */
function featuresIndex() {
  const crumb = [['Home', '/'], ['Mechanics']];
  const body = `${S.crumbs(crumb)}
<h1>All 168 mechanics</h1>
<p class="lede">Every mechanic in the ontology, grouped into 15 families. Each has one credited origin game and a
traceable chain of ancestors reaching back to 1962.</p>
<div class="chips" style="margin:22px 0 34px">${T.famOrder.map(f =>
    `<a class="chip" href="/features/${T.famSlug[f]}/"><i style="background:${T.FAM[f].color}"></i>${esc(T.FAM[f].name)} <s>${(T.featuresByFam[f] || []).length}</s></a>`).join('')}</div>
${T.famOrder.map(f => `
<div class="sec" id="${T.famSlug[f]}">
  <h2 style="color:${T.FAM[f].color}"><a href="/features/${T.famSlug[f]}/" style="color:inherit">${esc(T.FAM[f].name)}</a></h2>
  <p style="color:var(--dim);max-width:38em;margin-top:-6px">${esc((T.COPY.families[f] || {}).blurb || T.FAM[f].blurb)}</p>
  <div class="grid">${(T.featuresByFam[f] || []).sort((a, b) => N[a].y - N[b].y).map(S.featureCard).join('')}</div>
</div>`).join('')}`;
  write('/features/', S.page({
    title: 'All 168 game mechanics, by family — The Genome of Games',
    desc: 'A complete index of 168 video game mechanics organised into 15 families, each with a credited origin game, ancestry and downstream descendants.',
    canonical: '/features/', active: '/features/',
    jsonld: { '@context': 'https://schema.org', '@graph': [S.breadcrumbLd(crumb)] }
  }, body), 0.9, 'weekly');
}

function familyPage(fam) {
  const c = T.COPY.families[fam] || {}, meta = T.FAM[fam];
  const list = (T.featuresByFam[fam] || []).sort((a, b) => N[a].y - N[b].y);
  const crumb = [['Home', '/'], ['Mechanics', '/features/'], [meta.name]];
  const i = T.famOrder.indexOf(fam);
  const roots = list.filter(id => !(N[id].par || []).length);
  const crossParents = [...new Set(list.flatMap(id => (N[id].par || [])).filter(p => N[p].fam !== fam))];
  const crossKids = [...new Set(list.flatMap(id => T.kidsOf[id] || []).filter(k => N[k].fam !== fam))];

  const body = `${S.crumbs(crumb)}
<div class="eyebrow" style="color:${meta.color}">Mechanic family</div>
<h1>${esc(meta.name)}</h1>
<p class="lede">${esc(c.blurb || meta.blurb)}</p>
<div class="meta">
  <span>Mechanics <b>${list.length}</b></span>
  <span>Earliest <b>${N[list[0]].y}</b></span>
  <span>Latest <b>${N[list[list.length - 1]].y}</b></span>
  ${roots.length ? `<span>Roots in this family <b>${roots.length}</b></span>` : ''}
</div>
<div class="prose">${(c.essay || '').split(/\n\n+/).map(x => `<p>${esc(x)}</p>`).join('')}</div>

${S.section('The family, in order of arrival', `<div class="tl">` + list.map(id =>
    `<div class="yr"><b>${N[id].y}</b><div>${S.featureChip(id)}<span style="color:var(--dim2);font-size:12.5px">${esc(N[N[id].origin] ? N[N[id].origin].n : '')}</span></div></div>`).join('') + `</div>`)}

${S.section('Every mechanic in this family', `<div class="grid">${list.map(S.featureCard).join('')}</div>`)}
${crossParents.length ? S.section('Inherited from other families', `
  <p style="color:var(--dim);font-size:14px;max-width:36em">Mechanics outside this family that parent something inside it — where the cross-pollination happens.</p>
  ${S.chipList(crossParents.sort((a, b) => N[a].y - N[b].y))}`) : ''}
${crossKids.length ? S.section('Exported to other families', S.chipList(crossKids.sort((a, b) => N[a].y - N[b].y))) : ''}
${S.prevNext(null, null, [])}
<div class="pn">
  ${i > 0 ? `<a href="/features/${T.famSlug[T.famOrder[i - 1]]}/"><s>← Previous family</s>${esc(T.FAM[T.famOrder[i - 1]].name)}</a>` : ''}
  ${i < T.famOrder.length - 1 ? `<a href="/features/${T.famSlug[T.famOrder[i + 1]]}/" style="text-align:right"><s>Next family →</s>${esc(T.FAM[T.famOrder[i + 1]].name)}</a>` : ''}
</div>`;
  write(`/features/${T.famSlug[fam]}/`, S.page({
    title: `${meta.name} — ${list.length} game mechanics and where each came from`,
    desc: (c.blurb || meta.blurb).slice(0, 300), canonical: `/features/${T.famSlug[fam]}/`, accent: c.color,
    og: famOg(fam), active: '/features/',
    jsonld: { '@context': 'https://schema.org', '@graph': [S.breadcrumbLd(crumb)] }
  }, body), 0.9, 'weekly');
}

function gamesIndex() {
  const crumb = [['Home', '/'], ['Games']];
  const innovators = T.games.filter(g => (g.intro || []).length).sort((a, b) => b.intro.length - a.intro.length || a.y - b.y);
  const body = `${S.crumbs(crumb)}
<h1>All ${num(T.games.length)} games</h1>
<p class="lede">Every title in the dataset, from Spacewar! to the present. Games marked with a first are credited with
introducing at least one mechanic to the medium.</p>
<div class="chips" style="margin:22px 0 30px">${T.DECADES.map(d =>
    `<a class="chip" href="/games/${d}s/">${d}s <s>${(T.gamesByDecade[d] || []).length}</s></a>`).join('')}</div>
${S.section('The 40 most inventive titles in the dataset', `
  <p style="color:var(--dim);font-size:14px;max-width:38em">Ranked by how many mechanics are first recorded in them.
  This is a measure of what the data credits, not a ranking of quality.</p>
  <table><thead><tr><th>Game</th><th>Year</th><th>Developer</th><th>Firsts</th></tr></thead><tbody>
  ${innovators.slice(0, 40).map(g => `<tr>
    <td><a href="${url(g.id)}">${esc(g.n)}</a></td><td class="n">${g.y}</td>
    <td>${g.dev ? `<a href="${url(g.dev)}">${esc(g.devN)}</a>` : esc(g.devN)}</td>
    <td class="n" style="color:var(--gold)">${g.intro.length}</td></tr>`).join('')}
  </tbody></table>`)}
${T.DECADES.map(d => `
<div class="sec" id="${d}s">
  <h2><a href="/games/${d}s/" style="color:inherit">${d}s</a> <span style="color:var(--dim2);font-weight:400;font-size:17px">${(T.gamesByDecade[d] || []).length} games</span></h2>
  <div class="chips">${(T.gamesByDecade[d] || []).map(S.gameChip).join('')}</div>
</div>`).join('')}`;
  write('/games/', S.page({
    title: `All ${num(T.games.length)} games in the mechanic ontology — The Genome of Games`,
    desc: `A complete index of ${num(T.games.length)} video games from 1962 to 2026, showing which mechanics each one introduced and which it inherited.`,
    canonical: '/games/', active: '/games/',
    jsonld: { '@context': 'https://schema.org', '@graph': [S.breadcrumbLd(crumb)] }
  }, body), 0.9, 'weekly');
}

function decadePage(d) {
  const list = (T.gamesByDecade[d] || []).slice().sort((a, b) => N[a].y - N[b].y);
  const withFirsts = list.filter(id => (N[id].intro || []).length);
  const feats = T.features.filter(f => f.y >= d && f.y < d + 10);
  const crumb = [['Home', '/'], ['Games', '/games/'], [`${d}s`]];
  const i = T.DECADES.indexOf(d);
  const body = `${S.crumbs(crumb)}
<h1>Games of the ${d}s</h1>
<p class="lede">${list.length} titles from this decade, of which ${withFirsts.length} are credited with introducing at
least one mechanic. ${feats.length} mechanics in the ontology originate here.</p>
${feats.length ? S.section(`Mechanics introduced in the ${d}s`, S.chipList(feats.map(f => f.id))) : ''}
${S.section(`All ${list.length} titles`, `<div class="tl">` +
    [...new Set(list.map(id => N[id].y))].sort().map(y =>
      `<div class="yr"><b>${y}</b><div>${list.filter(id => N[id].y === y).map(S.gameChip).join('')}</div></div>`).join('') + `</div>`)}
<div class="pn">
  ${i > 0 ? `<a href="/games/${T.DECADES[i - 1]}s/"><s>← Previous decade</s>${T.DECADES[i - 1]}s</a>` : ''}
  ${i < T.DECADES.length - 1 ? `<a href="/games/${T.DECADES[i + 1]}s/" style="text-align:right"><s>Next decade →</s>${T.DECADES[i + 1]}s</a>` : ''}
</div>`;
  write(`/games/${d}s/`, S.page({
    title: `Video games of the ${d}s — ${list.length} titles and the mechanics they introduced`,
    desc: `${list.length} games released in the ${d}s, ${withFirsts.length} of them credited with introducing a mechanic. ${feats.length} mechanics in the ontology originate in this decade.`,
    canonical: `/games/${d}s/`, active: '/games/',
    jsonld: { '@context': 'https://schema.org', '@graph': [S.breadcrumbLd(crumb)] }
  }, body), 0.7);
}

function studiosIndex() {
  const crumb = [['Home', '/'], ['Studios']];
  const byFirsts = T.studios.filter(c => (T.studioFeatures[c.id] || []).length)
    .sort((a, b) => (T.studioFeatures[b.id] || []).length - (T.studioFeatures[a.id] || []).length);
  const withLineage = T.studios.filter(c => c.spun || c.own || c.ren || (T.spawned[c.id] || []).length);
  const letters = ['#', ...T.LETTERS];
  const body = `${S.crumbs(crumb)}
<h1>All 394 studios and publishers</h1>
<p class="lede">Every company in the dataset, with founding years, acquisitions, renames and the spinoffs that carried
ideas from one studio to the next. ${withLineage.length} have a recorded lineage link.</p>
<div class="az">${letters.filter(l => (T.studiosByLetter[l] || []).length).map(l =>
    `<a href="/studios/${l.toLowerCase().replace('#', 'other')}/">${l}</a>`).join('')}</div>
${S.section('Studios credited with the most firsts', `
  <table><thead><tr><th>Studio</th><th>Founded</th><th>Country</th><th>Mechanics</th><th>Titles</th></tr></thead><tbody>
  ${byFirsts.slice(0, 30).map(c => `<tr>
    <td><a href="${url(c.id)}">${esc(c.n)}</a></td><td class="n">${c.y || '—'}</td>
    <td>${esc(c.ctry || '')}</td><td class="n" style="color:var(--gold)">${(T.studioFeatures[c.id] || []).length}</td>
    <td class="n">${c.nt}</td></tr>`).join('')}
  </tbody></table>`)}
${letters.filter(l => (T.studiosByLetter[l] || []).length).map(l => `
<div class="sec" id="l-${l.toLowerCase().replace('#', 'other')}">
  <h2><a href="/studios/${l.toLowerCase().replace('#', 'other')}/" style="color:inherit">${l}</a></h2>
  <div class="chips">${(T.studiosByLetter[l] || []).map(id => S.studioChip(id, N[id].y ? String(N[id].y) : '')).join('')}</div>
</div>`).join('')}`;
  write('/studios/', S.page({
    title: 'All 394 game studios and publishers — lineage, spinoffs and acquisitions',
    desc: 'A complete index of 394 game developers and publishers with founding years, acquisitions, renames and the staff spinoffs that carried mechanics between studios.',
    canonical: '/studios/', active: '/studios/',
    jsonld: { '@context': 'https://schema.org', '@graph': [S.breadcrumbLd(crumb)] }
  }, body), 0.9, 'weekly');
}

function letterPage(l) {
  const list = (T.studiosByLetter[l] || []).sort((a, b) => N[a].n.localeCompare(N[b].n));
  const key = l.toLowerCase().replace('#', 'other');
  const crumb = [['Home', '/'], ['Studios', '/studios/'], [l]];
  const body = `${S.crumbs(crumb)}
<h1>Studios beginning with ${esc(l)}</h1>
<p class="lede">${list.length} compan${list.length === 1 ? 'y' : 'ies'} in the dataset.</p>
<div class="az">${['#', ...T.LETTERS].filter(x => (T.studiosByLetter[x] || []).length).map(x =>
    `<a href="/studios/${x.toLowerCase().replace('#', 'other')}/"${x === l ? ' class="on"' : ''}>${x}</a>`).join('')}</div>
<div class="grid">${list.map(S.studioCard).join('')}</div>`;
  write(`/studios/${key}/`, S.page({
    title: `Game studios beginning with ${l} — ${list.length} companies`,
    desc: `${list.length} game developers and publishers whose names begin with ${l}, with founding years, lineage and full title lists.`,
    canonical: `/studios/${key}/`, active: '/studios/',
    jsonld: { '@context': 'https://schema.org', '@graph': [S.breadcrumbLd(crumb)] }
  }, body), 0.5);
}

function erasIndex() {
  const crumb = [['Home', '/'], ['Eras']];
  const body = `${S.crumbs(crumb)}
<h1>Seven eras</h1>
<p class="lede">The dataset is cut into seven periods. Each one added a distinct layer to the ontology, and each is a
useful lens on what the medium was solving for at the time.</p>
<div class="grid">${T.ERAS.map(e => {
    const fc = T.features.filter(f => f.y >= e.a && f.y < e.b).length;
    const gc = T.games.filter(g => g.y >= e.a && g.y < e.b).length;
    return `<a class="card" href="/era/${e.slug}/"><div class="k">${e.a}–${e.b}</div>
    <div class="t">${esc(e.name)}</div><div class="d">${esc(e.essay.slice(0, 150))}…</div>
    <div class="d" style="margin-top:7px;color:var(--dim2)">${fc} mechanics · ${gc} games</div></a>`;
  }).join('')}</div>`;
  write('/eras/', S.page({
    title: 'Seven eras of game mechanic evolution, 1958–2026',
    desc: 'The history of game mechanics cut into seven periods, from laboratory and coin-op through the 3D rupture to live service.',
    canonical: '/eras/', active: '/eras/',
    jsonld: { '@context': 'https://schema.org', '@graph': [S.breadcrumbLd(crumb)] }
  }, body), 0.8);
}

function eraPage(e, i) {
  const feats = T.features.filter(f => f.y >= e.a && f.y < e.b);
  const gms = T.games.filter(g => g.y >= e.a && g.y < e.b);
  const studios = T.studios.filter(c => c.y && c.y >= e.a && c.y < e.b);
  const crumb = [['Home', '/'], ['Eras', '/eras/'], [e.name]];
  const body = `${S.crumbs(crumb)}
<div class="eyebrow" style="color:var(--accent)">${e.a}–${e.b}</div>
<h1>${esc(e.name)}</h1>
<div class="meta">
  <span>Mechanics originating here <b>${feats.length}</b></span>
  <span>Games <b>${gms.length}</b></span>
  <span>Studios founded <b>${studios.length}</b></span>
</div>
<div class="prose">${e.essay.split(/\n\n+/).map(x => `<p>${esc(x)}</p>`).join('')}</div>
${feats.length ? S.section('Mechanics introduced in this era', `<div class="grid">${feats.map(f => S.featureCard(f.id)).join('')}</div>`) : ''}
${gms.length ? S.section(`Games of the period (${gms.length})`, S.chipList(gms.map(g => g.id))) : ''}
${studios.length ? S.section(`Studios founded (${studios.length})`, S.chipList(studios.map(c => c.id))) : ''}
<div class="pn">
  ${i > 0 ? `<a href="/era/${T.ERAS[i - 1].slug}/"><s>← Previous era</s>${esc(T.ERAS[i - 1].name)}</a>` : ''}
  ${i < T.ERAS.length - 1 ? `<a href="/era/${T.ERAS[i + 1].slug}/" style="text-align:right"><s>Next era →</s>${esc(T.ERAS[i + 1].name)}</a>` : ''}
</div>`;
  write(`/era/${e.slug}/`, S.page({
    title: `${e.name} (${e.a}–${e.b}) — ${feats.length} mechanics born in this era`,
    desc: e.essay.slice(0, 290), canonical: `/era/${e.slug}/`, active: '/eras/',
    jsonld: { '@context': 'https://schema.org', '@graph': [S.breadcrumbLd(crumb)] }
  }, body), 0.8);
}

/* ============================== NEWSLETTER ============================== */
function newsletterPage() {
  const crumb = [['Home', '/'], ['Newsletter']];
  const body = `${S.crumbs(crumb)}
<div class="cols"><div>
  <div class="eyebrow" style="color:var(--gold)">Stay with the project</div>
  <h1>Updates and the monthly newsletter</h1>
  <p class="lede">This dataset changes. Mechanics get added, origins get contested and corrected, and the
  lineage shifts when they do. Two ways to follow that — one free, one paid.</p>

  <div class="sec"><h2>Sign in</h2>
    <div id="gog-panel" class="gog-panel">
      <p class="gog-note">Loading…</p>
    </div>
  </div>

  ${S.section('What each one gets you', `<table><thead><tr><th>&nbsp;</th><th>Free updates</th><th>Newsletter · $10/mo</th></tr></thead><tbody>
<tr><td>New mechanics added to the ontology</td><td>✓</td><td>✓</td></tr>
<tr><td>Corrections to contested origins</td><td>✓</td><td>✓</td></tr>
<tr><td>A monthly essay on what the graph shows</td><td>—</td><td>✓</td></tr>
<tr><td>The reasoning behind each disputed attribution</td><td>—</td><td>✓</td></tr>
<tr><td>Early access to dataset revisions</td><td>—</td><td>✓</td></tr>
<tr><td>The full dataset, free forever, CC BY 4.0</td><td>✓</td><td>✓</td></tr>
</tbody></table>`)}

  ${S.section('What the paid tier is not', `<div class="note">It is not a paywall. Every one of the
  ${num(T.G.nodes.length)} pages here stays free and open, the dataset stays CC BY 4.0, and
  <a href="${T.GITHUB}" rel="noopener">the whole repository</a> stays public. Paying supports the
  research and gets you the monthly write-up — the argument, not the access.</div>`)}

  ${S.section('Privacy', `<div class="note">Google sign-in gives this site your email address and nothing
  else. Payments are handled entirely by Stripe; no card details touch this server. Cancel any time from
  the billing portal on this page — no email required.</div>`)}
</div>
<aside class="side">
  <h3>The dataset is open</h3>
  <div class="note">${num(T.features.length)} mechanics, ${num(T.games.length)} games and
  ${num(T.studios.length)} companies as JSON, under CC BY 4.0.
  <br><br><a href="${T.GITHUB}" rel="noopener">Read or fork it on GitHub →</a></div>
  <h3>Start here instead</h3>
  <div class="chips">
    <a class="chip" href="/methodology/">How origins are assigned</a>
    <a class="chip" href="/graph/">The interactive graph</a>
    <a class="chip" href="/features/">All ${num(T.features.length)} mechanics</a>
  </div>
</aside></div>`;

  write('/newsletter/', S.page({
    title: 'Newsletter and updates — The Genome of Games',
    desc: `Follow changes to an ontology of ${num(T.features.length)} game mechanics: free updates when mechanics are added or origins corrected, or a $10/month newsletter on what the lineage graph reveals.`,
    canonical: '/newsletter/', active: '/newsletter/',
    jsonld: { '@context': 'https://schema.org', '@graph': [S.breadcrumbLd(crumb)] }
  }, body), 0.8);
}

/* ================================= MCP ================================= */
function mcpPage() {
  const crumb = [['Home', '/'], ['MCP server']];
  const EP = `${SITE}/api/mcp/`;

  /* Snippets carry a copy button; the block itself is a plain <pre> so it
     still reads and selects normally with JavaScript off. */
  const snip = (label, lang, code) => `<div class="snip">
  <div class="snip-h"><span>${esc(label)}</span><button class="copy" type="button" data-copy>Copy</button></div>
  <pre><code>${esc(code)}</code></pre></div>`;

  const tools = [
    ['genome_get_overview', 'Counts, families, eras, what "origin" means and where the data is weak. Start here.'],
    ['genome_search', 'Find mechanics, games or studios by partial name.'],
    ['genome_get_mechanic', 'Full record: origin, essay, parents, children, everything downstream, adopters.'],
    ['genome_get_game', 'What a game introduced and what it inherited.'],
    ['genome_get_studio', 'Titles, credited firsts and corporate lineage.'],
    ['genome_trace_lineage', 'Walk a mechanic back to a root, or forward through its descendants.'],
    ['genome_list_family', 'Every mechanic in one of the fifteen families.'],
    ['genome_by_year', 'What was first shipped in a year or range.']
  ];

  const body = `${S.crumbs(crumb)}
<div class="hero" style="padding-bottom:var(--space-lg)">
  <div class="eyebrow">Model Context Protocol · ${num(T.G.nodes.length)} entities</div>
  <h1>Plug the dataset into your agent</h1>
</div>
<div class="cols"><div>
  <p class="lede">The whole ontology is served over MCP, so a model can trace a mechanic to its
  root instead of guessing from whatever it absorbed in training. No key, no account, no rate limit.</p>

  <div class="snip" style="margin:30px 0">
    <div class="snip-h"><span>Endpoint · streamable http</span><button class="copy" type="button" data-copy>Copy</button></div>
    <pre><code>${EP}</code></pre></div>

  ${S.section('Claude Code', snip('Terminal', 'bash',
    `claude mcp add --transport http --scope user genome-of-games ${EP}`) +
    `<p class="gog-note">Then ask it something like <i>"trace battle royale back to its root using the genome server"</i>. Drop <code>--scope user</code> to add it to the current project only.</p>`)}

  ${S.section('Claude Desktop and claude.ai', `<p class="gog-note">Settings → Connectors → Add custom connector, and paste the endpoint above. Claude Desktop can also read it from its config file:</p>` +
    snip('claude_desktop_config.json', 'json', JSON.stringify({
      mcpServers: { 'genome-of-games': { type: 'http', url: EP } }
    }, null, 2)))}

  ${S.section('Cursor, VS Code, Windsurf, Zed', `<p class="gog-note">All of them read the same shape. Cursor uses <code>.cursor/mcp.json</code>, VS Code uses <code>.vscode/mcp.json</code> with a <code>servers</code> key instead of <code>mcpServers</code>.</p>` +
    snip('mcp.json', 'json', JSON.stringify({
      mcpServers: { 'genome-of-games': { url: EP } }
    }, null, 2)))}

  ${S.section('Any language', `<p class="gog-note">It is JSON-RPC 2.0 over POST. There is nothing to install — these all
  work against the raw endpoint.</p>` +
    snip('bash · curl', 'bash',
`curl -s ${EP} \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "genome_trace_lineage",
      "arguments": { "mechanic": "battle royale" }
    }
  }'`) +
    snip('python', 'python',
`import urllib.request, json

ENDPOINT = "${EP}"

def genome(tool, **args):
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": tool, "arguments": args},
    }
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as r:
        result = json.load(r)["result"]
    return result["content"][0]["text"]

print(genome("genome_trace_lineage", mechanic="battle royale"))
print(genome("genome_get_studio", studio="Valve"))`) +
    snip('node', 'javascript',
`const ENDPOINT = "${EP}";

async function genome(tool, args = {}) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: tool, arguments: args },
    }),
  });
  const { result } = await res.json();
  return result.content[0].text;
}

console.log(await genome("genome_trace_lineage", { mechanic: "battle royale" }));`) +
    snip('typescript · official SDK', 'typescript',
`import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({ name: "my-app", version: "1.0.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL("${EP}")),
);

const { tools } = await client.listTools();
const out = await client.callTool({
  name: "genome_trace_lineage",
  arguments: { mechanic: "battle royale" },
});`))}

  ${S.section('The eight tools', `<table><thead><tr><th>Tool</th><th>What it returns</th></tr></thead><tbody>` +
    tools.map(([n, d]) => `<tr><td><code>${n}</code></td><td>${esc(d)}</td></tr>`).join('') +
    `</tbody></table><p class="gog-note">Every tool returns readable prose <i>and</i> a
    <code>structuredContent</code> object, so agents can either quote it or parse it.</p>`)}

  ${S.section('What you get back', `<p class="gog-note">One call, so you can see the shape before wiring anything:</p>` +
    snip('genome_trace_lineage · mechanic: "battle royale"', 'text',
`Shrinking-Circle Battle Royale (2017) traced back 7 steps to a root:
01. Object Collision As Verb (1962) — introduced in Spacewar!
02. Single-Screen Arena (1972) — introduced in Pong
03. Same-Screen Two-Player (1972) — introduced in Pong
04. Networked Deathmatch (1993) — introduced in Doom
05. Internet Client-Server Play (1996) — introduced in Quake
06. Automated Skill Matchmaking (2004) — introduced in Halo 2
07. Shrinking-Circle Battle Royale (2017) — introduced in PUBG: Battlegrounds

Note: Shrinking-Circle Battle Royale has 2 direct parents — Automated Skill
Matchmaking (2004), Survival Needs Clock (1980). The chain above follows the
longest single path, so the other parent is not shown in it.`))}

  ${S.section('Terms', `<div class="note">Free, unauthenticated and unmetered — be reasonable and it stays that way.
  Data is CC BY 4.0: reuse it anywhere, including commercially, as long as you attribute
  <i>The Genome of Games</i> with a link. Origins here are contested by design; read the
  <a href="/methodology/">methodology</a> before presenting any of it as settled, and pass the
  caveats through to your users — <code>genome_get_overview</code> returns them for exactly that reason.</div>`)}
</div>
<aside class="side">
  <h3>At a glance</h3>
  <div class="note">
    <b>Transport</b><br>Streamable HTTP<br><br>
    <b>Auth</b><br>None<br><br>
    <b>Tools</b><br>${tools.length}<br><br>
    <b>Entities</b><br>${num(T.G.nodes.length)}<br><br>
    <b>Licence</b><br>CC BY 4.0
  </div>
  <h3>Also useful</h3>
  <div class="chips">
    <a class="chip" href="/llms.txt">llms.txt</a>
    <a class="chip" href="${T.GITHUB}" rel="noopener">Raw JSON on GitHub</a>
    <a class="chip" href="/methodology/">Methodology</a>
    <a class="chip" href="/api/mcp/">Endpoint (GET)</a>
  </div>
</aside></div>`;

  write('/mcp/', S.page({
    title: 'MCP server — query the game mechanic ontology from any agent',
    desc: `Connect ${num(T.G.nodes.length)} game mechanics, games and studios to Claude, Cursor or any MCP client. Free, no key, eight tools including full lineage tracing. Copy-paste setup for Claude Code, Python, Node and curl.`,
    canonical: '/mcp/', active: '/mcp/', accent: '#d7ff3e',
    jsonld: {
      '@context': 'https://schema.org', '@graph': [
        S.breadcrumbLd(crumb),
        {
          '@type': 'WebAPI', name: 'The Genome of Games MCP server',
          description: 'Model Context Protocol server exposing an ontology of video game mechanics, their origin games and their lineage.',
          documentation: SITE + '/mcp/', url: EP, provider: { '@type': 'Organization', name: 'The Genome of Games' },
          termsOfService: 'https://creativecommons.org/licenses/by/4.0/'
        }
      ]
    }
  }, body), 0.8);
}

function methodology() {
  const crumb = [['Home', '/'], ['Methodology']];
  const body = `${S.crumbs(crumb)}
<h1>Methodology and limits</h1>
<p class="lede">How origins are assigned, what the three link types mean, and where this dataset is weakest. Read this
before citing anything here.</p>
<div class="prose">${T.COPY.methodology.split(/\n\n+/).map(x => `<p>${esc(x)}</p>`).join('')}</div>
${S.section('The three link types', `<table><thead><tr><th>Link</th><th>Meaning</th><th>Count</th></tr></thead><tbody>
<tr><td><b>derives</b></td><td>A mechanic descends conceptually from an earlier mechanic. Parents must predate children.</td><td class="n">${T.E.derives.length}</td></tr>
<tr><td><b>introduces</b></td><td>A game is credited with the first notable shipped implementation of a mechanic.</td><td class="n">${T.E.introduces.length}</td></tr>
<tr><td><b>adopts</b></td><td>A later game used or notably refined an existing mechanic. Illustrative, deliberately incomplete.</td><td class="n">${T.E.adopts.length}</td></tr>
<tr><td><b>sequel / descends</b></td><td>Title-to-title succession within a series, or across series for spiritual successors and mods.</td><td class="n">${T.E.sequel.length + T.E.descends.length}</td></tr>
<tr><td><b>spinoff / rename / acquired</b></td><td>Company lineage: staff departures, continuations under a new name, and ownership.</td><td class="n">${T.E.spinoff.length + T.E.rename.length + T.E.acquired.length}</td></tr>
</tbody></table>`)}
${S.section('Dataset at a glance', `<table><tbody>
<tr><td>Mechanics</td><td class="n">${T.features.length}</td><td>across 15 families</td></tr>
<tr><td>Games</td><td class="n">${T.games.length}</td><td>1962–2026</td></tr>
<tr><td>Companies</td><td class="n">${T.studios.length}</td><td>developers, publishers and platform holders</td></tr>
<tr><td>Recorded links</td><td class="n">${T.G.edges.length}</td><td>across six relationship types</td></tr>
<tr><td>Root mechanics</td><td class="n">${T.features.filter(f => !(f.par || []).length).length}</td><td>no recorded parent in this dataset</td></tr>
<tr><td>Deepest lineage</td><td class="n">${Math.max(...T.features.map(f => T.ancestorChain(f.id).length))}</td><td>steps from a root to a leaf</td></tr>
</tbody></table>`)}
${S.section('Outbound links', `<div class="note">Every entity page links out so a claim can be checked against a second
source. The Wikipedia links are verified permalinks rather than searches: all ${num(Object.keys(T.LINKS).length)} entities
were resolved against the Wikipedia API, ${num(Object.values(T.LINKS).filter(v => v.wp).length)} of them landed on a
confirmed article, and the rest carry no Wikipedia link at all — an empty search result is worse than an absent link.
Most of the gap is mechanics: this ontology names concepts that Wikipedia does not have separate articles for.
MobyGames and Giant Bomb links remain site searches; verifying those needs API keys this project does not have.</div>`)}
${S.section('Corrections', `<div class="note">This is a research artefact, not an authority. If a date, credit or lineage
here is wrong, it is worth fixing. The whole dataset is JSON in the repository.</div>`)}`;
  write('/methodology/', S.page({
    title: 'Methodology and limits — how the game mechanic ontology was built',
    desc: `How mechanic origins are assigned, what derives/introduces/adopts mean, and the known biases and gaps in a dataset of ${num(T.features.length)} mechanics, ${num(T.games.length)} games and ${num(T.studios.length)} companies.`,
    canonical: '/methodology/', active: '/methodology/',
    jsonld: { '@context': 'https://schema.org', '@graph': [S.breadcrumbLd(crumb)] }
  }, body), 0.7);
}

function home() {
  const c = T.COPY.home;
  const deepest = T.features.map(f => ({ f, ch: T.ancestorChain(f.id) })).sort((a, b) => b.ch.length - a.ch.length)[0];
  const mostDesc = T.features.slice().sort((a, b) => b.desc - a.desc);
  const innovators = T.games.filter(g => (g.intro || []).length).sort((a, b) => b.intro.length - a.intro.length);
  const showcase = ['f_battle_royale', 'f_regen_health', 'f_procgen_dungeon', 'f_mod_sdk', 'f_stamina', 'f_seamless_open_world']
    .filter(id => N[id]);

  const ladder = `<div class="ladder">` + deepest.ch.map((cid, i) => {
    const n = N[cid], o = N[n.origin];
    return `<div class="lrow${i === deepest.ch.length - 1 ? ' hi' : ''}">
      <div class="a"><a href="${url(cid)}" style="color:${S.famColor(n.fam)}">${esc(n.n)}</a></div>
      <div class="b">${n.y} · ${o ? `<a href="${url(n.origin)}">${esc(o.n)}</a>` : ''}</div></div>`;
  }).join('') + `</div>`;

  const body = `<div class="hero">
  <div class="eyebrow">An ontology of ${num(T.features.length)} mechanics · ${T.games[0].y}–${T.games[T.games.length - 1].y}</div>
  <h1>Where every game mechanic came from</h1>
  <div style="margin-top:38px">${genomeStrip()}</div>
</div>
<div class="herogrid">
 <div>
  <p class="lede">${esc(c.hero)}</p>
  <p style="color:var(--dim);max-width:34em;font-size:15.5px">${esc(c.sub)}</p>
  <div style="margin-top:26px">
    <a class="cta" href="/graph/">Open the interactive graph</a>
    <a class="cta ghost" href="/features/">Browse all ${num(T.features.length)} mechanics</a>
  </div>
 </div>
 <div class="herocard">
   <div class="eyebrow" style="color:var(--hot);margin-bottom:8px">The deepest chain in the dataset</div>
   ${ladder}
   <a href="${url(deepest.f.id)}" style="font-size:13.5px">Read the full history of ${esc(deepest.f.n)} →</a>
 </div>
</div>
<div class="stats">
  <div class="stat"><b>${num(T.features.length)}</b><span>Mechanics</span></div>
  <div class="stat"><b>${num(T.games.length)}</b><span>Games</span></div>
  <div class="stat"><b>${num(T.studios.length)}</b><span>Studios</span></div>
  <div class="stat"><b>${num(T.G.edges.length)}</b><span>Recorded links</span></div>
  <div class="stat"><b>1962</b><span>Earliest root</span></div>
</div></div>

<div class="prose" style="max-width:38em;margin:34px 0">${c.openingClaim.split(/\n\n+/).map(x => `<p>${esc(x)}</p>`).join('')}</div>

${S.section('Six mechanics worth pulling apart', `<div class="grid">${showcase.map(S.featureCard).join('')}</div>`)}

${S.section('The 15 families', `<div class="grid">${T.famOrder.map(f => `
<a class="card" href="/features/${T.famSlug[f]}/">
  <div class="k"><i style="background:${T.FAM[f].color}"></i>${(T.featuresByFam[f] || []).length} mechanics</div>
  <div class="t">${esc(T.FAM[f].name)}</div>
  <div class="d">${esc((T.COPY.families[f] || {}).blurb || T.FAM[f].blurb)}</div>
</a>`).join('')}</div>`)}

${c.sections.map(s => `<div class="sec"><h2>${esc(s.h)}</h2><div class="prose">${esc(s.p)}</div></div>`).join('')}

${S.section('The most generative ideas in the medium', `
<p style="color:var(--dim);max-width:38em">Ranked by how many later mechanics ultimately descend from them.</p>
<table><thead><tr><th>Mechanic</th><th>Year</th><th>Origin game</th><th>Descendants</th></tr></thead><tbody>
${mostDesc.slice(0, 15).map(f => `<tr>
  <td><a href="${url(f.id)}">${esc(f.n)}</a></td><td class="n">${f.y}</td>
  <td><a href="${url(f.origin)}">${esc(N[f.origin] ? N[f.origin].n : '')}</a></td>
  <td class="n" style="color:var(--gold)">${f.desc}</td></tr>`).join('')}
</tbody></table>`)}

${S.section('The most inventive games', `
<table><thead><tr><th>Game</th><th>Year</th><th>Developer</th><th>Firsts</th></tr></thead><tbody>
${innovators.slice(0, 15).map(g => `<tr>
  <td><a href="${url(g.id)}">${esc(g.n)}</a></td><td class="n">${g.y}</td>
  <td>${g.dev ? `<a href="${url(g.dev)}">${esc(g.devN)}</a>` : esc(g.devN)}</td>
  <td class="n" style="color:var(--gold)">${g.intro.length}</td></tr>`).join('')}
</tbody></table>
<p style="margin-top:14px"><a href="/games/">See all ${num(T.games.length)} games →</a></p>`)}

${S.section('Browse by era', `<div class="chips">${T.ERAS.map(e =>
    `<a class="chip" href="/era/${e.slug}/">${esc(e.name)} <s>${e.a}–${e.b}</s></a>`).join('')}</div>`)}

<div class="note" style="margin-top:40px">Attribution of firsts in games history is frequently contested. Origins here
mean <b>first notable shipped implementation</b>, not invention, and contested cases are flagged on the page itself.
<a href="/methodology/">Read the methodology and known limits →</a></div>`;

  write('/', S.page({
    title: 'The Genome of Games — where every game mechanic came from',
    desc: c.hero, canonical: '/', active: '',
    jsonld: {
      '@context': 'https://schema.org', '@graph': [
        {
          '@type': 'WebSite', name: 'The Genome of Games', url: SITE, description: c.hero,
          potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: SITE + '/features/?q={search_term_string}' }, 'query-input': 'required name=search_term_string' }
        },
        { '@type': 'Dataset', name: 'The Genome of Games mechanic ontology', description: `An ontology of ${num(T.features.length)} video game mechanics with origin games, ancestry links and adoption records across ${num(T.games.length)} games and ${num(T.studios.length)} companies, 1962–2026.`, url: SITE, creator: { '@type': 'Organization', name: 'The Genome of Games' }, license: 'https://creativecommons.org/licenses/by/4.0/',
          isAccessibleForFree: true, keywords: ['video game mechanics', 'game design history', 'game ontology', 'mechanic lineage'],
          codeRepository: T.GITHUB, sameAs: [T.GITHUB],
          distribution: [{ '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${T.GITHUB}/tree/main/data` }] }
      ]
    }
  }, body), 1.0, 'weekly');
}

/* ============================== ASSETS ================================= */
function assets() {
  writeRaw('styles.css', fs.readFileSync(path.join(__dirname, 'static', 'styles.css'), 'utf8'));
  writeRaw('app.js', fs.readFileSync(path.join(__dirname, 'static', 'app.js'), 'utf8'));
  writeRaw('gog.js', fs.readFileSync(path.join(__dirname, 'static', 'gog.js'), 'utf8'));
  writeRaw('favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#06070d"/><circle cx="8" cy="16" r="3.2" fill="#4cc9f0"/><circle cx="19" cy="9" r="2.6" fill="#ffd166"/><circle cx="19" cy="23" r="2.6" fill="#f472b6"/><circle cx="27" cy="16" r="2.2" fill="#22c55e"/><g stroke="#3c4f7d" stroke-width="1.5" fill="none"><path d="M11 16 Q15 16 17 10"/><path d="M11 16 Q15 16 17 22"/><path d="M21.5 9.6 Q25 12 26 14"/></g></svg>`);

  const idx = T.G.nodes.map(n => ({
    i: n.id, n: n.n, t: n.t, y: n.y || '', u: url(n.id),
    ...(n.t === 'F' ? { f: T.FAM[n.fam].name } : n.t === 'T' ? { f: n.devN || '' } : { f: n.ctry || '' })
  }));
  writeRaw('search-index.json', JSON.stringify(idx));

  // graph app: inline the dataset and a node -> page-url map
  const urlMap = Object.fromEntries(T.G.nodes.map(n => [n.id, url(n.id)]));
  const graphHtml = fs.readFileSync(path.join(__dirname, 'static', 'graph.html'), 'utf8')
    .replace('__DATA__', JSON.stringify(T.G).replace(/<\//g, '<\\/'))
    .replace('__URLS__', JSON.stringify(urlMap).replace(/<\//g, '<\\/'));
  fs.mkdirSync(path.join(OUT, 'graph'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'graph', 'index.html'), graphHtml);
  urls.push({ loc: '/graph/', priority: 0.9, changefreq: 'monthly' });
  pages++;

  // copy any prebuilt OG images
  const ogDir = path.join(__dirname, 'static', 'og');
  if (fs.existsSync(ogDir)) {
    fs.mkdirSync(path.join(OUT, 'og'), { recursive: true });
    for (const f of fs.readdirSync(ogDir)) fs.copyFileSync(path.join(ogDir, f), path.join(OUT, 'og', f));
  }

  /* Answer engines are a real referral source for a reference dataset, and
     several of them read a separate opt-in signal. Name the ones that matter
     explicitly rather than relying on the wildcard, and point them at llms.txt. */
  const AI_AGENTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot',
    'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Bingbot', 'CCBot',
    'meta-externalagent', 'Amazonbot', 'DuckAssistBot', 'cohere-ai', 'MistralAI-User', 'YouBot'];
  writeRaw('robots.txt',
    `User-agent: *\nAllow: /\n\n` +
    AI_AGENTS.map(a => `User-agent: ${a}\nAllow: /\n`).join('\n') +
    `\n# Machine-readable summary of this dataset\n# ${SITE}/llms.txt\n\nSitemap: ${SITE}/sitemap.xml\n`);

  /* llms.txt — the emerging convention for handing a model a compact, correct
     description of a site instead of making it infer one from 1,200 pages. */
  const famLines = T.famOrder.map(f => {
    const list = T.featuresByFam[f] || [];
    return `- [${T.FAM[f].name}](${SITE}/features/${T.famSlug[f]}/): ${list.length} mechanics. ${T.FAM[f].blurb}`;
  }).join('\n');
  /* Span the whole dataset, not just the mechanics — the newest mechanic
     predates the newest game by several years. */
  const oldest = T.games[0], newest = T.games[T.games.length - 1];
  writeRaw('llms.txt', `# The Genome of Games

> An ontology of video game mechanics. ${num(T.features.length)} mechanics, ${num(T.games.length)} games and ${num(T.studios.length)} companies from ${oldest.y} to ${newest.y}, with ${num(T.G.edges.length)} recorded links. Every mechanic has one credited origin game and a traceable chain of ancestors reaching back to a root.

Built and maintained as an independent research project. Data and prose are CC BY 4.0; attribution with a link is required. Source and raw JSON: ${T.GITHUB}

## What "origin" means here

Origin means the first notable *shipped* implementation, not invention, and not the version that popularised it. Contested cases are flagged on the page rather than asserted — kill.switch (2003) shipped over-the-shoulder aim two years before Resident Evil 4, and this dataset credits the earlier date while saying so. Read ${SITE}/methodology/ before citing anything.

## Known limits

- Coverage skews to Western PC and Japanese console history; arcade-era Japan, PC strategy and mobile interaction design are thinner than they should be.
- \`adopts\` links are illustrative and deliberately incomplete: they show an idea spread, not everywhere it spread.
- Wikipedia links are verified permalinks; MobyGames and Giant Bomb links are site searches.

## Core pages

- [Methodology and limits](${SITE}/methodology/): how origins are assigned, what each link type means, where the data is weakest. Read this first.
- [All mechanics](${SITE}/features/): the ${num(T.features.length)} mechanics, grouped into ${T.famOrder.length} families.
- [All games](${SITE}/games/): ${num(T.games.length)} titles, ${oldest.y}–${newest.y}, each showing what it introduced and what it inherited.
- [All studios](${SITE}/studios/): ${num(T.studios.length)} developers and publishers with spinoffs, renames and acquisitions.
- [Interactive graph](${SITE}/graph/): pan and zoom the full lineage; deep-linkable as /graph/?node=<id>&trace=1.
- [Newsletter](${SITE}/newsletter/): free updates, or a $10/month newsletter.
- [MCP server](${SITE}/mcp/): query this dataset directly from an agent. Streamable HTTP at ${SITE}/api/mcp/, no key required, eight tools including full lineage tracing.

## Mechanic families

${famLines}

## Citation

"<Mechanic name>." The Genome of Games, an ontology of game mechanics. ${SITE}/feature/<slug>/
`);
  writeRaw('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `<url><loc>${SITE}${u.loc}</loc><changefreq>${u.changefreq || 'monthly'}</changefreq><priority>${u.priority.toFixed(1)}</priority></url>`).join('\n') +
    `\n</urlset>\n`);

  // 404
  const b = `${S.crumbs([['Home', '/']])}<h1>Not found</h1>
<p class="lede">That page does not exist. The dataset has ${num(T.features.length)} mechanics, ${num(T.games.length)} games and ${num(T.studios.length)} studios — try one of these.</p>
<div class="chips">${['/features/', '/games/', '/studios/', '/eras/', '/graph/', '/methodology/'].map(h =>
    `<a class="chip" href="${h}">${h}</a>`).join('')}</div>`;
  fs.writeFileSync(path.join(OUT, '404.html'), S.page({
    title: 'Not found — The Genome of Games', desc: 'Page not found.', canonical: '/404', noindex: true, active: ''
  }, b));
}

/* ================================ RUN ================================== */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

home();
featuresIndex();
T.famOrder.forEach(familyPage);
T.features.forEach(featurePage);
gamesIndex();
T.DECADES.forEach(decadePage);
T.games.forEach(gamePage);
studiosIndex();
['#', ...T.LETTERS].filter(l => (T.studiosByLetter[l] || []).length).forEach(letterPage);
T.studios.forEach(studioPage);
erasIndex();
T.ERAS.forEach(eraPage);
methodology();
newsletterPage();
mcpPage();
const mcpEntities = mcpIndex();
assets();

console.log(`built ${pages} pages · ${num(links)} internal links · ${urls.length} sitemap entries`);
console.log(`mcp index: ${num(mcpEntities)} entities → data/mcp-index.json`);
