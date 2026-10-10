import type { InFlightResult } from '#src/ports/transcripts.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { arr, obj, parse, str } from './jsonl.ts';
import type { Row } from './jsonl.ts';

export const CODEX_IN_FLIGHT_INITIAL_BYTES = 2 * 1024 * 1024;
export const CODEX_IN_FLIGHT_MAX_BYTES = 16 * 1024 * 1024;

interface FlightScan {
    readonly count: number;
    readonly openCall: boolean;
}

interface FlightState {
    readonly calls: Set<string>;
    readonly waits: Map<string, string>;
    readonly cells: Map<string, boolean>;
}

const outputOf = (value: unknown): readonly string[] => {
    if (typeof value === 'string') return [value];
    return arr(value).flatMap((part) => part['type'] === 'input_text' ? [str(part['text']) ?? ''] : []);
};

const cellOf = (text: string): string | null => /Script running with cell ID ([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? null;

function taskStartAt(rows: readonly Row[]): number {
    let found = -1;
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const payload = obj(row?.['payload']);
        if (row?.['type'] === 'event_msg' && payload['type'] === 'task_started') found = index;
    }
    return found;
}

function waitCell(payload: Row): string | null {
    if (payload['name'] !== 'wait') return null;
    const raw = payload['arguments'] ?? payload['input'];
    const input = typeof raw === 'string' ? parse(raw) ?? {} : obj(raw);
    return str(input['cell_id']);
}

function callOf(payload: Row, state: FlightState): void {
    const id = str(payload['call_id']);
    if (id === null) return;
    state.calls.add(id);
    const cell = waitCell(payload);
    if (cell !== null) state.waits.set(id, cell);
}

function outputOfRow(payload: Row, state: FlightState): void {
    const id = str(payload['call_id']);
    if (id === null) return;
    state.calls.delete(id);
    const outputs = outputOf(payload['output']);
    if (payload['type'] === 'custom_tool_call_output') {
        for (const output of outputs) {
            const cell = cellOf(output);
            if (cell !== null) state.cells.set(cell, true);
        }
        return;
    }
    const cell = state.waits.get(id);
    if (cell !== undefined) state.cells.set(cell, !outputs.some((output) => output.includes('Script completed')));
}

function rowsOfFlight(rows: readonly Row[]): FlightState {
    const state: FlightState = { calls: new Set(), waits: new Map(), cells: new Map() };
    for (const row of rows) {
        if (row['type'] !== 'response_item') continue;
        const payload = obj(row['payload']);
        const type = str(payload['type']);
        if (type === 'custom_tool_call' || type === 'function_call') callOf(payload, state);
        if (type === 'custom_tool_call_output' || type === 'function_call_output') outputOfRow(payload, state);
    }
    return state;
}

function scanRows(lines: readonly string[]): FlightScan {
    const rows = lines.map(parse).filter((row): row is Row => row !== null);
    const startedAt = taskStartAt(rows);
    const state = rowsOfFlight(rows.slice(startedAt + 1));
    return { count: state.calls.size + [...state.cells.values()].filter(Boolean).length, openCall: state.calls.size > 0 };
}

export function codexInFlight(lines: readonly string[], truncated: boolean): InFlightResult {
    const found = scanRows(lines);
    if (truncated && found.openCall) {
        return unknown({ why: 'unreadable', detail: 'the truncated rollout tail contains an open call' });
    }
    return { kind: 'in-flight', count: found.count };
}
