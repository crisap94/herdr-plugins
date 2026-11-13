#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
git clone --quiet "$ROOT" "$work/checkout"
cd "$work/checkout/tab-recap"
bun install --frozen-lockfile --production
[ ! -e node_modules/oxlint ] || { echo "install-smoke: 1 — a production install brought a dev tool (oxlint)" >&2; exit 1; }
HERDR_PLUGIN_STATE_DIR="$work/state" HERDR_PLUGIN_CONFIG_DIR="$work/config" bun bin/tab-recap.mjs status
echo "install-smoke: ok ($(git -C "$work/checkout" rev-parse --short HEAD))"
