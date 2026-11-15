import { exec, home } from "herdr";
import { DEFAULT_BIN, DEFAULT_STATE, ENV, PATHS, SYSTEM } from "./constants.js";

let environment = null;

const envOf = (name) => exec(SYSTEM.printenv, [name]).then((r) => (r.code === 0 ? r.stdout.trim() : ""), () => "");

export function resolve() {
  if (!environment) {
    environment = Promise.all([envOf(ENV.bin), envOf(ENV.state)]).then(([bin, state]) => ({
      bin: bin || DEFAULT_BIN,
      dir: `${state || `${home()}/${DEFAULT_STATE}`}/${PATHS.gui}`,
    }));
  }
  return environment;
}
