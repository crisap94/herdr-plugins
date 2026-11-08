import { readTextFile } from "herdr";
import { API, HTTP, PATHS, ROUTE } from "./constants.js";
import { resolve } from "./env.js";

const isPort = (v) => Number.isInteger(v) && v > 0 && v < API.portMax;

function parseDiscovery(text) {
  try {
    const found = JSON.parse(text);
    if (found?.version !== API.version || !isPort(found.port) || typeof found.token !== "string" || !API.token.test(found.token)) return null;
    if (!Number.isInteger(found.pid) || !Number.isInteger(found.startedAt)) return null;
    return { port: found.port, token: found.token, pid: found.pid, startedAt: found.startedAt };
  } catch {
    return null;
  }
}

function request(cred, method, body) {
  const headers = { Authorization: `${API.bearer} ${cred.token}` };
  if (body === undefined) return { method, headers };
  return { method, headers: { ...headers, "Content-Type": HTTP.json }, body: JSON.stringify(body) };
}

function parseHealth(text) {
  try {
    const body = JSON.parse(text);
    return body?.ok === true && body.version === API.version ? body : null;
  } catch {
    return null;
  }
}

const matches = (body, cred) => Boolean(body && cred) && body.pid === cred.pid && body.startedAt === cred.startedAt;

export const tabRoute = (tab) => `${ROUTE.tabs}${encodeURIComponent(tab)}`;

export class Api {
  constructor() {
    this.cred = null;
  }

  forget() {
    this.cred = null;
  }

  async discover() {
    let text = null;
    try {
      text = await readTextFile(`${(await resolve()).dir}/${PATHS.api}`);
    } catch {
      text = null;
    }
    return text ? parseDiscovery(text) : null;
  }

  async health(cred) {
    try {
      const res = await fetch(`${API.origin}:${cred.port}${ROUTE.health}`);
      return res.ok ? parseHealth(await res.text()) : null;
    } catch {
      return null;
    }
  }

  async check() {
    const cred = await this.discover();
    const body = cred ? await this.health(cred) : null;
    const same = matches(body, cred);
    this.cred = same ? cred : null;
    return same ? { cred, body } : null;
  }

  async probe() {
    return (await this.check())?.body ?? null;
  }

  async trusted() {
    const cred = this.cred;
    if (!cred) return (await this.check())?.cred ?? null;
    const body = await this.health(cred);
    if (matches(body, cred)) return cred;
    if (this.cred === cred) this.cred = null;
    return null;
  }

  async once(cred, method, path, body) {
    try {
      const res = await fetch(`${API.origin}:${cred.port}${path}`, request(cred, method, body));
      if (res.status === HTTP.unauthorized) return { res: null, again: true };
      return { res: { status: res.status, ok: res.ok, text: await res.text() }, again: false };
    } catch {
      return { res: null, again: method !== HTTP.post };
    }
  }

  async single(path, method = HTTP.get, body) {
    const cred = await this.trusted();
    if (!cred) return { res: null, again: true };
    const out = await this.once(cred, method, path, body);
    if (!out.res && this.cred === cred) this.cred = null;
    return out;
  }

  async send(method, path, body) {
    for (let attempt = 0; attempt < API.attempts; attempt += 1) {
      const out = await this.single(path, method, body);
      if (out.res) return out.res;
      if (!out.again) return null;
    }
    return null;
  }

  get(path) {
    return this.send(HTTP.get, path);
  }

  post(path, body = {}) {
    return this.send(HTTP.post, path, body);
  }

  put(path) {
    return this.send(HTTP.put, path);
  }

  del(path) {
    return this.send(HTTP.del, path);
  }
}

export const api = new Api();
