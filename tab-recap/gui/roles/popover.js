import { div } from "gpui-kit";
import { h_flex, v_flex, Textarea, TextareaState } from "gpui-base";
import { closeOverlay, props, setShared } from "herdr";
import { ACTIONS_ENABLED, NOTE_MAX, SHARED } from "../constants.js";
import { SIZE } from "../metrics.js";
import { TEXT } from "../text.js";
import { sizeOf } from "../time.js";
import { tokens } from "../theme.js";
import { btn } from "../ui/button.js";
import { icon } from "../ui/icon.js";

export default class Popover {
  init() {
    this.count = 0;
    this.note = TextareaState.new({ placeholder: TEXT.popPlaceholder, rows: SIZE.noteRows });
    this.note.on("change", (_e, cx) => {
      const value = this.note.value();
      if (value.length > NOTE_MAX) this.note.set_value(value.slice(0, NOTE_MAX));
      this.count = Math.min(value.length, NOTE_MAX);
      cx.notify();
    });
  }

  async close() {
    setShared(SHARED.popup, null);
  }

  hintLine(t, p) {
    const past = p.pct !== null && p.pct >= p.hint;
    const win = p.window ? sizeOf(p.window) : TEXT.dash;
    const text = p.pct === null ? TEXT.popUnknown(p.hint) : past ? TEXT.popPast(p.pct, win, p.hint) : TEXT.popBelow(p.pct, win, p.hint);
    return h_flex().gap(SIZE.headGap).items_center().text_size(SIZE.text).text_color(past ? t.working : t.muted)
      .child(icon(past ? "bolt" : "clock", SIZE.icon, past ? t.working : t.muted)).child(text);
  }

  render() {
    const t = tokens();
    const p = props() ?? {};
    const shut = () => closeOverlay(p.overlay);
    return v_flex().id("compact").size_full().p(SIZE.popPad).gap(SIZE.headGap).bg(t.raised)
      .child(div().font_semibold().child(TEXT.popTitle(p.name ?? "")))
      .child(this.hintLine(t, p))
      .child(Textarea.new(this.note).w_full().h(SIZE.popH).px(SIZE.chipPad).py(SIZE.popAt).rounded(SIZE.radiusSm).border(SIZE.border).border_color(t.border).bg(t.bg)
        .text_size(SIZE.text).text_color(t.fg))
      .child(h_flex().justify_between().items_center().text_size(SIZE.hint)
        .child(div().text_color(t.dim).child(TEXT.counter(this.count, NOTE_MAX)))
        .child(h_flex().gap(SIZE.gap).child(btn(t, TEXT.cancel, { id: "cancel", onClick: shut }))
          .child(btn(t, TEXT.compactBtn, { id: "go", primary: true, disabled: !ACTIONS_ENABLED.compact, tip: TEXT.disabled }))));
  }
}
