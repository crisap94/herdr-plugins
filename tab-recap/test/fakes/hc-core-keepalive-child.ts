import { CoreEvents, duration, must, parseSocketPath } from '#src/adapters/herdr-core/sdk-core.ts';

const path = must(parseSocketPath(process.argv[2]));
const events = new CoreEvents({ path, timing: { backoffBase: duration(300), backoffCap: duration(300), silence: duration(5000) } });

process.on('SIGTERM', () => { void events.close(); });
events.start();
for await (const feed of events.feed) {
    process.stdout.write(`${feed.kind}\n`);
}
