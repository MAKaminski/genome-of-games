/* The public MCP endpoint, on Cloudflare Workers.

   The server is lib/mcp-core.mjs; wrangler bundles it together with
   data/mcp-index.json. All this file adds is routing, which belongs to the
   host.

   There is deliberately no rate limit here. On the Workers Free plan every
   invocation counts toward the account's 100,000-a-day cap, including one
   that answers 429, so an in-Worker limit cannot protect that budget. Abuse
   is stopped upstream instead: the Vercel Firewall denies it before the old
   URL's redirect, and denied traffic never reaches this Worker. */
import { handleRequest } from '../../lib/mcp-core.mjs';

const PATHS = new Set(['/', '/mcp', '/mcp/']);

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (!PATHS.has(pathname)) {
      return new Response('Not found. The MCP endpoint is /mcp.', { status: 404 });
    }
    return handleRequest(request);
  }
};
