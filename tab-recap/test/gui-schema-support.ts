import { readFileSync } from 'node:fs';

interface Schema {
    readonly type?: string | readonly string[];
    readonly const?: unknown;
    readonly enum?: readonly unknown[];
    readonly required?: readonly string[];
    readonly properties?: Readonly<Record<string, Schema>>;
    readonly additionalProperties?: boolean;
    readonly items?: Schema;
    readonly $ref?: string;
    readonly anyOf?: readonly Schema[];
    readonly oneOf?: readonly Schema[];
    readonly minLength?: number;
    readonly pattern?: string;
    readonly minimum?: number;
    readonly maximum?: number;
    readonly $defs?: Readonly<Record<string, Schema>>;
}

const V2: Schema = JSON.parse(readFileSync(new URL('../schema/gui-tab.v2.schema.json', import.meta.url), 'utf8'));

function kindOf(value: unknown): string {
    if (value === null) { return 'null'; }
    if (Array.isArray(value)) { return 'array'; }
    return typeof value === 'number' && Number.isInteger(value) ? 'integer' : typeof value;
}

function typeMatches(value: unknown, type: string | readonly string[]): boolean {
    const kind = kindOf(value);
    return [type].flat().some((allowed) => allowed === kind || (allowed === 'number' && kind === 'integer'));
}

function refOf(schema: Schema): Schema {
    if (schema.$ref === undefined) { return schema; }
    const target = V2.$defs?.[schema.$ref.split('/').pop() ?? ''];
    if (target === undefined) { throw new Error(`unknown reference ${schema.$ref}`); }
    return target;
}

function typedProblems(value: unknown, schema: Schema, at: string): string[] {
    const found: string[] = [];
    if (schema.const !== undefined && value !== schema.const) { found.push(`${at}: not the constant`); }
    if (schema.enum !== undefined && !schema.enum.includes(value)) { found.push(`${at}: not one of the allowed values`); }
    if (schema.type !== undefined && !typeMatches(value, schema.type)) { found.push(`${at}: ${kindOf(value)} is not ${[schema.type].flat().join('|')}`); }
    return found;
}

function textBoundProblems(value: string, schema: Schema, at: string): string[] {
    const short = schema.minLength !== undefined && value.length < schema.minLength;
    const blank = schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value);
    return [...(short ? [`${at}: shorter than ${schema.minLength}`] : []), ...(blank ? [`${at}: does not match ${schema.pattern}`] : [])];
}

function numberBoundProblems(value: number, schema: Schema, at: string): string[] {
    const low = schema.minimum !== undefined && value < schema.minimum;
    const high = schema.maximum !== undefined && value > schema.maximum;
    return [...(low ? [`${at}: below ${schema.minimum}`] : []), ...(high ? [`${at}: above ${schema.maximum}`] : [])];
}

function boundProblems(value: unknown, schema: Schema, at: string): string[] {
    if (typeof value === 'string') { return textBoundProblems(value, schema, at); }
    return typeof value === 'number' ? numberBoundProblems(value, schema, at) : [];
}

function choiceProblems(value: unknown, schema: Schema, at: string): string[] {
    const options = schema.oneOf ?? schema.anyOf;
    if (options === undefined) { return []; }
    const passing = options.filter((option) => problemsAt(value, option, at).length === 0).length;
    const fits = schema.oneOf === undefined ? passing >= 1 : passing === 1;
    return fits ? [] : [`${at}: matches ${passing} of ${options.length} options`];
}

function objectProblems(fields: ReadonlyMap<string, unknown>, schema: Schema, at: string): string[] {
    const missing = (schema.required ?? []).filter((key) => !fields.has(key)).map((key) => `${at}.${key}: missing`);
    const extra = schema.additionalProperties === false ? [...fields.keys()].filter((key) => schema.properties?.[key] === undefined).map((key) => `${at}.${key}: not in the schema`) : [];
    const inner = Object.entries(schema.properties ?? {}).flatMap(([key, child]) => (fields.has(key) ? problemsAt(fields.get(key), child, `${at}.${key}`) : []));
    return [...missing, ...extra, ...inner];
}

function problemsAt(value: unknown, declared: Schema, at: string): string[] {
    const schema = refOf(declared);
    const own = [...typedProblems(value, schema, at), ...boundProblems(value, schema, at), ...choiceProblems(value, schema, at)];
    if (own.length > 0 || typeof value !== 'object' || value === null) { return own; }
    if (Array.isArray(value)) { return value.flatMap((item, index) => problemsAt(item, schema.items ?? {}, `${at}[${index}]`)); }
    return objectProblems(new Map(Object.entries(value)), schema, at);
}

export function v2Problems(value: unknown): readonly string[] {
    return problemsAt(value, V2, '$');
}
