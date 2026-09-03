# syntax=docker/dockerfile:1.7

ARG BASE_IMAGE=ubuntu:24.04@sha256:1e0a86e57d247923571b75e0aaf48a1449cf8c543d51fb3e07a4a7d7bfa79316
FROM ${BASE_IMAGE}

ARG UBUNTU_SNAPSHOT=20260831T000000Z

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

WORKDIR /vercel/sandbox
USER vercel-sandbox
