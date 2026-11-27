#!/usr/bin/env node
// Runs one of the connector's flows outside ORCE, for local checks against a
// real W-Stack: function nodes run through the test harness
// (orce/tests/harness/run-node.js, the same sandbox as the flow specs), http
// request nodes make the real HTTP call, link in/out and http in/response
// nodes pass the message on. The global context is shared between runs of one
// process (nonce and DID caches, as in one ORCE).
//
// As a module: const { run } = require('./flow-run.js');
//   const msg = await run('facis-dsp-iam-verify.json', 'dsp-iam-prep', msg, env);
// Not a deployment tool: local checks only.
const fs = require('fs');
const path = require('path');
const { runNode } = require('../orce/tests/harness/run-node.js');

const FLOWS = path.join(__dirname, '..', 'orce', 'flows');
const globalCtx = new Map();

function load(flowFile) {
    const nodes = JSON.parse(fs.readFileSync(path.join(FLOWS, flowFile), 'utf8'));
    return new Map(nodes.map((n) => [n.id, n]));
}

async function http(n, msg) {
    const method = (n.method === 'use' ? msg.method : n.method || 'GET').toUpperCase();
    const headers = Object.assign({}, msg.headers || {});
    let body;
    if (!['GET', 'HEAD'].includes(method) && msg.payload !== undefined && msg.payload !== '') {
        body = typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload);
    }
    const r = await fetch(msg.url, { method, headers, body, redirect: 'manual' });
    const text = await r.text();
    msg.statusCode = r.status;
    msg.payload = text;
    if (n.ret === 'obj') { try { msg.payload = JSON.parse(text); } catch (e) { /* stays text, as in Node-RED */ } }
    return msg;
}

// Runs from startId until a link out (return) or http response; returns the msg.
async function run(flowFile, startId, msg, env, opts = {}) {
    const nodes = load(flowFile);
    let id = startId;
    for (let hops = 0; hops < 200; hops++) {
        const n = nodes.get(id);
        if (!n) throw new Error(flowFile + ': no node ' + id);
        if (opts.trace) console.error('  ' + n.type + ' ' + (n.name || n.id));
        let next = null;
        if (n.type === 'function') {
            const r = await runNode(path.join(FLOWS, flowFile), id, { msg, env, globalCtx });
            if (r.errors.length) throw new Error(id + ': ' + r.errors.join('; '));
            const outs = r.sent.length ? (Array.isArray(r.sent[0]) ? r.sent[0] : [r.sent[0]]) : (Array.isArray(r.result) ? r.result : [r.result]);
            const port = outs.findIndex((m) => m);
            if (port < 0) return null;
            msg = outs[port];
            next = (n.wires[port] || [])[0];
        } else if (n.type === 'http request') {
            msg = await http(n, msg);
            next = n.wires[0][0];
        } else if (n.type === 'link out' || n.type === 'http response') {
            return msg;
        } else {
            next = (n.wires && n.wires[0] && n.wires[0][0]) || null;
        }
        if (!next) return msg;
        id = next;
    }
    throw new Error(flowFile + ': too many hops from ' + startId);
}

module.exports = { run, globalCtx };
