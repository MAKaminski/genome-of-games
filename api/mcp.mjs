/* The Genome of Games — Model Context Protocol server.

   Streamable HTTP transport, spoken directly in JSON-RPC. There is no MCP SDK
   here for the same reason there is no Stripe or Supabase SDK: the protocol is
   a handful of methods over POST, and this project ships no dependencies.

   The dataset arrives as one statically-imported index built by build.js, so
   the function never re-derives slugs or lineage and cannot drift from the
   site's own pages. */
import INDEX from '../data/mcp-index.json' with { type: 'json' };

const { meta, families, eras, entities } = INDEX;
const ALL = Object.values(entities);
const SITE = meta.site;
const abs = u => (u && u.startsWith('/') ? SITE + u : u);

/* ------------------------------------------------------------ resolving -- */

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* Callers say "battle royale" far more often than "f_battle_royale", so every
   lookup accepts an id, an exact name, or a partial one. Ambiguity comes back
   as a list of candidates rather than a silently-wrong pick. */
function resolve(query, type) {
  const q = norm(query);
  if (!q) return { error: 'Provide an id or a name.' };
  if (entities[query] && (!type || entities[query].type === type)) return { hit: entities[query] };

  const pool = type ? ALL.filter(e => e.type === type) : ALL;
  const exact = pool.filter(e => norm(e.name) === q);
  if (exact.length === 1) return { hit: exact[0] };

  const starts = pool.filter(e => norm(e.name).startsWith(q));
  const contains = pool.filter(e => norm(e.name).includes(q));
  const cands = (exact.length ? exact : starts.length ? starts : contains);
  if (cands.length === 1) return { hit: cands[0] };
  if (!cands.length) return { error: `Nothing in the dataset matches "${query}".` };
  return {
    error: `"${query}" matches ${cands.length} entries. Use an id or a fuller name.`,
    candidates: cands.slice(0, 12).map(e => ({ id: e.id, name: e.name, type: e.type, year: e.year || null }))
  };
}

const line = r => `${r.name}${r.year ? ` (${r.year})` : ''}`;
const list = (rs, cap = 40) => {
  if (!rs || !rs.length) return 'none recorded';
  const shown = rs.slice(0, cap).map(line).join(', ');
  return rs.length > cap ? `${shown} … and ${rs.length - cap} more` : shown;
};

/* --------------------------------------------------------------- tools -- */

