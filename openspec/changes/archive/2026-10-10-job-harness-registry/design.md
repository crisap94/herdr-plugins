## Design

The job harness registry is the source of truth for each closed harness id and its job capabilities. A total `HARNESS_BY_ID` record backs capability reads, and derived records use one small `Object.fromEntries` helper because Node has no built-in for constructing a typed record from a tuple registry. Environment values remain parsed in the configuration adapter, while registry entries keep their model defaults and legacy key names together. Every summarizer has a required contract, and harness ids use the registry's `BackendId` type.

The custom harness declares a free-text contract, no model, no availability mark and a custom-command note. Setup display, availability marks, contract selection and enumerator selection read their named capabilities. Installation messages derive from automatic selection eligibility. Its existing label behavior remains pinned: the command is shown and the model setting is ignored. The replay counting wrapper preserves the required contract.

The English and Spanish job harness lists are assembled from registry labels, with localized custom-command descriptions supplied by the existing message catalog. Existing message wording and ordering remain unchanged.
