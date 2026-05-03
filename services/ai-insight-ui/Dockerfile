# FACIS AI Insight UI — Multi-stage build
#
# DEPRECATED FOR PRODUCTION as of 2026-04-29.
# The production deployment serves the Vue SPA via uibuilder inside the
# existing ORCE pod (see docs/deployment/orce-native-runbook.md). This
# Dockerfile + the helm chart's standalone-Nginx variant are kept ONLY
# for local development. Do not deploy the resulting image to the IONOS
# cluster.

FROM node:22-alpine AS builder
WORKDIR /app
COPY ui/app/package.json ui/app/package-lock.json* ./
RUN npm ci --ignore-scripts
COPY ui/app/ ./
# Force cache bust for every build
ARG CACHE_BUST=1
RUN echo "Build: $CACHE_BUST" && npm run build

FROM nginx:1.27-alpine
LABEL org.opencontainers.image.title="facis-ai-insight-ui" \
      org.opencontainers.image.description="FACIS IoT & AI Enterprise Platform UI" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.licenses="Apache-2.0"

# Write unprivileged nginx config (pid, temp dirs, and SPA routing)
RUN cat > /etc/nginx/nginx.conf <<'NGINX'
worker_processes auto;
pid /tmp/nginx.pid;
error_log /var/log/nginx/error.log warn;

events { worker_connections 1024; }

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    sendfile      on;
    keepalive_timeout 65;
    client_body_temp_path /tmp/client_temp;
    proxy_temp_path       /tmp/proxy_temp;
    fastcgi_temp_path     /tmp/fastcgi_temp;
    uwsgi_temp_path       /tmp/uwsgi_temp;
    scgi_temp_path        /tmp/scgi_temp;
    access_log /var/log/nginx/access.log;

    server {
        listen 8080;
        root /usr/share/nginx/html;
        index index.html;

        location / {
            try_files $uri $uri/ /index.html;
        }
        location /assets/ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }

        # Proxy to Simulation service — strips /api/sim prefix
        location /api/sim/ {
            proxy_pass http://facis-simulation.facis.svc.cluster.local:8080/api/v1/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_read_timeout 30s;
        }

        # Proxy to AI Insight service — strips /api/ai prefix
        location /api/ai/ {
            proxy_pass http://facis-ai-insight.facis.svc.cluster.local:8080/api/v1/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_read_timeout 30s;
        }
    }
}
NGINX

COPY --from=builder /app/dist /usr/share/nginx/html

# Ensure nginx user can write logs and tmp
RUN chown -R nginx:nginx /usr/share/nginx/html /var/log/nginx && \
    chmod -R 755 /var/log/nginx

USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:8080/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
