import { MEMORY } from '../connection.ts';
import { storeOver } from '../database.ts';
import { openDatabase } from '../open.ts';
import { loadAndCompare } from './import-files.ts';
import { LegacyFiles } from './legacy-files.ts';

const directory = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
if (directory === undefined) {
    process.stderr.write('usage: node src/adapters/db/import/dry-run.ts [--dry-run] <state-dir>\n');
    process.exit(2);
}
const opened = openDatabase(MEMORY);
if (opened.kind !== 'ready') {
    throw new Error('an in-memory database cannot be newer');
}
const report = loadAndCompare(storeOver(opened.db), new LegacyFiles(directory), Date.now());
process.stdout.write(`recaps ${report.recaps} · views ${report.views} · requests ${report.requests} · visibility requests ${report.visibility} · hidden.json ${report.hidden ? 'yes' : 'no'}\n`);
process.stdout.write(`${report.differences.length === 0 ? 'no differences' : `${report.differences.length} difference(s):\n${report.differences.map((line) => `  ${line}`).join('\n')}`}\n`);
process.exitCode = report.differences.length === 0 ? 0 : 1;
