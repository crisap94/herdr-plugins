import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { BREAK_ICON, SECTION_TOKEN } from "../constants.js";
import { SIZE } from "../metrics.js";
import { TEXT } from "../text.js";
import { feed } from "../derive-timeline.js";
import { clock, day } from "../time.js";
import { icon } from "../ui/icon.js";

function row(c, r, i) {
  const { t } = c;
  const zone = c.model.zone;
  const base = h_flex().id(`feed-${i}`).gap(SIZE.padSm).items_center().px(SIZE.gapMd).py(SIZE.tipPad).border_b(SIZE.border).border_color(t.border).text_size(SIZE.text);
  if (r.type === "day") return div().id(`feed-${i}`).px(SIZE.gapMd).py(SIZE.dayPad).bg(t.chrome).border_b(SIZE.border).border_color(t.border).text_size(SIZE.hint).font_semibold().child(r.label);
  if (r.type === "break") {
    return base.bg(t.hover).text_color(t.muted).child(icon(BREAK_ICON[r.b.kind], SIZE.icon, t.muted))
      .child(div().w(SIZE.dayW).flex_none().text_size(SIZE.hint).text_color(t.dim).child(clock(r.t, zone)))
      .child(div().font_semibold().text_color(t.fg).child(TEXT.breaks[r.b.kind])).child(div().flex_1().min_w(0).truncate().child(r.b.text));
  }
  return base.child(div().w(SIZE.dayW).flex_none().text_size(SIZE.hint).text_color(t.dim).child(clock(r.t, zone)))
    .child(div().w(SIZE.tagW).flex_none().text_size(SIZE.hint).font_semibold().text_color(t[SECTION_TOKEN[r.e.sec]]).child(TEXT.sections[r.e.sec]))
    .child(div().flex_1().min_w(0).child(r.e.text));
}

export function feedView(c, f, older) {
  const { t } = c;
  const out = feed(c.model.events, c.model.breaks, f, c.model.zone);
  const range = f.bin ? ` in ${day(f.bin.t0, c.model.zone)} ${clock(f.bin.t0, c.model.zone)}${TEXT.rangeJoin}${clock(f.bin.t1, c.model.zone)}` : "";
  const summary = `${TEXT.events(out.count, range)}${older ? TEXT.older48(older) : ""}`;
  const rows = out.rows.length ? out.rows.map((r, i) => row(c, r, i)) : [div().px(SIZE.gapMd).py(SIZE.dayPad).text_color(t.dim).child(TEXT.noEvents)];
  return v_flex().gap(SIZE.gapSm).child(div().text_size(SIZE.hint).text_color(t.dim).child(summary))
    .child(v_flex().id("feed").max_h(SIZE.feedMax).overflow_y_scrollbar().rounded(SIZE.radius).border(SIZE.border).border_color(t.border).bg(t.raised).children(rows));
}
