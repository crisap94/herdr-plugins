import { SPIN_MS, STATUS } from "../constants.js";
import { icon } from "./icon.js";

export const statusColor = (t, st) => t[STATUS[st] ?? STATUS.unknown];

export function status(t, st, size) {
  const name = STATUS[st] ?? STATUS.unknown;
  const el = icon(name, size, statusColor(t, name));
  return name === STATUS.working ? el.spin(SPIN_MS) : el;
}
