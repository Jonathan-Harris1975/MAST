FROM node:26.8-alpine3.24@sha256:ef24c5053d50fdc3e4e56eb4e7ddb7861874ab0fdc797046ba897581deb8e868 AS runtime

ENV NODE_ENV=production \
    APP_ENV=production \
    WEB_CONCURRENCY=1 \
    PORT=8000
WORKDIR /app

RUN addgroup -S mast && adduser -S -G mast mast
COPY --chown=mast:mast package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY --chown=mast:mast src ./src
COPY --chown=mast:mast README.md ./README.md

USER mast
EXPOSE 8000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8000)+'/livez').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
