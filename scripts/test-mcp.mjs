/* Exercises lib/mcp-core.mjs exactly as both hosts call it — with Fetch API
   Requests — so a change that breaks the protocol fails here before it ships.
   node scripts/test-mcp.mjs */
import assert from 'node:assert/strict';
import { GET, POST, OPTIONS, handleRequest, rateLimited } from '../lib/mcp-core.mjs';

const rpc = body => new Request('https://example.test/mcp', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
});
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`ok ${passed} — ${name}`); };

await test('OPTIONS preflight is cacheable for a day', async () => {
  const r = await OPTIONS();
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-max-age'), '86400');
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
});

await test('GET discovery is shared-cacheable and names the endpoint', async () => {
  const r = await GET();
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'public, s-maxage=3600, stale-while-revalidate=86400');
  const j = await r.json();
  assert.match(j.endpoint, /^https:\/\//);
  assert.equal(j.tools.length, 8);
});

await test('initialize echoes protocol version', async () => {
  const j = await (await POST(rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }))).json();
  assert.equal(j.result.protocolVersion, '2025-06-18');
  assert.equal(j.result.serverInfo.name, 'genome-of-games');
});

await test('POST responses are never cached', async () => {
  const r = await POST(rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }));
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('access-control-max-age'), '86400');
});

await test('tools/list returns eight tools', async () => {
  const j = await (await POST(rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }))).json();
  assert.equal(j.result.tools.length, 8);
});

await test('tools/call genome_trace_lineage battle royale', async () => {
  const j = await (await POST(rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call',
    params: { name: 'genome_trace_lineage', arguments: { mechanic: 'battle royale' } } }))).json();
  assert.ok(!j.result.isError, j.result.content[0].text);
  assert.match(j.result.content[0].text, /traced back \d+ steps to a root/);
  assert.ok(j.result.structuredContent.lineage.length > 1);
});

await test('notifications get a bodiless 202', async () => {
  const r = await POST(rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }));
  assert.equal(r.status, 202);
});

await test('batches answer every request', async () => {
  const j = await (await POST(rpc([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]))).json();
  assert.equal(j.length, 2);
});

await test('bad JSON is a parse error', async () => {
  const j = await (await POST(new Request('https://example.test/mcp', { method: 'POST', body: '{' }))).json();
  assert.equal(j.error.code, -32700);
});

await test('handleRequest routes by method', async () => {
  assert.equal((await handleRequest(new Request('https://example.test/mcp'))).status, 200);
  assert.equal((await handleRequest(new Request('https://example.test/mcp', { method: 'OPTIONS' }))).status, 204);
  assert.equal((await handleRequest(new Request('https://example.test/mcp', { method: 'PUT' }))).status, 405);
});

await test('rate-limited response is a readable 429', async () => {
  const r = rateLimited();
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('retry-after'), '60');
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
});

console.log(`\n${passed} passed`);
