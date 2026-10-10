# Tasks

Paths are under `tab-recap/` unless stated otherwise. Each implementation group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.

## 1. Assign the ladder to each window source

- [x] 1.1 Carry each size ladder on its typed `WindowBasis` and remove the global ladder from `ContextWindows` and `contextOf`.
- [x] 1.2 Keep the Claude ladder and give Codex, OpenCode, and unregistered sources exact peak behavior.
- [x] 1.3 Preserve all existing assertions except the over-window cases intentionally covered by the new behavior.
- [x] 1.4 Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 2. Specify the changed behavior

- [x] 2.1 Modify the existing context-window requirement with per-kind scenarios.
- [x] 2.2 Run strict OpenSpec validation from the repository root.
- [x] 2.3 Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 3. Archive

- [x] 3.1 Archive `window-ladder-per-kind` in this change after all tasks and gates pass.
