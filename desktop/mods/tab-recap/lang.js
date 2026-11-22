import { setShared, shared } from "herdr";
import { DEFAULT_LANG, SHARED } from "./constants.js";
import { isLanguage } from "./language.js";

export function currentLang() {
  const given = shared(SHARED.lang);
  return isLanguage(given) ? given : DEFAULT_LANG;
}

export function setLang(next) {
  setShared(SHARED.lang, isLanguage(next) ? next : DEFAULT_LANG);
}
