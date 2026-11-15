import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { STATUS_ORDER } from "../constants.js";
import { SIZE } from "../metrics.js";
import { TEXT } from "../text.js";
import { countBy, hintOf, maxCtx, needsYou, visible, waitMinutes } from "../derive.js";
import { ago } from "../time.js";
import { btn, search } from "../ui/button.js";
import { meter } from "../ui/meter.js";
import { status } from "../ui/status.js";

const stop = (_e, cx) => cx.stop_propagation();

function row(c, r) {
  const { t } = c;
  const ctx = maxCtx(r);
  const hint = hintOf(r);
  const wait = waitMinutes(r, c.now);
  const sel = r.id === c.sel;
  return v_flex().id(`row-${r.id}`).px(SIZE.pad).py(SIZE.padSm).gap(SIZE.tiny).border_l(SIZE.accent).border_color(sel ? t.accent : t.surface).bg(sel ? t.selected : t.surface)
    .cursor_pointer().hover((s) => s.bg(sel ? t.selected : t.hover)).on_mouse_down("left", stop).on_click((_e, cx) => c.onOpen(r.id, cx))
    .child(h_flex().gap(SIZE.gap).items_center().child(status(t, r.status, SIZE.status)).child(div().font_semibold().child(r.name)).child(div().text_color(t.dim).child(r.space))
      .child(div().flex_1())
      .child(wait ? div().font_semibold().text_size(SIZE.text).text_color(t.blocked).child(TEXT.waiting(wait)) : div().text_color(t.dim).text_size(SIZE.text).child(r.recapAt ? ago(c.now - r.recapAt) : TEXT.neverRecap)))
    .child(div().w_full().truncate().text_size(SIZE.text).text_color(needsYou(r) && !r.soft ? t.blocked : t.muted).child(r.headline || TEXT.noRecap))
    .when(ctx !== null || r.laneCount > 1, (e) => e.child(h_flex().gap(SIZE.padSm).items_center().text_size(SIZE.hint).text_color(t.dim)
      .when(r.laneCount > 1, (x) => x.child(h_flex().gap(SIZE.tiny).items_center().children(r.lanes.map((l) => status(t, l.status, SIZE.statusSm))).child(TEXT.lanes(r.laneCount))))
      .when(ctx !== null, (x) => x.child(meter(t, ctx, SIZE.meterFleet, hint)).child(`${ctx}%`))
      .when(ctx !== null && ctx >= hint, (x) => x.child(div().font_semibold().text_color(t.working).child(TEXT.compactQ)))));
}

function filters(c) {
  const { t } = c;
  return h_flex().flex_wrap().gap(SIZE.headGap).items_center().px(SIZE.gapMd).py(SIZE.padSm).border_b(SIZE.border).border_color(t.border)
    .children(STATUS_ORDER.map((s) => btn(t, TEXT.groups[s], { id: `filter-${s}`, icon: s, pressed: c.filter.has(s), count: countBy(c.rows, s), onClick: (_e, cx) => c.onFilter(s, cx) })))
    .child(div().flex_1()).child(search(t, "q", c.qState, SIZE.search, c.qFocus));
}

export function fleetView(c) {
  const { t } = c;
  const list = visible(c.rows, c.filter, c.q);
  let last = "";
  const items = list.flatMap((r) => {
    const head = r.status === last ? [] : [div().id(`group-${r.status}`).px(SIZE.pad).pt(SIZE.gap).pb(SIZE.gapSm).text_size(SIZE.hint).text_color(t.dim).child(TEXT.groups[r.status].toUpperCase())];
    last = r.status;
    return [...head, row(c, r)];
  });
  return v_flex().flex_1().min_h(0).child(filters(c))
    .child(v_flex().id("fleet-list").flex_1().min_h(0).overflow_y_scrollbar().children(items.length ? items : [div().px(SIZE.pad).py(SIZE.gap).text_color(t.dim).child(c.rows.length ? TEXT.noMatch : TEXT.noIndex)]));
}
