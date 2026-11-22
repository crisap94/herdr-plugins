import { DEFAULT_LANG } from "./constants.js";
import { MESSAGES } from "./catalog.js";
import { currentLang } from "./lang.js";

export const BULLET = "•";

const table = () => MESSAGES[currentLang()] ?? MESSAGES[DEFAULT_LANG];

export const TEXT = Object.defineProperties({}, Object.fromEntries(Object.keys(MESSAGES[DEFAULT_LANG]).map((key) => [key, { enumerable: true, get: () => table()[key] }])));
