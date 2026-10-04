# herdr-plugins

Plugins for [herdr](https://github.com/ogulcancelik/herdr), one per directory. Each directory is
a self-contained plugin (`herdr-plugin.toml` at its root), installable on its own:

```bash
herdr plugin install <owner>/<repo>/<plugin>     # from the forge
herdr plugin link ./<plugin>                     # from a checkout
```

| plugin | what it does |
| --- | --- |
| [`tab-recap`](tab-recap) | a recap column on the right of every tab with a coding agent, written by the coding agent of your choice at the end of each turn |

## House rules

- **TypeScript on Node ≥ 24, run directly — no build step, no runtime dependencies.** Dev tools
  (`tsgo`, `oxlint`) are devDependencies of the plugin that uses them.
- **Layered:** a pure domain fold, sum-typed ports,
  one adapter per port, and ast-grep rules that each prove they bite against a bad probe.
- **Every plugin has a `CONTEXT.md`** vocabulary and a lint rule that enforces it.
