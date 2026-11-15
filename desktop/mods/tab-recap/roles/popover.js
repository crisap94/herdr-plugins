import { div } from "gpui-kit";
import { h_flex, v_flex, Textarea, TextareaState } from "gpui-base";
import { closeOverlay, props, setShared } from "herdr";
import { ACTIONS_ENABLED, NOTE_MAX, SHARED } from "../constants.js";
import { SIZE } from "../metrics.js";
import { TEXT } from "../text.js";
import { sizeOf } from "../time.js";
import { tokens } from "../theme.js";
import { guidanceSection } from "../views/guidance.js";
import { btn } from "../ui/button.js";
import { icon } from "../ui/icon.js";
import { Guidance } from "./guidance.js";

export default class Popover {
  init(p, cx) {
    this.count = 0;
    this.note = TextareaState.new({ placeholder: TEXT.popPlaceholder, rows: SIZE.noteRows });
    this.note.on("change", (_e, cx) => {
      const chars = Array.from(this.note.value());
      if (chars.length > NOTE_MAX) this.note.set_value(chars.slice(0, NOTE_MAX).join(""));
      this.count = Math.min(chars.length, NOTE_MAX);
      this.guide.edit();
      cx.notify();
    });
    this.note.on("blur", () => this.guide.flush());
    this.guide = new Guidance(this.note);
    this.guide.open(p ?? props(), cx);
  }

  async close() {
    this.guide.close();
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
          .child(btn(t, TEXT.compactBtn, { id: "go", primary: true, disabled: !ACTIONS_ENABLED.compact, tip: TEXT.disabled }))))
      .child(guidanceSection(t, this.guide));
  }
}
