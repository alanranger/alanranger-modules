import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { acceptedIncludes, normalizeAddr } = require('../lib/sendLifecycleMail');

test('acceptedIncludes matches the primary recipient case-insensitively', () => {
  assert.equal(acceptedIncludes(['Dave@Outlook.com'], 'dc@outlook.com'), false);
  assert.equal(acceptedIncludes(['dc@outlook.com'], 'DC@Outlook.com'), true);
  assert.equal(acceptedIncludes(['info@alanranger.com', 'stayintouch9@gmail.com'], 'stayintouch9@gmail.com'), true);
});

test('acceptedIncludes rejects an empty accepted list — the phantom-send case', () => {
  // A resolved nodemailer call with only a local messageId and no accepted
  // recipient must not be logged as sent.
  assert.equal(acceptedIncludes([], 'stayintouch9@gmail.com'), false);
  assert.equal(acceptedIncludes(null, 'stayintouch9@gmail.com'), false);
});

test('normalizeAddr trims and lowercases', () => {
  assert.equal(normalizeAddr('  Foo@Bar.COM '), 'foo@bar.com');
});
