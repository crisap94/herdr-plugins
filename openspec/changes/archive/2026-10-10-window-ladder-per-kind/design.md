# Design

1. `WindowBasis` carries its own readonly size ladder, making window selection and raising one adapter-owned result.
2. Claude window bases carry the existing 200k/1M ladder; Codex, OpenCode, and fallback bases carry an empty ladder for exact peaks.
3. `contextOf` consumes the basis directly, applies settings first, then raises against that basis without knowing any kind.
4. `ContextWindows` exposes only the kind-specific resolver; no global ladder remains to be applied accidentally.
5. This supersedes T3's shared-ladder oddity; the Claude-to-catalogue lookup and all in-window values remain unchanged.
