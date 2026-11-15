import { api, tabRoute } from "./api.js";
import { ERR, FACT_STATE, HTTP, REASON, ROUTE } from "./constants.js";
import { safe } from "./commands.js";
import { errorCode, statusReason } from "./reasons.js";

function conflict(code) {
  return code === ERR.notNeed ? REASON.notNeed : REASON.closed;
}

function missing(code) {
  return code === ERR.unknownNeed ? REASON.unknownNeed : REASON.unknownTab;
}

function reasonOf(res) {
  if (res?.ok) return null;
  if (res?.status === HTTP.conflict) return conflict(errorCode(res.text));
  if (res?.status === HTTP.notFound) return missing(errorCode(res.text));
  return statusReason(res);
}

export const needOpen = (doc, id) => (doc?.tasks ?? []).some((task) => (task.facts ?? []).some((f) => f.id === id && f.state === FACT_STATE.open));

export const answerRoute = (tab, id) => `${tabRoute(tab)}${ROUTE.needs}${encodeURIComponent(id)}${ROUTE.answer}`;

export async function answerNeed(tab, id) {
  if (!safe(tab) || typeof id !== "string" || !id) return { ok: false, reason: REASON.failed };
  const reason = reasonOf(await api.post(answerRoute(tab, id)));
  return reason ? { ok: false, reason } : { ok: true };
}
