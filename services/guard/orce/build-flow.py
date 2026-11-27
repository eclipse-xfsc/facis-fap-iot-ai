#!/usr/bin/env python3
"""Builds the guard's login provider flow from its sources.

The function-node bodies live as plain JavaScript in src/<node id>.js, so they
can be read, diffed and linted; this script wires them into the flow JSON that
ORCE loads (flows/facis-guard-login.json) and copies it into the chart
(helm/facis-guard/files/orce-flows/). Edit src/ and the wiring below, never the
JSON, then run this script and commit all three.

Usage: build-flow.py            write the flow and the chart's copy
       build-flow.py --check    exit 1 if either differs from the sources (CI)
"""
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE / "src"
OUT = HERE / "flows" / "facis-guard-login.json"
CHART_COPY = HERE / "../helm/facis-guard/files/orce-flows/facis-guard-login.json"
TAB = "guard-tab"

nodes = []


# The FACIS logo, embedded in the pages' look (src/guard-brand.js): the UI's own.
LOGO = HERE / "../../ai-insight-ui/ui/app/public/facis-logo.svg"


def logo_data_uri():
    import base64
    return "data:image/svg+xml;base64," + base64.b64encode(LOGO.read_bytes()).decode()


def fn(nid, name, outputs, wires, x, y, libs=()):
    func = (SRC / (nid + ".js")).read_text()
    if "__FACIS_LOGO_DATA_URI__" in func:
        func = func.replace("__FACIS_LOGO_DATA_URI__", logo_data_uri())
    nodes.append({
        "id": nid, "type": "function", "z": TAB, "name": name,
        "func": func,
        "outputs": outputs, "timeout": 0, "noerr": 0, "initialize": "", "finalize": "",
        "libs": [{"var": l, "module": l} for l in libs],
        "x": x, "y": y, "wires": wires,
    })


def http_in(nid, name, url, method, wire, x, y):
    nodes.append({"id": nid, "type": "http in", "z": TAB, "name": name, "url": url, "method": method,
                  "upload": False, "swaggerDoc": "", "x": x, "y": y, "wires": [[wire]]})


def http_req(nid, name, ret, wire, x, y):
    nodes.append({"id": nid, "type": "http request", "z": TAB, "name": name, "method": "use", "ret": ret,
                  "paytoqs": "ignore", "url": "", "tls": "", "persist": False, "proxy": "",
                  "insecureHTTPParser": False, "authType": "", "senderr": False, "headers": [],
                  "x": x, "y": y, "wires": [[wire]]})


def http_resp(nid, name, x, y):
    nodes.append({"id": nid, "type": "http response", "z": TAB, "name": name, "statusCode": "",
                  "headers": {}, "x": x, "y": y, "wires": []})


nodes.append({
    "id": TAB, "type": "tab", "label": "Guard: login provider", "disabled": False,
    "info": "Login and consent provider of the guard (the authorization server is Ory Hydra).\n\n"
            "Wallet login: the authorization server sends the browser to /guard/login; the page shows the "
            "presentation request of the credential verifier (QR code, same-device link, web wallets); "
            "/guard/login/status checks the stored presentation, the status list and the login policy, then "
            "accepts the login. /guard/consent puts the verified claims into the tokens; /guard/logout ends "
            "the session. Configuration: GUARD_* environment variables, see services/guard/README.md.",
})

# start-up: configuration
nodes.append({"id": "guard-config-inject", "type": "inject", "z": TAB, "name": "on start", "props": [],
              "repeat": "", "crontab": "", "once": True, "onceDelay": "0.1", "topic": "",
              "x": 130, "y": 60, "wires": [["guard-config", "guard-brand"]]})
fn("guard-config", "configuration", 0, [], 330, 60, libs=("url",))
fn("guard-brand", "look of the pages (FACIS logo, styles)", 0, [], 330, 100)

# login: page
http_in("guard-in-login", "GET /guard/login", "/guard/login", "get", "guard-login-start", 140, 140)
fn("guard-login-start", "login: check challenge, lockout", 2, [["guard-req-login"], ["guard-error-page"]], 380, 140)
http_req("guard-req-login", "authorization server: login request", "obj", "guard-login-request", 650, 140)
fn("guard-login-request", "login: client allowed, create request", 2, [["guard-req-create"], ["guard-error-page"]], 380, 200)
http_req("guard-req-create", "verifier: create request", "obj", "guard-verifier-created", 650, 200)
fn("guard-verifier-created", "login: fetch request object", 2, [["guard-req-ro"], ["guard-error-page"]], 380, 260)
http_req("guard-req-ro", "verifier: request object", "txt", "guard-attempt-create", 650, 260)
fn("guard-attempt-create", "login: attempt and page", 2, [["guard-resp-page"], ["guard-error-page"]], 380, 320,
   libs=("crypto", "qrcode", "url"))
