# desktop

The Herdr desktop app side of this repository, apart from the plugins.

| Folder | What it is |
| --- | --- |
| `mods/tab-recap/` | The Tab Recap mod for the Herdr app. It stands alone: copy the folder to `~/.config/herdr-app/mods/tab-recap/` and it works. It reads the plugin's daemon over the local API, or the JSON files the daemon writes, and nothing else. |
| `src/` | A zero-dependency library for talking to the desktop stack: the typed `hc` core socket client. The event bus and the local API follow. It imports nothing from `tab-recap/`. |
| `test/` | The library's own tests, with a fake core. |

`tab-recap/` imports the library through one seam file; the library never imports `tab-recap/`.

## Install the mod

```bash
cp -r desktop/mods/tab-recap ~/.config/herdr-app/mods/tab-recap
herdr-app check ~/.config/herdr-app/mods/tab-recap
```

`mods/tab-recap/RECIPE.md` has the key binding and the optional layout blocks. The plugin's daemon must run with
`TAB_RECAP_FRONTEND=gui` (see `tab-recap/README.md`, "Desktop app") for the mod to have data.

## Testing

```bash
cd desktop && node --test test/*.test.ts
```

`test/support/setup-test.ts` is the shared setup. `setupTest(t)` starts a fake herdr core on a temporary socket and hands back a world with
`core`, `path`, `link()` and `events()`; everything made through it is closed, and the socket removed, when the test ends. `openWorld()` is the
same without a test context, for helpers that manage their own lifetime. The fake core (`test/fakes/hc-core.ts`) is scripted from real frames
(`test/fixtures/hc-core-frames.json`).
