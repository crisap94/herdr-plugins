import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { FOOTER, ICON, SPIN_MS, STATUS, VIEWS } from "../constants.js";
import { SIZE } from "../metrics.js";
import { TEXT } from "../text.js";
import { countBy } from "../derive.js";
import { btn, kbd, seg } from "../ui/button.js";

const bar = (t) => h_flex().h(SIZE.bar).px(SIZE.pad).gap(SIZE.padSm).items_center().flex_none().bg(t.chrome).border_b(SIZE.border).border_color(t.border);
const gear = (t) => btn(t, "", { id: "gear", icon: "gear", tip: TEXT.settings });

export function fleetBar(c) {
  const { t, rows } = c;
  return bar(t).child(div().font_semibold().child(TEXT.fleet))
    .child(div().text_color(t.muted).child(`${TEXT.needYou(countBy(rows, STATUS.blocked))}, ${TEXT.workingCount(countBy(rows, STATUS.working))}`))
    .child(div().flex_1())
    .child(btn(t, c.refreshing ? TEXT.refreshing : TEXT.refreshAll, { id: "refresh-all", icon: c.refreshing ? ICON.working : ICON.refresh, spin: c.refreshing ? SPIN_MS : 0, onClick: c.onRefreshAll }))
    .child(gear(t));
}

export function briefBar(c) {
  const { t, tab } = c;
  return bar(t).child(btn(t, TEXT.back, { id: "back", icon: "back", onClick: c.onBack }))
    .child(h_flex().min_w(0).gap(SIZE.tiny).whitespace_nowrap().text_color(t.muted).child(TEXT.crumb(tab.space)).child(div().truncate().font_semibold().text_color(t.fg).child(tab.name)))
    .child(div().flex_1()).child(seg(t, "view", VIEWS.map((v) => [v, TEXT.views[v]]), c.view, c.onView)).child(div().flex_1())
    .child(div().text_color(t.dim).child(TEXT.position(c.position, c.total))).child(gear(t));
}

export function footer(t) {
  return h_flex().flex_wrap().gap(SIZE.footerGap).px(SIZE.pad).py(SIZE.gap).flex_none().bg(t.chrome).border_t(SIZE.border).border_color(t.border)
    .text_size(SIZE.hint).text_color(t.dim)
    .children(FOOTER.map((f, i) => h_flex().id(`hint-${i}`).gap(SIZE.gapSm).items_center().children(f.keys.map((k) => kbd(t, k))).child(f.label)));
}

