# Tasks

Paths are under `tab-recap/` unless stated otherwise. Each group ends with `bash ci/lint.sh` and `bash ci/test.sh` passing.

## 1. Move context window knowledge to adapters

- [x] 1.1 Move Claude family recognition out of the domain and provide context-window functions for every registered kind.
- [x] 1.2 Inject the model catalogue into the Claude and OpenCode context-window functions and preserve current source priority.
- [x] 1.3 Keep the size ladder in the adapter layer and pass it into generic domain peak raising.
- [x] 1.4 Update lane contexts, experiment points, and context-window tests without changing pinned values.
- [x] 1.5 Verify no context-window Claude identifier or model-family expression remains in `tab-recap/src/recap/domain/compaction.ts`.
- [x] 1.6 Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 2. Specify the behavior

- [x] 2.1 Add the context-window requirement and source scenarios to `tab-recap/harness-adapters`.
- [x] 2.2 Record the design choice and retained catalogue dependency in this change's design.
- [x] 2.3 Run strict OpenSpec validation from the repository root.
- [x] 2.4 Run `bash ci/lint.sh` and `bash ci/test.sh` from `tab-recap/`.

## 3. Archive

- [x] 3.1 Archive `context-window-in-adapters` in this change after all tasks and gates pass.
