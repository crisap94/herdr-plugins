#!/bin/sh
here=$(dirname "$(readlink -f "$0")")
bin="$here/../node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex"
if [ "$1" = "exec" ]; then
  shift
  exec "$bin" exec --ephemeral --ignore-user-config "$@"
fi
exec "$bin" "$@"
