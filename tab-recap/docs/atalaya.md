# The atalaya flavour

The `atalaya` branch is `main` plus one extension, `src/extensions/atalaya-bridge.ts`, registered
by one import and one array entry in `src/extensions/index.ts`. Nothing else differs from `main`
(`ci/branch-guard.sh` enforces it against `ci/atalaya-files.txt`); changes flow `main → atalaya`, never back.

## What it adds

- **A note under each lane's header:** the lane's latest alert, `⚑ idle 2m ago · main · 2 unmerged · dirty`.
  The daemon reads `atalaya-log.jsonl` once: from byte 0 at start, then only what is appended (one watch on the
  bridge's directory; a half-written line waits for its newline; a shorter log starts it over) and puts each alert
  into the store as a **pane alert** (`source` `atalaya-bridge`). The columns draw it from the store and never read the log.
- **A warning above the lanes** when atalaya-bridge's heartbeat is older than 3 minutes
  ("atalaya-bridge silent for N min — healing" / "…sin señal desde hace N min…").
- **Heal**, on the daemon's 60 s tick: start `atalaya-bridge.service` when it is stale and not
  active — never restart a running one, at most once per 5 minutes.

It reads the bridge's files (`atalaya-log.jsonl`, `heartbeat`) and writes none of them. It loads
only when the bridge's state directory exists, so the branch is harmless on a machine without it.

## Vocabulary

| Term | Means | Is NOT |
| --- | --- | --- |
| **Alert** | A record atalaya-bridge appended to its outbox (`blocked`, `idle`, `done`, `closed_without_done`). Read-only here: the column shows the lane's latest alert as a **note**. | a notification we send |
| **Heal** | Starting `atalaya-bridge.service` when its heartbeat is stale. The one action taken on the bridge — it is the extension's **upkeep**. | restarting it |

*Lane* means the same here as in atalaya-bridge. Core terms (Extension, Note, Upkeep) are in `CONTEXT.md`.

## Configuration

See `config.atalaya.example.env`.

| key | default | |
| --- | --- | --- |
| `TAB_RECAP_BRIDGE_DIR` | `~/.local/state/atalaya-bridge` | the bridge's state dir; empty disables the extension (read at daemon/column start) |
| `TAB_RECAP_BRIDGE_HEAL` | `1` | `0` = never start the service (read on every tick) |

## Lingering

The heal runs `systemctl --user`, and herdr starts the daemon without the user session's environment, so the
extension fills in `XDG_RUNTIME_DIR=/run/user/<uid>` and `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/<uid>/bus`
when they are missing (values that are set are kept). That only works while the user's systemd manager is running:
on a machine where nobody is logged in, enable lingering once with `loginctl enable-linger <user>`.
