/* The MCP endpoint on Vercel. The server itself lives in lib/mcp-core.mjs and
   is shared with the Cloudflare Worker in worker/, which is the public URL;
   this route stays only so old clients keep working through the move. */
export { GET, POST, OPTIONS } from '../lib/mcp-core.mjs';
