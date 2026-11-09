# Research index

| Study | Date | Question | Status | Informs |
| --- | --- | --- | --- | --- |
| [R-2026-11-07-01](studies/2026-11-07-gui-tab-recap-port/README.md) | 2026-11-07 | What does the Herdr GUI (herdr-app on herdr-core) offer and require for a tab-recap front-end, and how should herdr-plugins be organised to ship the TUI and GUI versions? | concluded | openspec/changes/gui-port |
| [R-2026-11-07-02](studies/2026-11-07-gui-spikes/README.md) | 2026-11-07 | Can a mod start and keep the recap daemon through hc, which keys can hc type into an agent, and how does a claude terminal map to its session? | concluded | openspec/changes/gui-port |
| [R-2026-11-08-01](studies/2026-11-08-desktop-transport-cli-vs-socket/README.md) | 2026-11-08 | For tab-recap's desktop frontend, is spawning the hc and herdr-app CLIs the right way to talk to herdr-core and the desktop app, or should the daemon and the mod use their sockets? | concluded | gui-port transport decision (S0 HcFleet/HcAgents and the mod command channel) |
| [R-2026-11-08-02](studies/2026-11-08-readme-and-repo-hygiene/README.md) | 2026-11-08 | What must the README of a public TypeScript or Bun project contain, and which community and repository files does a public repo need, so that tab-recap (a herdr plugin) and the libraries herdr-sdk, herdr-mcp and harness-kit are ready to be read and published? | concluded | README rewrite MR (docs/readme-research),library publish readiness of herdr-sdk/herdr-mcp/harness-kit |
