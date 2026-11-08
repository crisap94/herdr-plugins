import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { TINT } from "../constants.js";
import { SIZE } from "../metrics.js";
import { TEXT } from "../text.js";
import { tint } from "../theme.js";
import { btn } from "../ui/button.js";

const line = (t, id, text, restart) => h_flex().id(id).gap(SIZE.gap).items_center().px(SIZE.ctlPad).py(SIZE.banner).rounded(SIZE.radius).border(SIZE.border)
  .border_color(tint(t.working, TINT.hint)).bg(tint(t.working, TINT.banner)).text_size(SIZE.text).child(div().flex_1().child(text)).when(Boolean(restart), (e) => e.child(restart));

export function notice(c, entry, store, restarting, onRestart) {
  const { t } = c;
  const restart = () => btn(t, restarting ? TEXT.restarting : TEXT.restart, { id: "restart", onClick: (_e, cx) => onRestart(cx) });
  const out = [];
  if (store.daemon === "down") out.push(line(t, "n-down", TEXT.down, restart()));
  if (c.model?.stale) out.push(line(t, "n-stale", TEXT.stale, restart()));
  if (entry.doc?.version === 1) out.push(line(t, "n-v1", TEXT.daemonOlder));
  if (entry.state === "newer") out.push(line(t, "n-newer", TEXT.older));
  if (entry.state === "unreadable") out.push(line(t, "n-bad", TEXT.unreadable));
  if (entry.state === "missing") out.push(line(t, "n-none", TEXT.noDoc));
  if (c.model?.error) out.push(line(t, "n-err", c.model.error));
  return out;
}
