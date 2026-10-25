import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePublicText, ValidationError } from '../lib/moderation.js';

test('normal names and costume descriptions survive moderation', () => {
  for (const text of ['Alex', 'Cassidy', 'Classic ghost', 'Headless horseman', 'Mothman', 'A haunted Clemson tiger', 'Vampire rock star']) {
    assert.equal(validatePublicText(text, { label: 'Costume', max: 64 }), text);
  }
  assert.equal(validatePublicText('  Alex   Tiger  ', { label: 'Name' }), 'Alex Tiger');
});

test('profanity is rejected on the server including common evasions', () => {
  for (const text of ['fuck', 'f.u.c.k', 'f u c k', 'fuuuuuck', 'sh1t', 's.h.1.t', 'f**k', 'f*ck', 'fuсk', 'ＦＵＣＫ']) {
    assert.throws(() => validatePublicText(text, { label: 'Costume' }),
      error => error instanceof ValidationError && error.code === 'profanity', text);
  }
});

test('public text rejects missing, oversized, control-only or hidden text', () => {
  for (const text of [null, {}, '', ' '.repeat(20), 'x'.repeat(49), '!!!', 'f\u200Buck', 'hello\u202Eworld']) {
    assert.throws(() => validatePublicText(text, { label: 'Text' }), ValidationError);
  }
});
