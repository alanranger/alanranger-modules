import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  hasWhoamiAuthEvidence,
  shouldAttemptWhoami,
  createWhoamiClientGate,
  requestHasAuthEvidence
} = require('../lib/examsWhoamiGuard.js');
const cors = require('../api/exams/_cors.js');

test('hasWhoamiAuthEvidence requires memberId or bearer', () => {
  assert.equal(hasWhoamiAuthEvidence({}), false);
  assert.equal(hasWhoamiAuthEvidence({ memberId: '' }), false);
  assert.equal(hasWhoamiAuthEvidence({ memberId: 'mem_1' }), true);
  assert.equal(hasWhoamiAuthEvidence({ bearerToken: 'tok' }), true);
});

test('shouldAttemptWhoami blocks negative cache and resolved identity', () => {
  assert.equal(shouldAttemptWhoami({ memberId: 'mem_1', negativeCached: true }), false);
  assert.equal(shouldAttemptWhoami({ memberId: 'mem_1', identityResolved: true }), false);
  assert.equal(shouldAttemptWhoami({}), false);
  assert.equal(shouldAttemptWhoami({ memberId: 'mem_1' }), true);
});

test('logged-out page: zero whoami network calls without auth evidence', async () => {
  const gate = createWhoamiClientGate();
  let fetches = 0;
  const fetcher = async () => {
    fetches += 1;
    return null;
  };
  await gate.runOnce(fetcher, {});
  await gate.runOnce(fetcher, {});
  assert.equal(fetches, 0);
  assert.equal(gate.getCallCount(), 0);
  assert.equal(gate.isNegativeCached(), true);
});

test('hundreds of mutation kicks do not cause additional calls after resolved logout', async () => {
  const gate = createWhoamiClientGate();
  let fetches = 0;
  const fetcher = async () => {
    fetches += 1;
    return { memberstack_id: null };
  };
  // First kick with no auth → no fetch, marked logged out
  await gate.runOnce(fetcher, {});
  for (let i = 0; i < 500; i++) {
    if (gate.shouldKick()) await gate.runOnce(fetcher, {});
  }
  assert.equal(fetches, 0);
  assert.equal(gate.shouldKick(), false);
});

test('failed identity is not automatically retried', async () => {
  const gate = createWhoamiClientGate();
  let fetches = 0;
  const fetcher = async () => {
    fetches += 1;
    return null;
  };
  await gate.runOnce(fetcher, { memberId: 'mem_x' });
  await gate.runOnce(fetcher, { memberId: 'mem_x' });
  await gate.runOnce(fetcher, { memberId: 'mem_x' });
  assert.equal(fetches, 1);
  assert.equal(gate.getCallCount(), 1);
});

test('simultaneous identity requests share one in-flight promise', async () => {
  const gate = createWhoamiClientGate();
  let fetches = 0;
  const fetcher = async () => {
    fetches += 1;
    await new Promise((r) => setTimeout(r, 30));
    return { memberstack_id: 'mem_ok' };
  };
  const [a, b, c] = await Promise.all([
    gate.runOnce(fetcher, { memberId: 'mem_ok' }),
    gate.runOnce(fetcher, { memberId: 'mem_ok' }),
    gate.runOnce(fetcher, { memberId: 'mem_ok' })
  ]);
  assert.equal(fetches, 1);
  assert.equal(a.memberstack_id, 'mem_ok');
  assert.equal(b.memberstack_id, 'mem_ok');
  assert.equal(c.memberstack_id, 'mem_ok');
});

test('authenticated member still resolves successfully', async () => {
  const gate = createWhoamiClientGate();
  const result = await gate.runOnce(
    async () => ({ memberstack_id: 'mem_live', email: 'a@b.c' }),
    { memberId: 'mem_live' }
  );
  assert.equal(result.memberstack_id, 'mem_live');
  assert.equal(gate.isResolved(), true);
  assert.equal(gate.isNegativeCached(), false);
});

test('server requestHasAuthEvidence rejects empty requests', () => {
  assert.equal(requestHasAuthEvidence({ headers: {} }), false);
  assert.equal(requestHasAuthEvidence({ headers: { 'x-memberstack-id': 'mem_1' } }), true);
  assert.equal(requestHasAuthEvidence({ headers: { authorization: 'Bearer abc' } }), true);
  assert.equal(requestHasAuthEvidence({ headers: { cookie: '_ms-mid=abc' } }), true);
  assert.equal(cors.requestHasAuthEvidence({ headers: {} }), false);
  assert.equal(cors.requestHasAuthEvidence({ headers: { 'x-memberstack-id': 'mem_1' } }), true);
});

test('bookmark snippet no longer leaves missing_member_id unwired', () => {
  const fs = require('fs');
  const html = fs.readFileSync(
    new URL('../Squarespace Snippets/academy-bookmark-buttons-squarespace-snippet-v1.html', import.meta.url),
    'utf8'
  );
  assert.match(html, /v1\.3\.18 COST FIX/);
  assert.match(html, /identityGateResolved/);
  assert.doesNotMatch(html, /access\.reason !== "missing_member_id"/);
  assert.match(html, /if \(!memberId && !token\) return null/);
});

test('do-next strip no longer blind-calls whoami', () => {
  const fs = require('fs');
  const html = fs.readFileSync(
    new URL('../Squarespace Snippets/academy-do-next-strip-squarespace-snippet-v1.html', import.meta.url),
    'utf8'
  );
  assert.match(html, /v1\.3\.75 — COST FIX/);
  assert.doesNotMatch(html, /fetch\(WHOAMI_URL, \{ credentials: "include" \}\)/);
  assert.match(html, /if \(!memberId && !token\) return null/);
});