const TOOLS = [
  {
    name: 'genome_get_overview',
    description: 'Start here. What this dataset is, how big it is, what "origin" means, where the data is deliberately weak, the fifteen mechanic families, the seven eras, and how to cite it. Call this before answering any question about game-mechanic history from this source.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: () => ({
      text: [
        `${meta.name} — an ontology of video game mechanics.`,
        `${meta.mechanics} mechanics, ${meta.games} games, ${meta.studios} companies, ${meta.links} recorded links, ${meta.firstYear}–${meta.lastYear}.`,
        `Every mechanic has one credited origin game and a traceable chain of ancestors reaching back to a root.`,
        ``,
        `WHAT "ORIGIN" MEANS: the first notable *shipped* implementation — not invention, and not the version that popularised it. Contested cases are flagged rather than asserted. Over-the-shoulder aim is credited to kill.switch (2003), two years before Resident Evil 4, which is the game designers actually copied.`,
        ``,
        `KNOWN LIMITS — state these when citing:`,
        `· Coverage skews to Western PC and Japanese console history. Arcade-era Japan, PC strategy and mobile interaction design are thinner than they should be.`,
        `· "adoptedBy" links are illustrative and deliberately incomplete. They show an idea spread, not everywhere it spread.`,
        `· ${meta.verifiedWikipediaLinks} of ${ALL.length} entities carry a Wikipedia permalink verified against the Wikipedia API; the rest have no article and carry no link.`,
        ``,
        `FAMILIES: ${families.map(f => `${f.name} (${f.mechanics})`).join(' · ')}`,
        `ERAS: ${eras.map(e => `${e.name} ${e.from}–${e.to}`).join(' · ')}`,
        ``,
        `Licence: ${meta.license} — attribution with a link is required. Source and raw JSON: ${meta.repository}`,
        `Cite as: "<Mechanic>." The Genome of Games, an ontology of game mechanics. ${SITE}/feature/<slug>/`
      ].join('\n'),
      data: { meta, families, eras }
    })
  },
  {
    name: 'genome_search',
    description: 'Search mechanics, games and studios by name. Use when you have a partial or uncertain name, or want to see what the dataset holds on a topic. Returns ranked matches with ids to pass to the get_* tools.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free text, e.g. "battle royale", "Bungie", "Half-Life"' },
        type: { type: 'string', enum: ['mechanic', 'game', 'studio'], description: 'Optional filter' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 15 }
      },
      required: ['query'], additionalProperties: false
    },
    run: ({ query, type, limit = 15 }) => {
      const q = norm(query);
      if (!q) return { text: 'Provide a query.', isError: true };
      const pool = type ? ALL.filter(e => e.type === type) : ALL;
      const scored = pool.map(e => {
        const n = norm(e.name);
        let score = n === q ? 100 : n.startsWith(q) ? 70 : n.includes(q) ? 45
          : norm(e.summary || '').includes(q) ? 12 : 0;
        if (score && e.type === 'mechanic') score += 4;   // the ontology is the point
        return { e, score };
      }).filter(x => x.score).sort((a, b) => b.score - a.score || (a.e.year || 0) - (b.e.year || 0));

      if (!scored.length) return { text: `Nothing matches "${query}".`, data: { results: [] } };
      const results = scored.slice(0, limit).map(({ e }) => ({
        id: e.id, type: e.type, name: e.name, year: e.year || null,
        family: e.family ? e.family.name : null, summary: e.summary || '', url: abs(e.url)
      }));
      return {
        text: `${scored.length} match${scored.length === 1 ? '' : 'es'} for "${query}"${scored.length > limit ? `, showing ${limit}` : ''}:\n` +
          results.map(r => `· [${r.type}] ${r.name}${r.year ? ` (${r.year})` : ''} — id ${r.id}\n  ${r.summary}`).join('\n'),
        data: { total: scored.length, results }
      };
    }
  },
  {
    name: 'genome_get_mechanic',
    description: 'Full record for one mechanic: its credited origin game and developer, the essay explaining it, its parents and children, everything downstream, and the later games that adopted it. This is the richest object in the dataset.',
    inputSchema: {
      type: 'object',
      properties: { mechanic: { type: 'string', description: 'Id or name, e.g. "f_regen_health" or "regenerating health"' } },
      required: ['mechanic'], additionalProperties: false
    },
    run: ({ mechanic }) => {
      const r = resolve(mechanic, 'mechanic');
      if (r.error) return { text: r.error, data: r.candidates ? { candidates: r.candidates } : undefined, isError: true };
      const e = r.hit;
      return {
        text: [
          `${e.name} (${e.year}) — ${e.family.name}`,
          `Origin: ${e.origin ? line(e.origin) : 'unrecorded'}${e.originDeveloper ? `, developed by ${e.originDeveloper.name}` : ''}`,
          `Era: ${e.era.name} (${e.era.from}–${e.era.to})`,
          ``, e.summary, ``,
          ...e.prose, ``,
          `Descends from: ${list(e.parents)}`,
          `Forked into: ${list(e.children)}`,
          `Everything downstream (${e.descendants.length}): ${list(e.descendants)}`,
          `Later adopted by (${e.adoptedBy.length}): ${list(e.adoptedBy)}`,
          `Lineage to root: ${e.lineage.map(line).join(' → ')}`,
          e.alsoKnownAs.length ? `Also called: ${e.alsoKnownAs.join(', ')}` : '',
          ``, `Page: ${abs(e.url)}${e.wikipedia ? `\nWikipedia: ${e.wikipedia}` : ''}`
        ].filter(Boolean).join('\n'),
        data: { ...e, url: abs(e.url) }
      };
    }
  },
  {
    name: 'genome_get_game',
    description: 'What one game introduced to the medium and what it inherited, plus developer, publisher, platform and its series. Use to answer "what was first in this game" or "what did it borrow".',
    inputSchema: {
      type: 'object',
      properties: { game: { type: 'string', description: 'Id or title, e.g. "Halo: Combat Evolved"' } },
      required: ['game'], additionalProperties: false
    },
    run: ({ game }) => {
      const r = resolve(game, 'game');
      if (r.error) return { text: r.error, data: r.candidates ? { candidates: r.candidates } : undefined, isError: true };
      const e = r.hit;
      return {
        text: [
          `${e.name} (${e.year})`,
          `Developer: ${e.developer ? e.developer.name : 'unrecorded'}${e.publisher ? ` · Publisher: ${e.publisher.name}` : ''}`,
          e.platform ? `Platform: ${e.platform}${e.genre ? ` · Genre: ${e.genre}` : ''}` : '',
          ``, e.summary, ``,
          `Introduced (${e.introduced.length}): ${list(e.introduced)}`,
          `Built on (${e.adopted.length}): ${list(e.adopted)}`,
          e.series.length > 1 ? `Series: ${list(e.series)}` : '',
          ``, `Page: ${abs(e.url)}${e.wikipedia ? `\nWikipedia: ${e.wikipedia}` : ''}`
        ].filter(Boolean).join('\n'),
        data: { ...e, url: abs(e.url) }
      };
    }
  },
  {
    name: 'genome_get_studio',
    description: 'A company: what it developed and published, which mechanics it is credited with shipping first, and its corporate lineage — who it spun out of, who it was acquired by, who it was renamed to, and which studios its former staff founded.',
    inputSchema: {
      type: 'object',
      properties: { studio: { type: 'string', description: 'Id or name, e.g. "Valve" or "id Software"' } },
      required: ['studio'], additionalProperties: false
    },
    run: ({ studio }) => {
      const r = resolve(studio, 'studio');
      if (r.error) return { text: r.error, data: r.candidates ? { candidates: r.candidates } : undefined, isError: true };
      const e = r.hit;
      return {
        text: [
          `${e.name} — ${e.kind}${e.country ? `, ${e.country}` : ''}`,
          `${e.founded ? `Founded ${e.founded}` : 'Founding year unrecorded'}${e.closed ? ` · Closed ${e.closed}` : ''}`,
          ``, e.summary, ``,
          `Mechanics first shipped (${e.mechanicsCredited.length}): ${list(e.mechanicsCredited)}`,
          `Developed (${e.developed.length}): ${list(e.developed)}`,
          e.published.length ? `Published (${e.published.length}): ${list(e.published)}` : '',
          e.foundersLeft ? `Founded by people who left: ${e.foundersLeft.name}` : '',
          e.partOf ? `Part of: ${e.partOf.name}` : '',
          e.renamedFrom ? `Continues: ${e.renamedFrom.name}` : '',
          e.renamedTo ? `Later became: ${e.renamedTo.name}` : '',
          e.spawned.length ? `Studios founded by former staff: ${list(e.spawned)}` : '',
          e.acquired.length ? `Brought in-house: ${e.acquired.map(a => `${a.name}${a.acquiredYear ? ` (${a.acquiredYear})` : ''}`).join(', ')}` : '',
          ``, `Page: ${abs(e.url)}${e.wikipedia ? `\nWikipedia: ${e.wikipedia}` : ''}`
        ].filter(Boolean).join('\n'),
        data: { ...e, url: abs(e.url) }
      };
    }
  },
  {
    name: 'genome_trace_lineage',
    description: 'Trace one mechanic back through its ancestors to a root, showing the game that introduced each step. This is the dataset\'s central claim — use it for questions like "where did battle royale come from" rather than reasoning from general knowledge.',
    inputSchema: {
      type: 'object',
      properties: {
        mechanic: { type: 'string', description: 'Id or name' },
        direction: { type: 'string', enum: ['ancestors', 'descendants'], default: 'ancestors' }
      },
      required: ['mechanic'], additionalProperties: false
    },
    run: ({ mechanic, direction = 'ancestors' }) => {
      const r = resolve(mechanic, 'mechanic');
      if (r.error) return { text: r.error, data: r.candidates ? { candidates: r.candidates } : undefined, isError: true };
      const e = r.hit;

      if (direction === 'descendants') {
        return {
          text: `${e.name} (${e.year}) — everything downstream\n` +
            `Direct forks (${e.children.length}): ${list(e.children)}\n` +
            `All descendants (${e.descendants.length}): ${list(e.descendants, 80)}\n` +
            `Later adopted by ${e.adoptedBy.length} games: ${list(e.adoptedBy, 80)}`,
          data: { id: e.id, name: e.name, children: e.children, descendants: e.descendants, adoptedBy: e.adoptedBy }
        };
      }

      const steps = e.lineage.map((n, i) => {
        const full = entities[n.id];
        return `${String(i + 1).padStart(2, '0')}. ${n.name} (${n.year})${full && full.origin ? ` — introduced in ${full.origin.name}` : ''}`;
      });
      const parents = e.parents.length > 1
        ? `\n\nNote: ${e.name} has ${e.parents.length} direct parents — ${list(e.parents)}. The chain above follows the longest single path, so the other parent is not shown in it.`
        : '';
      return {
        text: `${e.name} (${e.year}) traced back ${e.lineage.length} steps to a root:\n${steps.join('\n')}${parents}\n\nPage: ${abs(e.url)}`,
        data: { id: e.id, name: e.name, depth: e.lineage.length, lineage: e.lineage, parents: e.parents }
      };
    }
  },
  {
    name: 'genome_list_family',
    description: 'Every mechanic in one of the fifteen families, oldest first. Call with no argument to list the families themselves.',
    inputSchema: {
      type: 'object',
      properties: { family: { type: 'string', description: 'Family name or key, e.g. "Combat & Conflict" or "CBT". Omit to list all families.' } },
      additionalProperties: false
    },
    run: ({ family }) => {
      if (!family) {
        return {
          text: `${families.length} families:\n` + families.map(f => `· ${f.name} (${f.mechanics}) — ${f.blurb}`).join('\n'),
          data: { families }
        };
      }
      const q = norm(family);
      const fam = families.find(f => norm(f.key) === q || norm(f.name) === q || norm(f.name).includes(q));
      if (!fam) return { text: `No family matches "${family}". Try one of: ${families.map(f => f.name).join(', ')}`, isError: true };
      const members = ALL.filter(e => e.type === 'mechanic' && e.family.key === fam.key)
        .sort((a, b) => a.year - b.year);
      return {
        text: `${fam.name} — ${members.length} mechanics\n${fam.blurb}\n\n` +
          members.map(m => `· ${m.name} (${m.year}) — ${m.summary}`).join('\n') +
          `\n\nPage: ${abs(fam.url)}`,
        data: { family: fam, mechanics: members.map(m => ({ id: m.id, name: m.name, year: m.year, summary: m.summary, url: abs(m.url) })) }
      };
    }
  },
  {
    name: 'genome_by_year',
    description: 'What the dataset records as first shipped in a given year or range — the mechanics introduced and the games that introduced them. Good for "what changed in 1997" style questions.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'integer', description: 'Start year, inclusive' },
        to: { type: 'integer', description: 'End year, inclusive. Omit for a single year.' }
      },
      required: ['from'], additionalProperties: false
    },
    run: ({ from, to }) => {
      const b = to || from;
      if (b < from) return { text: '"to" must not be earlier than "from".', isError: true };
      const hits = ALL.filter(e => e.type === 'mechanic' && e.year >= from && e.year <= b)
        .sort((a, b2) => a.year - b2.year);
      if (!hits.length) return { text: `No mechanics recorded as introduced between ${from} and ${b}.`, data: { mechanics: [] } };
      return {
        text: `${hits.length} mechanic${hits.length === 1 ? '' : 's'} introduced ${from === b ? `in ${from}` : `between ${from} and ${b}`}:\n` +
          hits.map(m => `· ${m.year} — ${m.name} [${m.family.name}]${m.origin ? ` in ${m.origin.name}` : ''}\n  ${m.summary}`).join('\n'),
        data: { from, to: b, mechanics: hits.map(m => ({ id: m.id, name: m.name, year: m.year, family: m.family.name, origin: m.origin, url: abs(m.url) })) }
      };
    }
  }
];