http_resp("guard-resp-page", "login page", 650, 320)
fn("guard-error-page", "error page", 1, [["guard-resp-error"]], 900, 230)
http_resp("guard-resp-error", "error page", 1080, 230)

# login: status polling and decision
http_in("guard-in-status", "GET /guard/login/status", "/guard/login/status", "get", "guard-status-start", 160, 420)
fn("guard-status-start", "status: attempt", 2, [["guard-req-record"], ["guard-resp-json"]], 380, 420)
http_req("guard-req-record", "verifier: stored presentation", "obj", "guard-status-record", 650, 420)
fn("guard-status-record", "status: check presentation", 3,
   [["guard-req-status"], ["guard-refuse"], ["guard-resp-json"]], 380, 480, libs=("crypto", "url"))
http_req("guard-req-status", "issuer: status list", "txt", "guard-status-list", 650, 480)
fn("guard-status-list", "status: not revoked", 2, [["guard-req-policy"], ["guard-refuse"]], 380, 540, libs=("zlib",))
http_req("guard-req-policy", "policy engine: facis.login", "obj", "guard-policy-decision", 650, 540)
fn("guard-policy-decision", "status: policy, accept login", 2, [["guard-req-accept"], ["guard-refuse"]], 380, 600)
http_req("guard-req-accept", "authorization server: accept login", "obj", "guard-login-accepted", 650, 600)
fn("guard-login-accepted", "status: done", 1, [["guard-resp-json"]], 380, 660)
fn("guard-refuse", "status: refused, lockout", 1, [["guard-resp-json"]], 900, 540)
http_resp("guard-resp-json", "JSON", 1080, 480)

# consent and logout
http_in("guard-in-consent", "GET /guard/consent", "/guard/consent", "get", "guard-consent-start", 150, 760)
fn("guard-consent-start", "consent: challenge", 2, [["guard-req-consent"], ["guard-error-page"]], 380, 760)
http_req("guard-req-consent", "authorization server: consent request", "obj", "guard-consent-accept", 650, 760)
fn("guard-consent-accept", "consent: first-party, claims", 2, [["guard-req-consent-accept"], ["guard-error-page"]], 380, 820)
http_req("guard-req-consent-accept", "authorization server: accept consent", "obj", "guard-redirect", 650, 820)
http_in("guard-in-logout", "GET /guard/logout", "/guard/logout", "get", "guard-logout-start", 150, 880)
fn("guard-logout-start", "logout: accept", 2, [["guard-req-logout"], ["guard-error-page"]], 380, 880)
http_req("guard-req-logout", "authorization server: accept logout", "obj", "guard-redirect", 650, 880)
fn("guard-redirect", "redirect", 2, [["guard-resp-redirect"], ["guard-error-page"]], 900, 850)
http_resp("guard-resp-redirect", "redirect", 1080, 850)

http_in("guard-in-error", "GET /guard/error", "/guard/error", "get", "guard-error-landing", 150, 940)
fn("guard-error-landing", "authorization server error", 1, [["guard-error-page"]], 380, 940)

# administration and health (cluster-internal: not routed by the ingress)
http_in("guard-in-admin-list", "GET /guard/admin/lockouts", "/guard/admin/lockouts", "get", "guard-admin-lockouts", 170, 980)
http_in("guard-in-admin-lift", "DELETE /guard/admin/lockouts", "/guard/admin/lockouts", "delete", "guard-admin-lockouts", 170, 1030)
fn("guard-admin-lockouts", "lockouts: list, lift", 1, [["guard-resp-json"]], 420, 1000, libs=("crypto",))
http_in("guard-in-health", "GET /guard/health", "/guard/health", "get", "guard-health", 140, 1090)
fn("guard-health", "health", 1, [["guard-resp-json"]], 380, 1090)

ids = [n["id"] for n in nodes]
assert len(ids) == len(set(ids)), "duplicate node ids"
for n in nodes:
    for out in n.get("wires", []):
        for w in out:
            assert w in ids, "%s wires to unknown node %s" % (n["id"], w)
    if n["type"] == "function":
        assert len(n["wires"]) == n["outputs"], "%s: %d outputs, %d wire lists" % (n["id"], n["outputs"], len(n["wires"]))

text = json.dumps(nodes, indent=2, ensure_ascii=False) + "\n"
if sys.argv[1:] == ["--check"]:
    stale = [str(p.resolve().relative_to(HERE.parent.parent.parent.resolve())) for p in (OUT, CHART_COPY)
             if not p.exists() or p.read_text() != text]
    if stale:
        print("out of date with src/ (run services/guard/orce/build-flow.py): " + ", ".join(stale), file=sys.stderr)
        sys.exit(1)
    print("flow and chart copy match src/ (%d nodes)" % len(nodes))
    sys.exit(0)
if sys.argv[1:]:
    sys.exit(__doc__)
for p in (OUT, CHART_COPY):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)
print("wrote %s and the chart's copy (%d nodes)" % (OUT.relative_to(HERE), len(nodes)))
