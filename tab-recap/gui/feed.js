import { LONG_POLL, ROUTE } from "./constants.js";
import { api } from "./api.js";

const pause = (cx, ms) => new Promise((done) => { cx.timer.after(ms, () => done()); });
const backoff = (n) => Math.min(LONG_POLL.backoffMax, LONG_POLL.backoffBase * 2 ** Math.max(0, n - 1));

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseEvents(res) {
  const body = res?.ok ? parse(res.text) : null;
  if (!body || !Number.isInteger(body.seq) || !Array.isArray(body.events)) return null;
  return { seq: body.seq, epoch: Number.isInteger(body.epoch) ? body.epoch : null, reset: body.reset === true, events: body.events.filter((e) => e && typeof e.topic === "string") };
}

export class Feed {
  constructor(hooks) {
    this.hooks = hooks;
    this.id = 0;
    this.since = 0;
    this.epoch = null;
    this.strikes = 0;
  }

  start(cx) {
    this.id += 1;
    const id = this.id;
    cx.spawn((c) => this.run(c, id));
  }

  stop() {
    this.id += 1;
  }

  async attach() {
    const body = await api.probe();
    if (!body) return false;
    this.epoch = Number.isInteger(body.startedAt) ? body.startedAt : null;
    this.since = Number.isInteger(body.seq) ? body.seq : 0;
    return true;
  }

  async recover(cx, id) {
    if (!(await this.attach())) return false;
    if (this.id !== id) return true;
    await this.hooks.reset(cx);
    this.strikes += 1;
    if (this.strikes > 1) await pause(cx, backoff(this.strikes - 1));
    return true;
  }

  async poll(cx, id) {
    const { res } = await api.single(`${ROUTE.events}?since=${this.since}&wait=${LONG_POLL.wait}`);
    if (this.id !== id) return true;
    const body = parseEvents(res);
    if (!body) return this.recover(cx, id);
    this.strikes = 0;
    this.since = body.seq;
    const moved = body.epoch !== null && this.epoch !== null && body.epoch !== this.epoch;
    if (body.epoch !== null) this.epoch = body.epoch;
    if (body.reset || moved) await this.hooks.reset(cx);
    else if (body.events.length) await this.hooks.events(body.events, cx);
    return true;
  }

  async run(cx, id) {
    let failures = this.hooks.isApi() ? 0 : 1;
    while (this.id === id) {
      if (this.hooks.isApi()) {
        const ok = await this.poll(cx, id);
        failures = ok ? 0 : 1;
        if (!ok && this.id === id) await this.hooks.down(cx);
      } else {
        await pause(cx, backoff(failures));
        if (this.id !== id) break;
        const up = await this.attach();
        failures = up ? 0 : failures + 1;
        if (up) await this.hooks.up(cx);
      }
    }
  }
}