const BY_NAME = Object.fromEntries(TOOLS.map(t => [t.name, t]));

/* ---------------------------------------------------------- JSON-RPC ----- */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, mcp-protocol-version, mcp-session-id, authorization',
  'access-control-expose-headers': 'mcp-session-id'
};
const send = (body, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS }
  });
const ok = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

const INSTRUCTIONS = `Serves ${meta.mechanics} video game mechanics, ${meta.games} games and ${meta.studios} companies (${meta.firstYear}–${meta.lastYear}) as a traceable ontology: every mechanic has one credited origin game and a chain of ancestors back to a root.

Call genome_get_overview first — it returns the counts, the fifteen families, the seven eras, and, importantly, what this dataset means by "origin" and where it is knowingly weak. Quote those limits when you cite it.

Prefer genome_trace_lineage over reasoning from general knowledge for "where did X come from" questions; the answers here are sourced and often contradict the popular story. Data is CC BY 4.0 and attribution with a link back is required.`;

export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

/* A browser hitting the endpoint should learn something rather than see an
   error, so GET returns a description instead of 405. */
export async function GET() {
  return send({
    name: 'genome-of-games-mcp', version: '1.0.0', transport: 'streamable-http',
    endpoint: `${SITE}/api/mcp/`,
    docs: `${SITE}/mcp/`,
    tools: TOOLS.map(t => t.name),
    dataset: meta,
    hint: 'POST JSON-RPC 2.0 to this URL. Start with the "initialize" method.'
  });
}

