# herdr-plugins

[![ci](https://github.com/crisap94/herdr-plugins/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/crisap94/herdr-plugins/actions/workflows/ci.yml)

Plugins for [herdr](https://github.com/ogulcancelik/herdr), the terminal multiplexer for coding agents. Each plugin
lives in its own directory and installs on its own.

## Plugins

| plugin | what it does | docs |
| --- | --- | --- |
| **tab-recap** | a recap column beside every tab with a coding agent | [README](tab-recap/README.md) · [guide](tab-recap/GUIDE.md) · [reference](tab-recap/docs/REFERENCE.md) · [contributing](tab-recap/CONTRIBUTING.md) · [roadmap](tab-recap/ROADMAP.md) |

Install a plugin with `herdr plugin install crisap94/herdr-plugins/<plugin>`.

The repository root is a Bun workspace: one `bun.lock` at the root, and `bun install` works from the root or from a plugin's directory.

## Contributing

Issues and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers what every plugin shares: labels,
commits, pull requests and adding a plugin. Each plugin's own `CONTRIBUTING.md` has its setup, checks and rules.

## Security and support

Report a vulnerability privately, as described in [SECURITY.md](SECURITY.md). For questions, see [SUPPORT.md](SUPPORT.md).
The community standards are in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Changelog

Release notes are in [CHANGELOG.md](CHANGELOG.md), one section per plugin. Each plugin's `ROADMAP.md` says what is
planned next.

## License

[MIT](LICENSE) © 2026 crisap94
