/* eslint-disable */
//
// negotiation-finalize.spec.js — auto-finalize stub behaviour for the
// negotiation tab. Mirrors src/main.py:128-189 (NegotiationProcess shape +
// auto-finalisation logic).
//

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

function createNegotiation(body, store) {
    if (!body.counterparty || !body.offerId) {
        return { statusCode: 422, body: { detail: 'counterparty and offerId are required' } };
    }
    const now = new Date().toISOString();
    const negId = 'neg-' + crypto.randomBytes(6).toString('hex');
    const agrId = 'agr-' + crypto.randomBytes(6).toString('hex');
    const negotiation = {
        id: negId,
        state: 'FINALIZED',
        agreementId: agrId,
        offerId: body.offerId,
        counterparty: body.counterparty,
        createdAt: now,
        updatedAt: now,
    };
    store[negId] = negotiation;
    return { statusCode: 202, body: { negotiationId: negId } };
}

function getNegotiation(id, store) {
    const found = store[id];
    if (!found) return { statusCode: 404, body: { detail: 'Negotiation ' + id + ' not found' } };
    return { statusCode: 200, body: found };
}

function terminateNegotiation(id, store) {
    const neg = store[id];
    if (!neg) return { statusCode: 404, body: { detail: 'Negotiation ' + id + ' not found' } };
    const now = new Date().toISOString();
    const terminated = Object.assign({}, neg, { state: 'TERMINATED', updatedAt: now });
    store[id] = terminated;
    return { statusCode: 200, body: terminated };
}

test('create requires counterparty + offerId (422 otherwise)', () => {
    const r = createNegotiation({}, {});
    assert.equal(r.statusCode, 422);
});

test('create returns 202 + negotiationId matching neg-[0-9a-f]{12}', () => {
    const r = createNegotiation({ counterparty: 'did:web:c.example', offerId: 'offer:x' }, {});
    assert.equal(r.statusCode, 202);
    assert.match(r.body.negotiationId, /^neg-[0-9a-f]{12}$/);
});

test('GET shows state=FINALIZED with agreementId matching agr-[0-9a-f]{12}', () => {
    const store = {};
    const created = createNegotiation({ counterparty: 'c', offerId: 'o' }, store);
    const fetched = getNegotiation(created.body.negotiationId, store);
    assert.equal(fetched.statusCode, 200);
    assert.equal(fetched.body.state, 'FINALIZED');
    assert.match(fetched.body.agreementId, /^agr-[0-9a-f]{12}$/);
});

test('GET unknown returns 404', () => {
    const r = getNegotiation('neg-nonexistent', {});
    assert.equal(r.statusCode, 404);
});

test('terminate flips state to TERMINATED and refreshes updatedAt', () => {
    const store = {};
    const created = createNegotiation({ counterparty: 'c', offerId: 'o' }, store);
    // Force a clock gap to make the updatedAt diff observable. The handler
    // uses `new Date().toISOString()` which has millisecond resolution, so
    // immediate-back-to-back calls within the same millisecond would tie.
    const before = store[created.body.negotiationId];
    const earlier = new Date(Date.parse(before.createdAt) - 1000).toISOString();
    store[created.body.negotiationId] = Object.assign({}, before, {
        createdAt: earlier, updatedAt: earlier
    });
    const term = terminateNegotiation(created.body.negotiationId, store);
    assert.equal(term.statusCode, 200);
    assert.equal(term.body.state, 'TERMINATED');
    assert.notEqual(term.body.updatedAt, term.body.createdAt);
});

test('two consecutive creates produce unique IDs', () => {
    const store = {};
    const a = createNegotiation({ counterparty: 'c', offerId: 'o' }, store);
    const b = createNegotiation({ counterparty: 'c', offerId: 'o' }, store);
    assert.notEqual(a.body.negotiationId, b.body.negotiationId);
});

test('agreementId differs from negotiationId (separate uuid4 hex)', () => {
    const store = {};
    const created = createNegotiation({ counterparty: 'c', offerId: 'o' }, store);
    const fetched = getNegotiation(created.body.negotiationId, store);
    assert.notEqual(
        fetched.body.id.replace(/^neg-/, ''),
        fetched.body.agreementId.replace(/^agr-/, '')
    );
});
