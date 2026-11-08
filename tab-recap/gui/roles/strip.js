import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { openOverlay, panes, props, shared } from "herdr";
import { INTERVAL, MOD, ROLES, RUNNING_STAGES, SHARED, WINDOW } from "../constants.js";
import { hintOf, maxCtx, needsYou } from "../derive.js";
import { SIZE } from "../metrics.js";
import { TEXT } from "../text.js";
import { Store } from "../store.js";
import { tokens } from "../theme.js";
import { meter } from "../ui/meter.js";
import { pillCompacting } from "../ui/pill.js";
import { status } from "../ui/status.js";
import { tabRows } from "../model.js";

export default class Strip {
  init(_p, cx) {
    this.store = new Store();
    this.store.passive(cx, INTERVAL.poll);
  }

  close() {
    this.store.stop();
  }

  rows() {
    const live = shared(SHARED.rows);
    return Array.isArray(live) && live.length ? live : this.store.rows;
  }

  neutral(t, pane) {
    return h_flex().id(`strip-${pane.pane}`).size_full().px(SIZE.padSm).items_center().bg(t.raised).border_b(SIZE.border).border_color(t.border)
      .text_size(SIZE.text).text_color(t.dim).child(div().truncate().child(pane.title));
  }

  render() {
    const t = tokens();
    const pane = panes().find((p) => p.pane === props()?.pane);
    if (!pane) return div();
    const row = tabRows(this.rows()).find((r) => r.id === pane.tab);
    const lane = row?.lanes.find((l) => l.terminal === pane.terminal);
    if (!row || (pane.status === null && !lane)) return this.neutral(t, pane);
    const ctx = lane?.contextPercent ?? maxCtx(row);
    const red = needsYou(row);
    const text = row.headline || TEXT.noRecap;
    return h_flex().id(`strip-${pane.pane}`).size_full().px(SIZE.padSm).gap(SIZE.rowGap).items_center().bg(t.raised).border_b(SIZE.border).border_color(t.border)
      .text_size(SIZE.text).cursor_pointer().on_click(() => openOverlay({ mod: MOD, ...WINDOW, keep: true, props: { role: ROLES.brief, tab: pane.tab } }))
      .child(status(t, pane.status ?? row.status, SIZE.icon))
      .child(div().id(`strip-hl-${pane.pane}`).flex_1().min_w(0).truncate().tooltip(text).text_color(red && !row.soft ? t.blocked : t.fg).when(red && !row.soft, (e) => e.font_semibold()).child(text))
      .when(ctx !== null, (e) => e.child(h_flex().gap(SIZE.headGap).items_center().text_size(SIZE.hint).text_color(t.dim).child(meter(t, ctx, SIZE.meterStrip, hintOf(row))).child(`${ctx}%`)))
      .when(Boolean(lane?.stage) && RUNNING_STAGES.includes(lane.stage), (e) => e.child(pillCompacting(t)));
  }
}
