import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { SIZE } from "../metrics.js";
import { TEXT } from "../text.js";
import { ago } from "../time.js";
import { card } from "../ui/card.js";

function row(c, d, i) {
  const { t } = c;
  const open = c.openDecs.has(d.id);
  return v_flex().id(`dec-${i}`).border_t(i ? SIZE.border : 0).border_color(t.border).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(h_flex().gap(SIZE.rowGap).items_center().py(SIZE.rowPadV).cursor_pointer().on_click((_e, cx) => c.toggleDec(d.id, cx))
      .child(div().flex_none().w(SIZE.tick).h(SIZE.tickH).rounded(SIZE.tickRadius).bg(t.violet))
      .child(div().flex_1().min_w(0).child(d.title))
      .when(d.at !== null, (e) => e.child(div().flex_none().text_size(SIZE.hint).text_color(t.dim).child(ago(c.now - d.at)))))
    .when(open && Boolean(d.why), (e) => e.child(div().ml(SIZE.decWhy).pb(SIZE.gap).text_size(SIZE.text).text_color(t.muted).child(d.why)))
    .when(open && Boolean(d.closedWhy), (e) => e.child(div().ml(SIZE.decWhy).pb(SIZE.gap).text_size(SIZE.text).text_color(t.dim).child(TEXT.closed(d.closedWhy))));
}

export function decisionsCard(c) {
  const list = c.model.decisions;
  return card(c.t, TEXT.decisions, list.length ? list.map((d, i) => row(c, d, i)) : [div().text_color(c.t.dim).child(TEXT.noneYet)]);
}
