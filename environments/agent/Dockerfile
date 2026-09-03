# syntax=docker/dockerfile:1.7

ARG BASE_IMAGE=ubuntu:24.04@sha256:1e0a86e57d247923571b75e0aaf48a1449cf8c543d51fb3e07a4a7d7bfa79316
FROM ${BASE_IMAGE}

ARG UBUNTU_SNAPSHOT=20260831T000000Z
ARG NODE_VERSION=24.20.0
ARG NODE_SHA256=2f2c0da162318f0de47665410c7c8c2ed3d36c8f3105de4bbc61176c70a7cbf2
ARG PNPM_VERSION=11.25.0
ARG GH_VERSION=2.99.0
ARG GH_SHA256=ed4960225d2833e04a61590d9fa2b5773d147f3aa375459e5466a40c102f3832
ARG CODEX_VERSION=0.153.0

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

LABEL org.opencontainers.image.title="sandboxed-cli-agent" \
      org.opencontainers.image.description="Reproducible Vercel Sandbox environment for user-owned coding agents" \
      org.opencontainers.image.source="https://github.com/aaravbangsmetal/sandboxedCLI"

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates \
    && sed -i \
      -e "s|http://archive.ubuntu.com/ubuntu/|https://snapshot.ubuntu.com/ubuntu/${UBUNTU_SNAPSHOT}/|g" \
      -e "s|http://security.ubuntu.com/ubuntu/|https://snapshot.ubuntu.com/ubuntu/${UBUNTU_SNAPSHOT}/|g" \
      /etc/apt/sources.list.d/ubuntu.sources \
    && apt-get update \
    && apt-get install --yes --no-install-recommends curl sudo \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 vercel-sandbox \
    && useradd --uid 10001 --gid 10001 --create-home --shell /bin/bash vercel-sandbox \
    && printf 'vercel-sandbox ALL=(ALL) NOPASSWD:ALL\n' > /etc/sudoers.d/vercel-sandbox \
    && chmod 0440 /etc/sudoers.d/vercel-sandbox \
    && install -d -o vercel-sandbox -g vercel-sandbox /vercel/sandbox

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
      bash-completion \
      build-essential \
      dnsutils \
      fd-find \
      file \
      git \
      git-lfs \
      iproute2 \
      jq \
      less \
      libssl-dev \
      lsof \
      nano \
      netcat-openbsd \
      openssh-client \
      patch \
      pkg-config \
      procps \
      python3 \
      python3-dev \
      python3-pip \
      python3-venv \
      ripgrep \
      rsync \
      shellcheck \
      sqlite3 \
      tmux \
      tree \
      unzip \
      vim-tiny \
      xz-utils \
      zip \
    && ln -s /usr/bin/fdfind /usr/local/bin/fd \
    && ln -s /usr/bin/python3 /usr/local/bin/python \
    && git lfs install --system \
    && rm -rf /var/lib/apt/lists/*

RUN curl --fail --silent --show-error --location \
      "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
      --output /tmp/node.tar.xz \
    && printf '%s  %s\n' "${NODE_SHA256}" /tmp/node.tar.xz | sha256sum --check --strict \
    && tar --extract --xz --file /tmp/node.tar.xz --directory /usr/local --strip-components=1 \
    && rm /tmp/node.tar.xz \
    && test "$(node --version)" = "v${NODE_VERSION}"

RUN npm install --global --no-audit --no-fund "pnpm@${PNPM_VERSION}" \
    && test "$(pnpm --version)" = "${PNPM_VERSION}" \
    && npm cache clean --force

RUN curl --fail --silent --show-error --location \
      "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz" \
      --output /tmp/gh.tar.gz \
    && printf '%s  %s\n' "${GH_SHA256}" /tmp/gh.tar.gz | sha256sum --check --strict \
    && tar --extract --gzip --file /tmp/gh.tar.gz --directory /tmp \
    && install -m 0755 "/tmp/gh_${GH_VERSION}_linux_amd64/bin/gh" /usr/local/bin/gh \
    && rm -rf /tmp/gh.tar.gz "/tmp/gh_${GH_VERSION}_linux_amd64" \
    && test "$(gh --version | awk 'NR == 1 { print $3 }')" = "${GH_VERSION}"

RUN npm install --global --include=optional --no-audit --no-fund "@openai/codex@${CODEX_VERSION}" \
    && codex --version | grep --fixed-strings "${CODEX_VERSION}" \
    && npm cache clean --force

WORKDIR /vercel/sandbox
USER vercel-sandbox
