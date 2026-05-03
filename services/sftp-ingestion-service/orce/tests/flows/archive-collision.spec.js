/* eslint-disable */
//
// archive-collision.spec.js — sftp.rename collision handling.
// Handler under test: archiveOne() inside sftp-fn-cycle of facis-sftp-poller.json.
// Mirrors sftp_poller.py:175-180 (try rename, OSError → retry with timestamp suffix).
//

const test = require('node:test');
const assert = require('node:assert/strict');

// Fake SFTP client: rename throws if the target exists in `existing` set.
class FakeSftp {
    constructor(existing = new Set()) {
        this.existing = existing;
        this.calls = [];
    }
    async rename(src, dst) {
        this.calls.push({ src, dst });
        if (this.existing.has(dst)) throw new Error('EEXIST: ' + dst);
        this.existing.add(dst);
    }
}

async function archiveOne(client, remoteFile, archiveFile, nowFn) {
    try {
        await client.rename(remoteFile, archiveFile);
        return null;
    } catch (e) {
        const ts = nowFn().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
        try {
            await client.rename(remoteFile, archiveFile + '.' + ts);
            return null;
        } catch (e2) {
            return e2;
        }
    }
}

test('first attempt succeeds when target does not exist', async () => {
    const c = new FakeSftp();
    const err = await archiveOne(c, '/in/a.json', '/arc/a.json', () => new Date('2026-04-07T12:00:00Z'));
    assert.equal(err, null);
    assert.equal(c.calls.length, 1);
    assert.equal(c.calls[0].dst, '/arc/a.json');
});

test('collision retries with timestamp suffix YYYYMMDDHHMMSS', async () => {
    const c = new FakeSftp(new Set(['/arc/a.json']));
    const err = await archiveOne(c, '/in/a.json', '/arc/a.json', () => new Date('2026-04-07T12:34:56Z'));
    assert.equal(err, null);
    assert.equal(c.calls.length, 2);
    assert.equal(c.calls[1].dst, '/arc/a.json.20260407123456');
});

test('double collision (both target + timestamp suffix exist) → returns error', async () => {
    const c = new FakeSftp(new Set(['/arc/a.json', '/arc/a.json.20260407123456']));
    const err = await archiveOne(c, '/in/a.json', '/arc/a.json', () => new Date('2026-04-07T12:34:56Z'));
    assert.notEqual(err, null);
    assert.match(err.message, /EEXIST/);
});

test('timestamp suffix is exactly 14 chars (YYYYMMDDHHMMSS)', () => {
    const ts = new Date('2026-04-07T12:34:56Z').toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    assert.equal(ts.length, 14);
    assert.match(ts, /^\d{14}$/);
});
