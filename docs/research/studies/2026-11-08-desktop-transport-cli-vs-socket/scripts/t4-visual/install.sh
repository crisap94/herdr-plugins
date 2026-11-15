#!/usr/bin/env bash
SRC=$HOME/Projects/homelab/herdr-plugins-gui-port/tab-recap/gui
DST=$HOME/.cache/hcs/${T:-t4v}-app/mods/tab-recap
mkdir -p $DST
rsync -a --delete --exclude gpui-kit.d.ts --exclude jsconfig.json $SRC/ $DST/
node -e '
const fs=require("fs");const f=process.argv[1];let s=fs.readFileSync(f,"utf8");
s=s.replace("import { props } from \"herdr\";","import { props, readTextFile, exec } from \"herdr\";\nimport { openLink } from \"./commands.js\";");
const hook=`    cx.timer.every(300, (c) => {
      const file = "__HOME__/.cache/hcs/__T__-state/cmd." + this.name + ".json";
      readTextFile(file).then((txt) => {
        if (!txt) return;
        exec("rm", ["-f", file]);
        for (const m of JSON.parse(txt)) {
          const args = (m.a ?? []).map((x) => (x === "$cx" ? c : x));
          if (m.key) this.role.onKey({ key: m.key, modifiers: {} }, c);
          else if (m.note !== undefined) { this.role.note.set_value(m.note); this.role.count = m.note.length; this.role.guide.flush(); }
          else if (m.clip === "fail") { this.role.guide.cx.write_to_clipboard = () => { throw new Error("no clipboard"); }; }
          else if (m.call) { const parts = m.call.split("."); const fn = parts.pop(); const obj = parts.reduce((o, k) => o[k], this.role); obj[fn](...args); }
        }
        c.notify();
      }, () => null);
    });
`;
s=s.replace("    this.role?.init?.(given, cx);\n","    this.role?.init?.(given, cx);\n"+hook);
fs.writeFileSync(f,s);
' $DST/main.js
sed -i "s#__HOME__#$HOME#g" $DST/main.js
sed -i "s#__T__#${T:-t4v}#g" $DST/main.js