export async function POST(request) {
  let msg;
  try { msg = await request.json(); } catch { return fail(null, -32700, 'Parse error'); }

  /* Batches are legal JSON-RPC. Handle them so strict clients don't break. */
  if (Array.isArray(msg)) {
    const out = [];
    for (const m of msg) {
      const r = await handle(m);
      if (r) out.push(r);
    }
    return out.length ? send(out) : new Response(null, { status: 202, headers: CORS });
  }

  const res = await handle(msg);
  // Notifications get no body — only a 202.
  return res ? send(res) : new Response(null, { status: 202, headers: CORS });
}

async function handle(msg) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return { jsonrpc: '2.0', id: (msg && msg.id) ?? null, error: { code: -32600, message: 'Invalid Request' } };
  }
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0', id, result: {
          /* Echo the client's protocol version when we understand it, so a
             client on either revision of the spec stays happy. */
          protocolVersion: (params && params.protocolVersion) || '2024-11-05',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'genome-of-games', title: 'The Genome of Games', version: '1.0.0' },
          instructions: INSTRUCTIONS
        }
      };

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;

    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };

    case 'tools/list':
      return {
        jsonrpc: '2.0', id, result: {
          tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
        }
      };

    case 'tools/call': {
      const tool = BY_NAME[params && params.name];
      if (!tool) return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${params && params.name}` } };
      try {
        const out = tool.run((params && params.arguments) || {});
        return {
          jsonrpc: '2.0', id, result: {
            content: [{ type: 'text', text: out.text }],
            ...(out.data !== undefined ? { structuredContent: out.data } : {}),
            ...(out.isError ? { isError: true } : {})
          }
        };
      } catch (err) {
        console.error('tool failed', params && params.name, err);
        return {
          jsonrpc: '2.0', id, result: {
            content: [{ type: 'text', text: `That tool failed: ${err.message}` }], isError: true
          }
        };
      }
    }

    case 'resources/list': return { jsonrpc: '2.0', id, result: { resources: [] } };
    case 'prompts/list': return { jsonrpc: '2.0', id, result: { prompts: [] } };

    default:
      if (isNotification) return null;
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
  }
}
