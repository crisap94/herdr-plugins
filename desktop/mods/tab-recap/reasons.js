import { ERR, HTTP, REASON } from "./constants.js";

export function errorCode(text) {
  try {
    return JSON.parse(text)?.error ?? null;
  } catch {
    return null;
  }
}

export function statusReason(res) {
  if (!res || res.status === HTTP.unauthorized) return REASON.down;
  if (res.status === HTTP.tooMany) return REASON.tooMany;
  if (res.status === HTTP.badRequest) return errorCode(res.text) === ERR.noteTooLong ? REASON.noteTooLong : REASON.rejected;
  return REASON.failed;
}
