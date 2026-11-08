import { execFile } from 'node:child_process';
import { homedir } from 'node:os';

const RUNS = 30;
const TIMEOUT_MS = 10_000;
const TERMINAL = process.argv[2] ?? 't3';
const CALLS = [
    { name: 'hc ls --json', program: 'hc', args: ['ls', '--json'] },
    { name: `hc get ${TERMINAL} --json`, program: 'hc', args: ['get', TERMINAL, '--json'] },
    { name: `hc read ${TERMINAL}`, program: 'hc', args: ['read', TERMINAL] },
    { name: 'tab-recap-desktop status', program: 'tab-recap-desktop', args: ['status'] },
];

function once({ program, args }) {
    return new Promise((resolve) => {
        const started = performance.now();
        execFile(program, args, { cwd: homedir(), env: process.env, timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => {
            resolve({ ms: performance.now() - started, code: error ? (error.code ?? 1) : 0, bytes: stdout.length });
        });
    });
}

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

const rows = [];
for (const call of CALLS) {
    const samples = [];
    for (let i = 0; i < RUNS; i += 1) {
        samples.push(await once(call));
    }
    const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
    rows.push({
        name: call.name,
        runs: RUNS,
        failures: samples.filter((s) => s.code !== 0).length,
        medianMs: percentile(ms, 50).toFixed(1),
        p95Ms: percentile(ms, 95).toFixed(1),
        minMs: ms[0].toFixed(1),
        maxMs: ms[ms.length - 1].toFixed(1),
        meanBytes: Math.round(samples.reduce((sum, s) => sum + s.bytes, 0) / RUNS),
    });
}

console.log('| command | runs | failures | median ms | p95 ms | min ms | max ms | mean stdout chars |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|');
for (const r of rows) {
    console.log(`| \`${r.name}\` | ${r.runs} | ${r.failures} | ${r.medianMs} | ${r.p95Ms} | ${r.minMs} | ${r.maxMs} | ${r.meanBytes} |`);
}
