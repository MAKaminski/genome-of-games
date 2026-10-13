/* The public MCP endpoint, on Cloudflare Workers.

   The server is lib/mcp-core.mjs, the same module the Vercel route imports;
   wrangler bundles it together with data/mcp-index.json. All this file adds is
   routing and a per-IP rate limit, both of which belong to the host. */
import { handleRequest, rateLimited } from '../../lib/mcp-core.mjs';

const PATHS = new Set(['/', '/mcp', '/mcp/']);

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (!PATHS.has(pathname)) {
      return new Response('Not found. The MCP endpoint is /mcp.', { status: 404 });
    }

    /* 60 requests a minute per IP, counted per Cloudflare location (the
       binding's semantics). Preflights are exempt: with a one-day max-age a
       browser sends at most one a day, and refusing one breaks the call. */
    if (request.method !== 'OPTIONS') {
      const ip = request.headers.get('cf-connecting-ip') || 'unknown';
      const { success } = await env.MCP_LIMITER.limit({ key: ip });
      if (!success) return rateLimited(60);
    }

    return handleRequest(request);
  }
};
