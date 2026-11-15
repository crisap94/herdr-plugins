import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { SIZE } from "../metrics.js";
import { openLink } from "../commands.js";
import { icon } from "./icon.js";

export function chip(t, id, label, url) {
  const el = h_flex().id(id).h(SIZE.chipH).px(SIZE.chipPad).gap(SIZE.pillGap).items_center().flex_none().rounded(SIZE.round)
    .border(SIZE.border).border_color(t.border).bg(t.surface).text_color(t.accent).text_size(SIZE.text)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(icon("link", SIZE.iconSm, t.accent)).child(div().truncate().child(label));
  return url ? el.cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => openLink(url)) : el;
}
