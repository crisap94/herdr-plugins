# Roadmap

What has shipped and what is planned, per plugin. Nothing planned has a date, and the order can change as people use the plugins.

**How to propose something:** open a [feature request](https://github.com/crisap94/herdr-plugins/issues/new?template=feature_request.yml)
(or a [bug report](https://github.com/crisap94/herdr-plugins/issues/new?template=bug_report.yml)) — a short description of the problem
is more useful than a design.

Status: **shipped** = released · *planned* = intended, not started.

## tab-recap

### Shipped

- **[2.0.0](https://github.com/crisap94/herdr-plugins/releases/tag/tab-recap-v2.0.0)** — the recap is a ledger of facts (add, update, close, each with its time and, for a decision, its reason) instead of a text rewritten every turn; recaps are checked against a rubric by gates and a judge (`tab-recap eval`, with `--replay` to measure a new engine on a stored transcript); the full-screen view is now the **expanded view** with the whole timeline, the decisions with their reasons and computed session facts; compactions are recorded and shown with their tokens, and the timeline marks where a session broke into chapters; the compaction brief names what was already settled; closed tabs are removed after `TAB_RECAP_KEEP_DAYS` days. **Breaking:** a custom writer command (`TAB_RECAP_CUSTOM_CMD`) must now answer operations on the ledger.
- **[1.4.0](https://github.com/crisap94/herdr-plugins/releases/tag/tab-recap-v1.4.0)** — the phone bar sits along the bottom and no longer moves any agent pane (herdr cannot split upwards, so a top bar needed a swap); each agent's last prompt in its header is live.
- **[1.3.0](https://github.com/crisap94/herdr-plugins/releases/tag/tab-recap-v1.3.0)** — a git note under each agent: branch, unpushed commits, dirty tree.
- **[1.2.0](https://github.com/crisap94/herdr-plugins/releases/tag/tab-recap-v1.2.0)** — every agent gets a column (opencode by default, others read from the screen on request), and a tab can hold several tasks.
- **[1.1.0](https://github.com/crisap94/herdr-plugins/releases/tag/tab-recap-v1.1.0)** — a key to hide and show columns, a fixed seven-section recap, and a checked release pipeline with CI and screenshots.
- **[1.0.1](https://github.com/crisap94/herdr-plugins/releases/tag/tab-recap-v1.0.1)** — stability: quieter event subscriptions, safer process handling, no leftover opencode sessions.

### 2.1 *(planned)*

- Drop the 1.x `item` table, which 2.0 keeps read-only after importing it into facts.
- Edit a fact by hand from the expanded view (correct it, close it, reopen it).

### Later *(planned)*

- A gate so that only a question can close as `answered` (a decision or a rule never does), and a per-chapter comparison in `eval --replay --compare-imported`.

- Harness profiles for gemini, cursor-agent, qwen and copilot, once they can be tested: each is added after live probes show it can run without tools and without keeping a session.
- More interface languages.
