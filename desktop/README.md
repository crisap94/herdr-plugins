# desktop

The Herdr desktop app side of this repository: the mods, one folder each.

| Folder | What it is |
| --- | --- |
| `mods/tab-recap/` | The Tab Recap mod for the Herdr app. It stands alone: copy the folder to `~/.config/herdr-app/mods/tab-recap/` and it works. It reads the plugin's daemon over the local API, or the JSON files the daemon writes, and nothing else. |

## Install the mod

```bash
cp -r desktop/mods/tab-recap ~/.config/herdr-app/mods/tab-recap
herdr-app check ~/.config/herdr-app/mods/tab-recap
```

`mods/tab-recap/RECIPE.md` has the key binding and the optional layout blocks. The plugin's daemon must run with
`TAB_RECAP_FRONTEND=gui` (see `tab-recap/docs/REFERENCE.md`, "Desktop app") for the mod to have data.
