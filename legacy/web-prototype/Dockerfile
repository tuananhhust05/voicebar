FROM node:22-slim

# Claude Code CLI chạy bên trong container
RUN npm install -g @anthropic-ai/claude-code && npm cache clean --force

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY server.js ./
COPY views ./views
COPY public ./public

# Chạy bằng user thường; ~/.claude được gắn volume để giữ lịch sử phiên
RUN mkdir -p /app/workspace /home/node/.claude && chown -R node:node /app/workspace /home/node/.claude
USER node
ENV NODE_ENV=production \
    PORT=3000 \
    HOME=/home/node \
    CLAUDE_WORKDIR=/app/workspace \
    DISABLE_AUTOUPDATER=1

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
