# T0 lookups: clipboard in herdr-app mods; reopening a closed ledger fact

Paths shown as ~ (home). Read-only lookups; no source modified.

## 1. Clipboard in herdr-app mods

Search terms: clipboard, copy, paste, writeText, Clipboard, set_clipboard, copy_text (grep -n -i) over `~/.config/herdr-app/gpui-kit.d.ts`, `herdr.d.ts`, `AGENTS.md`.

### Writes text to the system clipboard: YES, one API (gpui-kit)

- `write_to_clipboard(text: string): void;` at `~/.config/herdr-app/gpui-kit.d.ts:348`, doc comment at :347 "`App::write_to_clipboard`." It sits in the block that starts at `gpui-kit.d.ts:287` (`export interface Context {`); the enclosing block was identified by grep and not separately confirmed.
- Capability gate: none in the declaration (:347-348). No `capabilities`/permission reference was found next to it.
- Paired reader: `read_from_clipboard(): string | undefined;` at `gpui-kit.d.ts:346` ("`undefined` when it holds no text").

### herdr.d.ts: no direct clipboard write

- `herdr.d.ts` has no clipboard function. Only `terminal.copy` and `terminal.paste` action names appear, at `~/.config/herdr-app/herdr.d.ts:63`: "terminal.copy, terminal.paste". These are keybinding actions on the focused terminal, not a text-write API.
- `herdr.d.ts:316` `feedbackPasteImage()` reads an image from the clipboard; not a write.

### Terminal OSC 52 (program-driven, separately gated)

- `~/.config/herdr-app/AGENTS.md:714-719`: "`clipboard_write`: `false` blocks terminal programs from writing the local clipboard (default `true`...)". OSC 52 `c` writes the system clipboard; "Clipboard reads (`?`) are never allowed." This is a settings toggle, not a mod API.

### Select-all / read-only selectable mode

- `gpui-kit.d.ts:21449-21450` (code editor options): `/** Rejects user edits, but allows selection and copy. */ readonly?: boolean;` This is a code-editor option (block starts near :21429, "built-in source editing and read-only code viewing"). Readonly editor allows selection and copy.
- `gpui-kit.d.ts:21432`: "Programmatic replacement works even in readonly mode."
- `gpui-kit.d.ts:20704`: `selectable(value?: boolean): this;` (a generic element method; context not inspected further).
- `gpui-kit.d.ts:20676`: `selected: boolean; disabled: boolean; readonly: boolean;` (state fields; context not inspected).
- `InputState` (`gpui-kit.d.ts:21330-21341`) exposes `set_selected_range(range: InputRange)` (:21335) but no select-all method and no read-only flag was found in the grep for `select_all|selectAll|select-all|read_only|readonly|read-only|selectable`.
- Answer for Input/Textarea: no select-all method found; a read-only mode was not found on Input. The read-only selectable mode found is on the code editor (:21449-21450).

## 2. Reopening a closed fact in the tab-recap ledger

Base: `~/Projects/homelab/herdr-plugins-gui-port/tab-recap/`

### Op union

`src/recap/domain/ops.ts:29`: `export type Operation = AddOp | UpdateOp | CloseOp;`

- Three kinds: `add` (AddOp, :4-13), `update` (UpdateOp, :15-21), `close` (CloseOp, :23-27).
- No `open` op. Grep for `reopen` and `op: 'open'` in `src` returned no fact-reopen hits. The only `reopen*` hits are tab-level (`src/recap/domain/policy.ts`, `board.ts`, `dispatch.ts`) and are unrelated.

### Can any op turn a closed fact back to open?

- No. `closedBy` (`ops.ts:57`) sets `state: 'closed'`. `updateOne` (`ops.ts:79-80`) refuses closed targets: `if (target.state === 'closed') { return { facts, refusal: { op, reason: 'closed' } }; }`. `closeOne` refuses already-closed targets (`ops.ts:64-65`).
- No code path assigns `state: 'open'` except `addOne` on a new fact (`ops.ts:96`: `state: 'open'`).
- So the only route back to an open fact is adding a new fact (new id via `run.mint()`, `ops.ts:95`) with the same or similar text. Note `src/recap/domain/gates/g2-ledger-duplicate.ts:26-33` checks adds against earlier adds by Jaccard similarity (`OPEN_ALIKE`); it was not checked whether it also compares against closed facts.

