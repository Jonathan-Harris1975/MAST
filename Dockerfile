FROM node:22.23.2-alpine3.24@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85 AS runtime

ENV NODE_ENV=production \
    APP_ENV=production \
    WEB_CONCURRENCY=1 \
    PORT=8000
WORKDIR /app

# Pull fixed Alpine packages into the otherwise digest-pinned runtime image.
# This keeps the Node runtime pinned while ensuring fixable OS CVEs are not
# inherited indefinitely from the base-image snapshot.
RUN apk upgrade --no-cache \
    && addgroup -S mast \
    && adduser -S -G mast mast
COPY --chown=mast:mast package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    # npm is only required to install dependencies. The npm 10.9.8 bundled with
    # Node 22.23.2 contains a vulnerable transitive tar package, so do not ship
    # the package manager in the production image.
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx
COPY --chown=mast:mast src ./src
COPY --chown=mast:mast README.md ./README.md

USER mast
EXPOSE 8000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8000)+'/livez').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
