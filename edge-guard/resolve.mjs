#!/usr/bin/env node
/* Turns firewall.json into the concrete config for one project and mode.
   node resolve.mjs <log|enforce> <hobby|pro> [project-name]  → JSON on stdout
   apply.sh and the review tooling both go through this, so there is one
   definition of what "enforce" means. */
import fs from 'node:fs';
const [mode, plan, project] = process.argv.slice(2);
if (!['log', 'enforce'].includes(mode) || !['hobby', 'pro'].includes(plan)) {
  console.error('usage: resolve.mjs <log|enforce> <hobby|pro> [project-name]'); process.exit(2);
}
const t = JSON.parse(fs.readFileSync(new URL('./firewall.json', import.meta.url)));
const rules = t.rules.map(({ enforce, ...r }) => {
  const out = structuredClone(r);
  const m = out.action.mitigate;
  if (mode === 'enforce') {
    if (m.action === 'rate_limit') m.rateLimit.action = enforce.rateLimitAction;
    else m.action = enforce.action;
    m.actionDuration = enforce.actionDuration || null;
  }
  if (plan === 'hobby') m.actionDuration = null;   // persistent actions are Pro/Enterprise only
  return out;
});
const managedRules = Object.fromEntries(Object.entries(t.managedRules).map(([k, v]) =>
  [k, { active: v.active, action: mode === 'enforce' ? v.enforce : v.action }]));
const o = (t.projectOverrides || {})[project];
if (o && o.managedRules) for (const [k, v] of Object.entries(o.managedRules)) managedRules[k] = { ...managedRules[k], ...v };
if (rules.length > 3) { console.error(`template has ${rules.length} custom rules; Hobby allows 3`); process.exit(1); }
process.stdout.write(JSON.stringify({ rules, managedRules }, null, 2) + '\n');
