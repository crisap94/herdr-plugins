import { api, tabRoute } from "./api.js";
import { DETAIL_MAX, ELLIPSIS, ERR, GUIDE, HTTP, MESSAGE_LIMIT, NOT_FOUND, QUERY, REASON, ROUTE } from "./constants.js";
import { safe } from "./commands.js";
import { errorCode, statusReason } from "./reasons.js";
import { TEXT } from "./text.js";

const query = (pairs) => `?${pairs.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&")}`;

function bodyOf(res, kind) {
  try {
    const body = JSON.parse(res.text);
    if (body?.kind !== kind || typeof body.text !== "string") return null;
    return { ok: true, text: body.text, limit: Number.isInteger(body.limit) ? body.limit : MESSAGE_LIMIT, model: body.model };
  } catch {
    return null;
  }
}

function detailOf(res) {
  try {
    const chars = Array.from(String(JSON.parse(res.text)?.detail ?? "").replace(/\s+/g, " ").trim());
    const text = chars.join("");
    if (TEXT.handoffCodes[text]) return TEXT.handoffCodes[text];
    return chars.length > DETAIL_MAX ? `${chars.slice(0, DETAIL_MAX).join("").trimEnd()}${ELLIPSIS}` : text;
  } catch {
    return "";
  }
}

function refusal(res) {
  const detail = res?.status === HTTP.conflict && errorCode(res.text) === ERR.refused ? detailOf(res) : "";
  return detail ? { ok: false, reason: REASON.refused, detail } : null;
}

function settle(res, kind) {
  if (res?.ok) return bodyOf(res, kind) ?? { ok: false, reason: REASON.failed };
  if (res?.status === HTTP.notFound) return { ok: false, reason: NOT_FOUND[errorCode(res.text)] ?? REASON.failed };
  return refusal(res) ?? { ok: false, reason: statusReason(res) };
}

function queryOf(pairs) {
  try {
    return query(pairs);
  } catch {
    return null;
  }
}

async function fetchMessage(tab, route, pairs, kind) {
  const search = queryOf(pairs);
  if (!safe(tab) || search === null) return { ok: false, reason: REASON.rejected };
  return settle(await api.get(`${tabRoute(tab)}${route}${search}`), kind);
}

export const compactMessage = (tab, pane, note) => fetchMessage(tab, ROUTE.compact, [[QUERY.pane, pane], [QUERY.note, note]], GUIDE.kind.compact);

export const handoffMessage = (tab, from, to) => fetchMessage(tab, ROUTE.handoff, [[QUERY.from, from], [QUERY.to, to]], GUIDE.kind.handoff);
