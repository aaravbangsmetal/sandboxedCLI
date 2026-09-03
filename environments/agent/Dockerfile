# syntax=docker/dockerfile:1.7

ARG BASE_IMAGE=ubuntu:24.04@sha256:1e0a86e57d247923571b75e0aaf48a1449cf8c543d51fb3e07a4a7d7bfa79316
FROM ${BASE_IMAGE}

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

LABEL org.opencontainers.image.title="sandboxed-cli-agent" \
      org.opencontainers.image.description="Reproducible Vercel Sandbox environment for user-owned coding agents" \
      org.opencontainers.image.source="https://github.com/aaravbangsmetal/sandboxedCLI"

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates curl sudo \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 vercel-sandbox \
    && useradd --uid 10001 --gid 10001 --create-home --shell /bin/bash vercel-sandbox \
    && printf 'vercel-sandbox ALL=(ALL) NOPASSWD:ALL\n' > /etc/sudoers.d/vercel-sandbox \
    && chmod 0440 /etc/sudoers.d/vercel-sandbox \
    && install -d -o vercel-sandbox -g vercel-sandbox /vercel/sandbox

WORKDIR /vercel/sandbox
USER vercel-sandbox
