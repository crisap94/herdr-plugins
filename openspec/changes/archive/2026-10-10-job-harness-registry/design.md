## Design

The job harness registry is the source of truth for each closed harness id and its job capabilities. Derived records use one small `Object.fromEntries` helper because Node has no built-in for constructing a typed record from a tuple registry. Environment values remain parsed in the configuration adapter, while registry entries keep their model defaults and legacy key names together.

The custom harness declares a free-text contract and no enumerator. Setup model display and enumerator selection read those capabilities. Its existing label behavior remains pinned: the command is shown and the model setting is ignored.

The English and Spanish job harness lists are assembled from registry labels, with localized custom-command descriptions supplied by the existing message catalog. Existing message wording and ordering remain unchanged.