### CloseOp shape

`src/recap/domain/ops.ts:23-27`:
```
export interface CloseOp {
    readonly op: 'close';
    readonly id: string;
    readonly why: ClosedWhy | null;
}
```
`ClosedWhy` (`src/recap/domain/fact.ts:14`): `'done' | 'wrong' | 'superseded' | 'answered' | 'merged' | 'rewritten'`.

### closeOne refusal conditions (`ops.ts:59-72`)

1. `unknown-id`: `if (target === undefined)` (`ops.ts:61-62`), id not in the facts list.
2. `closed`: `if (target.state === 'closed')` (`ops.ts:64-65`).
3. `no-why`: `if (op.why === null)` (`ops.ts:67-68`).

`Reason` type (`ops.ts:36`): `'unknown-id' | 'closed' | 'no-why' | 'second-goal'`. `second-goal` applies to adds only (`ops.ts:120`).

Refusals are also returned as `reason: 'closed'`/`'no-why'` etc. Note: `closeOne` does not check `why` against `ClosedWhy` values; it only checks null.

### Reconciliation-level refusals (for LLM answers, `src/recap/domain/reconciliation.ts`)

Not the ledger's `closeOne`, but they gate closes before apply:
- `kind` (:43-44): `add` refused; op must be `update` or `close`.
- `open` (:46-50): target must be an open fact not yet touched: `is not an open fact (or is already changed)`.
- `reason` (:52-61): close needs why in `done, wrong, superseded, answered, merged`; `answered` only for `needs` section.
- `merge` (:63-66): merged needs another open fact as `into`.
- `evidence` (:68-71): evidence quote must be in newest turns.

### Ledger.apply signature

`src/ports/ledger.ts:23`:
```
apply(run: RunRef, ops: readonly Operation[]): Applied;
```
`Applied` (`ledger.ts:4-7`): `{ changed: readonly Fact[]; refused: readonly Refusal[] }`.
Domain-level `apply` (`src/recap/domain/ops.ts:102`): `export function apply(ledger: readonly Fact[], ops: readonly Operation[], run: RunRef, sweepNow = false): Folded;` (close ops run first, then update, then add; `ops.ts:112-121`).

### RunRef type

`src/recap/domain/ops.ts:43-49`:
```
export interface RunRef {
    readonly id: RunId;
    readonly task: TaskId;
    readonly at: number;
    readonly language: string;
    mint(): FactId;
}
```
- `id: RunId` (branded string, `fact.ts:4`)
- `task: TaskId` (`{ tab: string; key: string }`, `fact.ts:6-9`)
- `at: number`
- `language: string`
- `mint(): FactId`

### Precedent: stories.ts around line 40

`src/adapters/db/stories.ts:40`:
```
const ref = { id: typeIdOf('run', blob(latest, 'id')) as RunId, task: run.task, at: run.at, language: run.language, mint: (): FactId => { throw new Error('the curator adds no fact'); } };
```
Context: `keep()` (`stories.ts:34-47`) passes this ref to `this.ledger.apply(ref, [...change.merges, ...(change.reconciled ?? [])])` at :41. Its `mint` throws because the curator only closes or updates facts; `mint` is called only by `addOne` (`ops.ts:95`), so a throw is safe only when no add op is in the batch. Note that `keep` also throws earlier (`stories.ts:37-39`) if the tab has no run.

## Summary

- Clipboard write: yes, `App.write_to_clipboard(text: string): void` at `~/.config/herdr-app/gpui-kit.d.ts:348`, no capability gate in the declaration.
- Reopen op: no. Only `add`, `update`, `close`. A closed fact returns to open only by a new add.
- RunRef fields: `id: RunId`, `task: TaskId`, `at: number`, `language: string`, `mint(): FactId` (`src/recap/domain/ops.ts:43-49`).
