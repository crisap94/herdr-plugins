import { svg } from "gpui-kit";
import { PATHS } from "../constants.js";

export function icon(name, size, color) {
  const el = svg(`${PATHS.icons}${name}.svg`).size(size).flex_none();
  return color ? el.text_color(color) : el;
}
