import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { INTERVAL, ROW_STEPS, RUNNING_STAGES, STATUS, STEP_STATE, TINT } from "../constants.js";
import { SIZE } from "../metrics.js";
import { TEXT } from "../text.js";
import { stepsOf } from "../derive.js";
import { tint } from "../theme.js";
import { icon } from "./icon.js";
import { meter } from "./meter.js";
import { pillCompacting } from "./pill.js";
import { status } from "./status.js";

export const runningOf = (lane, now) => Boolean(lane.stage && RUNNING_STAGES.includes(lane.stage.stage) && now - lane.stage.stageAt < INTERVAL.stageFresh);

function stepper(t, steps) {
  const cell = (s) => h_flex().flex_1().gap(SIZE.pillGap).items_center().text_size(SIZE.hint)
    .text_color(s.state === STEP_STATE.ok ? t.done : s.state === STEP_STATE.now ? t.fg : t.dim)
    .child(status(t, s.state === STEP_STATE.ok ? STATUS.done : s.state === STEP_STATE.now ? STATUS.working : STATUS.idle, SIZE.iconSm))
    .child(s.secs === null ? TEXT.stepNames[s.name] : `${TEXT.stepNames[s.name]} ${s.secs} s`);
  return v_flex().gap(SIZE.gapSm).child(h_flex().gap(SIZE.gapMd).children(steps.slice(0, ROW_STEPS).map(cell))).child(h_flex().gap(SIZE.gapMd).children(steps.slice(ROW_STEPS).map(cell)));
}

export function laneChip(t, lane, i, o) {
  const pct = lane.contextPercent;
  const hinted = pct !== null && pct >= o.hint;
  const running = runningOf(lane, o.now);
  const border = running ? t.working : o.open ? t.accent : hinted ? tint(t.working, TINT.hint) : t.border;
  const tail = running ? pillCompacting(t) : h_flex().flex_none().gap(SIZE.tiny).items_center().text_size(SIZE.text).text_color(hinted ? t.working : t.muted)
    .when(hinted, (e) => e.font_semibold()).child(hinted ? TEXT.compactQ : TEXT.compact).child(icon("chevron", SIZE.icon, hinted ? t.working : t.muted));
  const card = v_flex().id(`lane-${i}`).flex_1().min_w(SIZE.lane).max_w(SIZE.laneMax).px(SIZE.ctlPad).py(SIZE.pillPad).gap(SIZE.gap)
    .rounded(SIZE.radius).border(SIZE.border).border_color(border).bg(t.raised).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(h_flex().gap(SIZE.gap).items_center().child(status(t, lane.status, SIZE.icon)).child(div().text_color(t.muted).text_size(SIZE.text).child(lane.agent))
      .child(div().flex_1().min_w(0).truncate().font_semibold().child(lane.name)))
    .child(h_flex().gap(SIZE.padSm).items_center().child(meter(t, pct, null, o.hint)).child(div().min_w(SIZE.laneId).text_size(SIZE.text).child(pct === null ? TEXT.dash : `${pct}%`)).child(tail));
  const shown = running ? card.child(stepper(t, stepsOf(lane.stage, o.now))) : card.cursor_pointer().hover((s) => s.bg(t.hover)).on_mouse_down("left", (e, cx) => { cx.stop_propagation(); o.onToggle(i, e.bounds, cx); });
  return shown;
}
