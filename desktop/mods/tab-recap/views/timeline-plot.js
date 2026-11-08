import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { AXIS_STEP_HOURS, FULL, HOURS, HOVER_EVENTS, MS, SECTION_TOKEN } from "../constants.js";
import { AXIS, SIZE } from "../metrics.js";
import { TEXT } from "../text.js";
import { clock, day, hourOf, minuteOf, weekday } from "../time.js";

const pct = (c, ms, from) => ((ms - from) / (HOURS * MS.hour)) * FULL;

function bar(c, b, max, from) {
  const { t } = c;
  const height = b.n ? Math.max(SIZE.binMin, (b.n / max) * SIZE.barMax) : 0;
  return div().id(`bin-${b.i}`).flex_1().h_full().flex().items_end().justify_center().pb(SIZE.tiny).rounded(SIZE.gapSm).cursor_pointer()
    .bg(c.bin === b.i ? t.selected : t.bg).hover((s) => s.bg(t.hover))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => c.onBin(b.i, cx))
    .on_hover((on, cx) => c.onHoverBin(b.i, on, cx))
    .child(div().w_full().max_w(SIZE.binMax).h(height).rounded(SIZE.tiny).bg(t[SECTION_TOKEN[b.dominant]]));
}

function marks(c, from) {
  return c.model.breaks.filter((b) => b.t >= from).map((b, i) => div().id(`mark-${i}`).absolute().top(0).h_full().left(`${pct(c, b.t, from)}%`)
    .border_l(SIZE.border).border_dashed().border_color(c.t.dim)
    .child(div().absolute().top(AXIS.marksLow).left(AXIS.markLeft).pr(AXIS.markPad)
      .text_size(SIZE.hint).text_color(c.t.muted).bg(c.t.bg).whitespace_nowrap().child(TEXT.breaks[b.kind])));
}

function axis(c, from) {
  const zone = c.model.zone;
  const step = AXIS_STEP_HOURS * MS.hour;
  const lead = (AXIS_STEP_HOURS - (hourOf(from, zone) % AXIS_STEP_HOURS)) % AXIS_STEP_HOURS;
  const first = from + lead * MS.hour - minuteOf(from, zone) * MS.minute;
  const ticks = [];
  for (let ms = first; ms <= from + HOURS * MS.hour; ms += step) {
    const at = pct(c, ms, from);
    if (at < AXIS.tickEdge || at > FULL - AXIS.tickEdge) continue;
    const mid = clock(ms, zone) === "00:00";
    const label = mid ? `${weekday(ms, zone)} ${day(ms, zone)}` : clock(ms, zone);
    ticks.push(div().id(`tick-${ms}`).absolute().left(`${at}%`).ml(-label.length * AXIS.labelHalf).whitespace_nowrap()
      .text_color(mid ? c.t.fg : c.t.dim).when(mid, (e) => e.font_semibold()).child(label));
  }
  const now = div().id("tick-now").absolute().left("100%").ml(-TEXT.nowLabel.length * AXIS.labelHalf - AXIS.nowPad).px(AXIS.nowPad).rounded(SIZE.round)
    .bg(c.t.accent).text_color(c.t.onAccent).font_semibold().child(TEXT.nowLabel);
  return div().relative().h(SIZE.axisH).mt(SIZE.tiny).text_size(SIZE.hint).children(ticks).child(now);
}

export function plot(c, made) {
  const max = Math.max(1, ...made.bins.map((b) => b.n));
  return v_flex().pr(AXIS.plotRight).pt(SIZE.tipPad)
    .child(div().relative().h(SIZE.plotH).rounded(SIZE.radius).border(SIZE.border).border_color(c.t.border).bg(c.t.bg)
      .children(marks(c, made.from))
      .child(h_flex().absolute().left(0).bottom(0).w_full().h(SIZE.binsH).children(made.bins.map((b) => bar(c, b, max, made.from))))
      .child(div().absolute().right(0).top(0).h_full().w(SIZE.lineLeft).bg(c.t.accent)))
    .child(axis(c, made.from));
}

export function hoverCard(c, b) {
  const { t } = c;
  const zone = c.model.zone;
  const rows = b.events.slice(-HOVER_EVENTS).reverse().map((e, i) => div().id(`hv-${i}`).child(div().text_color(t[SECTION_TOKEN[e.sec]]).child(TEXT.sections[e.sec])).child(e.text));
  const left = b.i > AXIS.edge / 2;
  const base = v_flex().id("hover-card").absolute().top(AXIS.hoverTop).w(AXIS.hoverW).p(SIZE.padSm).gap(SIZE.tiny2).rounded(SIZE.radius).border(SIZE.border)
    .border_color(t.border).bg(t.raised).text_size(SIZE.text);
  return (left ? base.right(AXIS.plotRight) : base.left(0)).child(div().text_size(SIZE.hint).text_color(t.dim).child(`${weekday(b.t0, zone)} ${day(b.t0, zone)}, ${clock(b.t0, zone)}${TEXT.rangeJoin}${clock(b.t1, zone)}`))
    .child(div().font_semibold().child(TEXT.eventCount(b.n))).children(rows)
    .when(b.n > HOVER_EVENTS, (e) => e.child(div().text_size(SIZE.hint).text_color(t.dim).child(TEXT.moreEvents(b.n - HOVER_EVENTS))));
}
