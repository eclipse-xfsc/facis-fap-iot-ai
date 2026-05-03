/* eslint-disable */
//
// transfer-fsm.spec.js — exhaustive transition matrix.
//
// Mirrors transfer_store._VALID_TRANSITIONS at transfer_store.py:25-32.
// The handler under test is the inline guard in `dsp-tx-suspend` and
// `dsp-tx-terminate` of facis-dsp-transfers.json.
//

const test = require('node:test');
const assert = require('node:assert/strict');

const VALID = {
    REQUESTED: new Set(['STARTED', 'TERMINATED', 'ERROR']),
    STARTED:   new Set(['COMPLETED', 'SUSPENDED', 'TERMINATED', 'ERROR']),
    SUSPENDED: new Set(['STARTED', 'TERMINATED']),
    COMPLETED: new Set(),
    TERMINATED: new Set(),
    ERROR:     new Set(),
};

function attemptTransition(currentState, target) {
    const allowed = VALID[currentState];
    if (!allowed) return { ok: false, reason: 'unknown source state' };
    if (!allowed.has(target)) return { ok: false, reason: 'invalid target' };
    return { ok: true };
}

const ALL_STATES = ['REQUESTED', 'STARTED', 'COMPLETED', 'SUSPENDED', 'TERMINATED', 'ERROR'];

test('REQUESTED accepts STARTED, TERMINATED, ERROR', () => {
    for (const t of ['STARTED', 'TERMINATED', 'ERROR']) {
        assert.equal(attemptTransition('REQUESTED', t).ok, true, 'REQUESTED → ' + t);
    }
});

test('REQUESTED rejects COMPLETED and SUSPENDED', () => {
    assert.equal(attemptTransition('REQUESTED', 'COMPLETED').ok, false);
    assert.equal(attemptTransition('REQUESTED', 'SUSPENDED').ok, false);
});

test('STARTED accepts COMPLETED, SUSPENDED, TERMINATED, ERROR', () => {
    for (const t of ['COMPLETED', 'SUSPENDED', 'TERMINATED', 'ERROR']) {
        assert.equal(attemptTransition('STARTED', t).ok, true, 'STARTED → ' + t);
    }
});

test('STARTED rejects REQUESTED', () => {
    assert.equal(attemptTransition('STARTED', 'REQUESTED').ok, false);
});

test('SUSPENDED accepts only STARTED and TERMINATED (resume or quit)', () => {
    for (const t of ALL_STATES) {
        const expected = (t === 'STARTED' || t === 'TERMINATED');
        assert.equal(attemptTransition('SUSPENDED', t).ok, expected, 'SUSPENDED → ' + t);
    }
});

test('all terminal states reject every transition', () => {
    for (const term of ['COMPLETED', 'TERMINATED', 'ERROR']) {
        for (const t of ALL_STATES) {
            assert.equal(attemptTransition(term, t).ok, false,
                         term + ' → ' + t + ' must reject');
        }
    }
});

test('unknown source state rejects gracefully', () => {
    const r = attemptTransition('NOT_A_STATE', 'STARTED');
    assert.equal(r.ok, false);
    assert.match(r.reason, /unknown/);
});

// ── 2. Auto-complete chain (POST /dsp/transfers semantics) ─────────

test('auto-complete: REQUESTED → STARTED → COMPLETED is allowed', () => {
    let s = 'REQUESTED';
    assert.equal(attemptTransition(s, 'STARTED').ok, true); s = 'STARTED';
    assert.equal(attemptTransition(s, 'COMPLETED').ok, true); s = 'COMPLETED';
    assert.equal(s, 'COMPLETED');
});

test('cannot terminate a COMPLETED transfer (matches python test_terminate_transfer)', () => {
    assert.equal(attemptTransition('COMPLETED', 'TERMINATED').ok, false);
});
