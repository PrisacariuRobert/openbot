FROM node:22-bookworm-slim

ARG OPENCODE_VERSION=1.18.28

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates chromium docker.io git openssh-client ripgrep tini \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global "opencode-ai@${OPENCODE_VERSION}"

ENV NODE_ENV=production \
    HOME=/srv/openbot/home \
    XDG_CONFIG_HOME=/srv/openbot/home/.config \
    XDG_DATA_HOME=/srv/openbot/home/.local/share \
    XDG_CACHE_HOME=/srv/openbot/home/.cache \
    OPENBOT_CHROME_PATH=/usr/bin/chromium \
    OPENBOT_CHROME_NO_SANDBOX=1

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build \
  && npm prune --omit=dev \
  && mkdir -p /srv/openbot/data /srv/openbot/home /srv/openbot/projects \
  && chown -R node:node /srv/openbot

USER node
EXPOSE 4311
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "start"]
