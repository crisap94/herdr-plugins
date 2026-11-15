import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { ACTIONS_ENABLED, ICON, NEED_PHASE, SPIN_MS, STATUS, TINT } from "../constants.js";
import { LOOP, SIZE } from "../metrics.js";
import { TEXT } from "../text.js";
import { minutes } from "../time.js";
import { tint } from "../theme.js";
import { btn } from "../ui/button.js";
import { cardHead } from "../ui/card.js";

function replyField(t) {
  return h_flex().id("reply").flex_1().min_w(0).truncate().h(SIZE.ctl).px(SIZE.chipPad).items_center().rounded(SIZE.radiusSm).border(SIZE.border).border_color(t.border).bg(t.bg)
    .text_size(SIZE.text).text_color(t.dim).opacity(LOOP.dim).tooltip(TEXT.disabled).child(TEXT.reply);
}

function markButton(c, n, i) {
  const { t, need } = c;
  return btn(t, TEXT.markDone, { id: `mark-${i}`, icon: "done", disabled: !need.api, tip: need.api ? undefined : TEXT.markNeedsApi, onClick: (_e, cx) => need.ask(n.id, cx) });
}

function replyRow(t) {
  return h_flex().gap(SIZE.gap).items_center().child(replyField(t)).child(btn(t, TEXT.send, { id: "send", icon: "send", disabled: !ACTIONS_ENABLED.reply }));
}

function idleRow(c, n, i, lane) {
  const { t } = c;
  const first = i === 0;
  const marked = Boolean(n.id);
  const row = h_flex().gap(SIZE.gap).items_center().pt(SIZE.gapMd)
    .when(first, (e) => e.child(btn(t, TEXT.jump, { id: "jump", primary: true, icon: "jump", onClick: () => c.onJump(lane?.terminal ?? null) })))
    .when(marked, (e) => e.child(markButton(c, n, i)))
    .when(first && !marked, (e) => e.child(replyField(t)).child(btn(t, TEXT.send, { id: "send", icon: "send", disabled: !ACTIONS_ENABLED.reply })));
  return first && marked ? v_flex().gap(SIZE.gap).child(row).child(replyRow(t)) : row;
}

function confirmRow(c, n, i, pending) {
  const { t, need } = c;
  const yes = pending
    ? btn(t, TEXT.markPending, { id: `mark-yes-${i}`, primary: true, icon: ICON.working, spin: SPIN_MS, busy: true, tip: TEXT.markWorking })
    : btn(t, TEXT.markYes, { id: `mark-yes-${i}`, primary: true, icon: "done", onClick: (_e, cx) => need.confirm(n.id, n.text, cx) });
  const no = btn(t, TEXT.cancel, { id: `mark-no-${i}`, disabled: pending, tip: TEXT.markWorking, onClick: (_e, cx) => need.cancel(cx) });
  return v_flex().id(`mark-confirm-${i}`).gap(SIZE.gap).pt(SIZE.gapMd)
    .child(div().text_size(SIZE.text).text_color(t.muted).child(TEXT.markSure))
    .child(h_flex().gap(SIZE.gap).items_center().child(yes).child(no));
}

function errorLine(c, i, reason) {
  return div().id(`mark-error-${i}`).text_size(SIZE.text).text_color(c.t.blocked).child(TEXT.doneErrors[reason]);
}

function actionsOf(c, n, i, lane) {
  const phase = c.need.phase(n.id);
  if (n.id && phase !== NEED_PHASE.idle) return [confirmRow(c, n, i, phase === NEED_PHASE.pending)];
  const reason = n.id ? c.need.error(n.id) : null;
  return [idleRow(c, n, i, lane)].concat(reason ? [errorLine(c, i, reason)] : []);
}

export function needCard(c, n, i) {
  const { t } = c;
  const lane = c.model.lanes.find((l) => l.status === STATUS.blocked) ?? c.model.lanes[0];
  const wait = n.since ? minutes(c.now - n.since) : 0;
  return v_flex().gap(SIZE.gap).px(SIZE.cardPad).py(SIZE.cardPadV).rounded(SIZE.cardRadius).border(SIZE.border)
    .border_color(tint(t.blocked, TINT.needBorder)).bg(tint(t.blocked, TINT.need))
    .when(wait > 0, (e) => e.child(cardHead(t, TEXT.waitingCard(wait), "clock", t.blocked)))
    .child(div().text_size(SIZE.lead).font_semibold().child(n.text))
    .when(Boolean(n.why), (e) => e.child(div().text_size(SIZE.text).text_color(t.muted).child(n.why)))
    .when(i === 0 || Boolean(n.id), (e) => e.children(actionsOf(c, n, i, lane)));
}
