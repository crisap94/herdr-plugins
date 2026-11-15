import { div } from "gpui-kit";
import { TextView, v_flex } from "gpui-base";
import { SIZE } from "../metrics.js";
import { TEXT } from "../text.js";
import { openLink } from "../commands.js";
import { card } from "../ui/card.js";

const linked = (s) => (s.spans?.length ? s.spans.map((p) => (p.url ? `[${p.text}](${p.url})` : p.text)).join("") : s.text);

export function story(c) {
  const { t, model } = c;
  const body = model.stories.length
    ? model.stories.map((s, i) => TextView.markdown(`story-${i}`, linked(s)).selectable().text_size(SIZE.body).text_color(t.fg).on_link_click((url) => openLink(url)))
    : [div().text_color(t.dim).child(model.curating ? TEXT.writingStory : TEXT.noStory)];
  const chapters = model.session?.chapters;
  return v_flex().gap(SIZE.gapMd).child(card(t, TEXT.sessionSoFar, body))
    .when(Boolean(chapters), (e) => e.child(div().text_size(SIZE.text).text_color(t.muted).child(TEXT.chapters(chapters))));
}
