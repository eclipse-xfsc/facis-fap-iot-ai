FROM ecofacis/xfsc-orce:2.0.3

USER root

# Fix node-gyp compatibility with Node 20.19.
RUN npm install -g npm@latest

# ── Bundle exported flows for runtime bootstrap ──────────────────────
COPY flows /opt/ai-insight-flows

# ── Optional runtime bundle (.env + certs) for image-ready runs ─────
COPY runtime /opt/ai-insight-runtime

# ── Custom entrypoint ────────────────────────────────────────────────
COPY entrypoint.sh /usr/local/bin/entrypoint-ai-insight-orce.sh
RUN chmod +x /usr/local/bin/entrypoint-ai-insight-orce.sh

ENTRYPOINT ["/usr/local/bin/entrypoint-ai-insight-orce.sh"]

# Do NOT switch user here; the original ORCE entrypoint handles it.
