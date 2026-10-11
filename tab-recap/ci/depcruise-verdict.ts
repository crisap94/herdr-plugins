import { readFileSync } from 'node:fs';

type Violation = {
  readonly rule: { readonly name: string; readonly severity: string };
  readonly from: string;
  readonly to: string;
};

type Cruise = {
  readonly modules: readonly { readonly source: string }[];
  readonly summary: { readonly violations: readonly Violation[] };
};

const [mode = '', file = '', expected = ''] = process.argv.slice(2);
const cruise: Cruise = JSON.parse(readFileSync(file, 'utf8'));

const say = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

const describe = (violation: Violation): string => `${violation.rule.name}: ${violation.from} -> ${violation.to}`;

const withRule = (group: string): readonly Violation[] =>
  cruise.summary.violations.filter((violation) => violation.rule.name.startsWith(group));

if (mode === 'fires') {
  const [first] = withRule(expected);
  if (first === undefined) {
    say(`    ${expected} does not fire on ${file}`);
    process.exitCode = 1;
  } else {
    say(`    fires ${describe(first)}`);
  }
} else if (mode === 'silent') {
  const hits = withRule(expected);
  for (const hit of hits) say(`    ${describe(hit)}`);
  if (hits.length > 0) process.exitCode = 1;
} else if (mode === 'tree') {
  const errors = cruise.summary.violations.filter((violation) => violation.rule.severity === 'error');
  for (const error of errors) say(`    ${describe(error)}`);
  const seen = cruise.modules.filter((module) => module.source.endsWith('.ts')).length;
  if (seen < Number(expected)) say(`    the cruise sees ${seen} .ts modules, the tree has ${expected}`);
  if (errors.length > 0 || seen < Number(expected)) process.exitCode = 1;
} else {
  say(`unknown mode: ${mode}`);
  process.exitCode = 3;
}
