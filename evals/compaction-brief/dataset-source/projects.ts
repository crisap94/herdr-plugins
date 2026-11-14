export type Language = 'en' | 'es' | 'pt';

export interface Part {
    readonly name: string;
    readonly path: string;
}

export interface Project {
    readonly name: string;
    readonly language: Language;
    readonly label: string;
    readonly host: string;
    readonly goal: string;
    readonly oldGoal: string | null;
    readonly decisions: readonly (readonly [string, string])[];
    readonly needs: readonly (readonly [string, boolean])[];
    readonly rules: readonly string[];
    readonly now: readonly string[];
    readonly next: readonly string[];
    readonly parts: readonly Part[];
    readonly features: readonly string[];
    readonly bugs: readonly string[];
    readonly commands: readonly string[];
    readonly branches: readonly string[];
    readonly mergeBase: number;
}

const orchard: Project = {
    name: 'orchard-api',
    language: 'en',
    label: 'orchard-api idempotent submit',
    host: 'git.orchard.test',
    goal: 'Ship idempotent order submission in orchard-api so a retried checkout never creates a second order',
    oldGoal: 'Stop duplicate orders caused by double clicks on the checkout button',
    decisions: [
        ['Idempotency keys live in the orders table, not in Redis', 'a key must survive a cache flush, and Redis is flushed on every deploy'],
        ['Idempotency keys expire after 72 hours', 'the payment provider retries webhooks for up to 48 hours and we keep a day of margin'],
        ['A replayed request returns the stored response with status 200, not 409', 'the mobile client treats 409 as a failed checkout and shows an error'],
        ['The key is the Idempotency-Key header hashed together with the customer id', 'two customers can send the same header value by accident'],
        ['Migrations run as a separate job before the rollout, never at boot', 'three replicas booting together raced on the same migration in staging'],
        ['Use a partial unique index on (customer_id, key_hash) where expired_at is null', 'a full unique index blocked reuse of a key after expiry'],
        ['Order totals are stored in integer cents', 'float totals drifted by one cent on orders with 7 or more lines'],
        ['The submit handler holds no transaction while calling the payment provider', 'a slow provider call held row locks for 30 seconds in the load test'],
        ['Keep the v1 submit route alive until 2027-01-15', 'the warehouse scanner firmware still calls v1 and cannot be updated before then'],
        ['Integration tests run against a real Postgres 17 container, not pg-mem', 'pg-mem does not support partial unique indexes'],
    ],
    needs: [
        ['Operator must say whether expired keys are deleted or kept for audit', true],
        ['test/submit/replay.test.ts fails: the second submit returns 500 instead of the stored response', false],
        ['Operator to confirm the 72 hour expiry with the payments team before the rollout', true],
        ['scripts/backfill-key-hash.ts times out on the 4.1 million row orders table', false],
        ['Which environment gets the migration first: staging-eu or staging-us?', true],
        ['src/orders/submit.ts still opens the transaction before the provider call', false],
        ['The load test at 200 requests per second has not been rerun since the index change', false],
        ['Operator must approve merge request !412 before the migration job is scheduled', true],
        ['The webhook handler in src/payments/webhook.ts ignores the Idempotency-Key header', false],
    ],
    rules: [
        'Never run a migration against production from a laptop',
        'Every change to src/orders needs a test in test/submit',
        'Do not push to main; open a merge request against release/2.8',
        'Ask before adding a dependency',
        'Keep each merge request under 400 changed lines',
    ],
    now: [
        'Rewriting src/orders/submit.ts so the provider call happens outside the transaction',
        'Rerunning test/submit/replay.test.ts after the handler change',
        'Measuring the backfill in batches of 5,000 rows',
    ],
    next: [
        'Add the partial unique index in migrations/0042_idempotency_keys.sql',
        'Rerun the load test at 200 requests per second',
        'Write docs/api/idempotency.md with the replay response',
        'Wire the webhook handler to the key store',
        'Schedule the migration job once !412 is approved',
    ],
    parts: [
        { name: 'the submit handler', path: 'src/orders/submit.ts' },
        { name: 'the key store', path: 'src/orders/key-store.ts' },
        { name: 'the pricing module', path: 'src/orders/pricing.ts' },
        { name: 'the webhook handler', path: 'src/payments/webhook.ts' },
        { name: 'the provider client', path: 'src/payments/provider-client.ts' },
        { name: 'the rate limiter', path: 'src/http/rate-limit.ts' },
        { name: 'the order repository', path: 'src/orders/repository.ts' },
        { name: 'the request validator', path: 'src/http/validate.ts' },
    ],
    features: ['a retry with backoff', 'structured error codes', 'a request id in every log line', 'input validation for empty carts', 'a timeout of 5 seconds', 'a metrics counter', 'a typed result instead of exceptions', 'pagination', 'a dry-run flag', 'an explicit null check'],
    bugs: ['an off-by-one in the batch loop', 'a missing await', 'a wrong status code on empty input', 'a leaked connection on error', 'a timezone error at midnight', 'a duplicate log line', 'a race on first write', 'a swallowed error'],
    commands: ['bun test test/submit', 'bun test', 'bun run typecheck', 'bun run lint', 'bun run migrate:dry'],
    branches: ['feat/idempotent-submit', 'release/2.8', 'fix/replay-status'],
    mergeBase: 380,
};

const lantern: Project = {
    name: 'lantern-ui',
    language: 'en',
    label: 'lantern-ui 4.0 tokens',
    host: 'git.lantern.test',
    goal: 'Release lantern-ui 4.0 with the new color tokens and no visual regression in the 38 published components',
    oldGoal: 'Fix the contrast failures found in the version 3 accessibility audit',
    decisions: [
        ['Color tokens are CSS custom properties, not Sass variables', 'apps must switch theme at runtime without a rebuild'],
        ['The dark theme is derived from the light palette by a script, not hand-picked', 'the hand-picked dark palette failed contrast on 9 components'],
        ['Minimum text contrast is 4.5 to 1, checked in CI', 'the accessibility audit of version 3 failed on that exact threshold'],
        ['The spacing scale stays at 4 px steps', 'the 2 px experiment broke alignment in the data grid'],
        ['The Button component keeps its variant prop name', '214 call sites in the two client apps use it and a rename buys nothing'],
        ['Visual snapshots are taken at 1280 and 375 px wide only', 'five widths made the suite take 41 minutes'],
        ['Icons ship as a single sprite file', 'one request per icon made the settings page load 60 files'],
        ['Drop support for the legacy theme prop in 4.0', 'it cannot express the new semantic tokens'],
        ['Focus rings use the outline property, not box-shadow', 'box-shadow is clipped inside scroll containers'],
        ['Publish under the next dist-tag for two weeks before latest', 'the 3.0 release broke a client app on the day it shipped'],
    ],
    needs: [
        ['Operator must choose the name of the new semantic token for warnings: caution or warning', true],
        ['tests/visual/select.spec.ts fails at 375 px: the menu overflows the viewport by 12 px', false],
        ['Operator to confirm that the date picker can ship in 4.1 instead of 4.0', true],
        ['packages/tokens/build.mjs still emits the three removed Sass files', false],
        ['The contrast check in ci/contrast.mjs skips disabled states', false],
        ['Should the migration guide cover version 2 users or only version 3?', true],
        ['The tooltip in packages/react/src/tooltip.tsx loses its arrow in the dark theme', false],
        ['Operator must approve the changelog in merge request !88 before the next publish', true],
        ['docs/migrating-to-4.md has no section on the removed theme prop', false],
    ],
    rules: [
        'Never change a published token name without a deprecation entry',
        'Every component change needs a visual snapshot at both widths',
        'Do not publish from a local machine; only the release pipeline publishes',
        'Keep bundle growth under 2 kB per component',
        'Write changelog entries in the imperative',
    ],
    now: [
        'Fixing the select menu overflow at 375 px in packages/react/src/select.tsx',
        'Regenerating the dark palette with scripts/derive-dark.mjs',
        'Updating snapshots for the 6 components touched by the focus ring change',
    ],
    next: [
        'Remove the Sass output from packages/tokens/build.mjs',
        'Add disabled states to ci/contrast.mjs',
        'Write the theme prop section of docs/migrating-to-4.md',
        'Publish 4.0.0-next.3 once !88 is approved',
        'Fix the tooltip arrow in the dark theme',
    ],
    parts: [
        { name: 'the select', path: 'packages/react/src/select.tsx' },
        { name: 'the tooltip', path: 'packages/react/src/tooltip.tsx' },
        { name: 'the button', path: 'packages/react/src/button.tsx' },
        { name: 'the token build', path: 'packages/tokens/build.mjs' },
        { name: 'the data grid', path: 'packages/react/src/data-grid.tsx' },
        { name: 'the dialog', path: 'packages/react/src/dialog.tsx' },
        { name: 'the contrast check', path: 'ci/contrast.mjs' },
        { name: 'the sprite builder', path: 'packages/icons/build-sprite.mjs' },
    ],
    features: ['a focus ring', 'a dark theme snapshot', 'a disabled state', 'keyboard navigation', 'a reduced-motion variant', 'an aria-label', 'a density prop', 'right-to-left layout', 'a loading state', 'a size token'],
    bugs: ['a 1 px border shift', 'a wrong hover color', 'a missing aria attribute', 'a clipped shadow', 'a z-index clash', 'a flicker on first paint', 'a wrong token reference', 'an unescaped class name'],
    commands: ['pnpm test:visual', 'pnpm build', 'pnpm lint', 'pnpm test', 'node ci/contrast.mjs'],
    branches: ['release/4.0', 'feat/color-tokens', 'fix/select-overflow'],
    mergeBase: 60,
};

const quarry: Project = {
    name: 'quarry-sync',
    language: 'en',
    label: 'quarry-sync resume upload',
    host: 'git.quarry.test',
    goal: 'Make quarry-sync resume an interrupted upload from the last confirmed chunk instead of restarting the file',
    oldGoal: 'Find why large uploads restart from zero after a network drop',
    decisions: [
        ['Chunks are 8 MiB, fixed', 'the storage backend rejects parts under 5 MiB and variable sizes complicated resume'],
        ['Resume state is a sidecar file next to the journal, not a row in the journal', 'journal compaction rewrote rows and lost the offset twice'],
        ['Chunk hashes use BLAKE3', 'SHA-256 cost 31 percent of CPU on the 2-core test box'],
        ['A chunk counts as confirmed only after the server returns its hash', 'a 200 without a body was seen for a chunk that was never stored'],
        ['Retry a failed chunk 5 times with jitter, then pause the file', 'unbounded retries drained a laptop battery in the field report'],
        ['The daemon never deletes a remote file on its own', 'the only data loss so far came from an automatic delete after a clock jump'],
        ['Config stays in TOML at ~/.config/quarry/config.toml', 'users already script edits to that file'],
        ['No more than 4 chunks upload in parallel', '6 parallel chunks tripped the per-client server limit of 32 MiB in flight'],
        ['Use the tokio file API, not memory maps', 'a memory-mapped file on a network mount crashed the daemon when the mount dropped'],
        ['The sidecar format starts with a u16 version', 'the first format had no version and could not be migrated'],
    ],
    needs: [
        ['tests/resume.rs fails on macOS in resumes_after_kill: the sidecar is not flushed before the kill', false],
        ['Operator must decide whether a paused file retries on the next start or waits for a command', true],
        ['crates/daemon/src/upload.rs still restarts from chunk 0 when the sidecar is older than the file', false],
        ['Operator to confirm that 8 MiB chunks are acceptable on metered connections', true],
        ['benches/chunking.rs has no run on the 2-core box since the BLAKE3 change', false],
        ['Should the sidecar live in the cache directory or the state directory?', true],
        ['cargo clippy reports 3 warnings in crates/daemon/src/sidecar.rs', false],
        ['The progress line prints 0 percent after a resume', false],
        ['Operator must review docs/sidecar-format.md before the format version is frozen', true],
    ],
    rules: [
        'Never use unwrap outside tests',
        'Every new error gets a variant in crates/daemon/src/error.rs',
        'Run cargo fmt and cargo clippy before every commit',
        'Do not touch the wire protocol in crates/proto without asking',
        'Benchmarks run on the 2-core box, not on the workstation',
    ],
    now: [
        'Adding an fsync of the sidecar after each confirmed chunk in crates/daemon/src/sidecar.rs',
        'Rerunning tests/resume.rs on macOS',
        'Fixing the progress line after a resume',
    ],
    next: [
        'Handle a sidecar older than the file in crates/daemon/src/upload.rs',
        'Clear the 3 clippy warnings in crates/daemon/src/sidecar.rs',
        'Run benches/chunking.rs on the 2-core box',
        'Finish docs/sidecar-format.md',
        'Tag v0.9.0-rc1 after the resume test passes on all three systems',
    ],
    parts: [
        { name: 'the upload loop', path: 'crates/daemon/src/upload.rs' },
        { name: 'the sidecar writer', path: 'crates/daemon/src/sidecar.rs' },
        { name: 'the journal', path: 'crates/daemon/src/journal.rs' },
        { name: 'the chunker', path: 'crates/daemon/src/chunker.rs' },
        { name: 'the retry policy', path: 'crates/daemon/src/retry.rs' },
        { name: 'the config loader', path: 'crates/daemon/src/config.rs' },
        { name: 'the progress reporter', path: 'crates/cli/src/progress.rs' },
        { name: 'the watcher', path: 'crates/daemon/src/watcher.rs' },
    ],
    features: ['a bounded channel', 'a typed error variant', 'a tracing span', 'a cancel token', 'a timeout of 30 seconds', 'a property test', 'a checksum field', 'a dry-run mode', 'a builder for options', 'a debug assertion'],
    bugs: ['a deadlock on shutdown', 'an off-by-one at the last chunk', 'a wrong offset after a short read', 'a panic on an empty file', 'a leaked file handle', 'a busy loop while paused', 'a stale path after rename', 'an ignored error on close'],
    commands: ['cargo test', 'cargo clippy', 'cargo test --test resume', 'cargo fmt --check', 'cargo bench --bench chunking'],
    branches: ['feat/resume-upload', 'main', 'fix/sidecar-fsync'],
    mergeBase: 140,
};

const harbor: Project = {
    name: 'harbor-billing',
    language: 'en',
    label: 'harbor-billing gapless numbering',
    host: 'git.harbor.test',
    goal: 'Move harbor-billing invoice numbering to gapless per-tenant sequences before the January 2027 billing run',
    oldGoal: 'Explain the 340 gaps in the 2025 invoice numbers',
    decisions: [
        ['Invoice numbers come from a per-tenant counter row locked with SELECT FOR UPDATE', 'a database sequence leaves gaps on rollback and the tax authority rejects gaps'],
        ['Numbers are assigned at finalization, not at draft creation', 'deleted drafts were the source of 340 gaps last year'],
        ['The number format is TENANT-YYYY-NNNNNN', 'the accounting export parses the year from the second field'],
        ['Credit notes share the invoice counter', 'the auditor asked for one unbroken series per tenant'],
        ['The nightly job finalizes at 02:00 UTC', 'the bank file is cut at 03:00 UTC and must contain the invoices of the day'],
        ['Existing 2026 numbers are never renumbered', 'they are already filed with the tax authority'],
        ['PDF rendering moves to a worker queue', 'rendering inside the request held the counter lock for up to 8 seconds'],
        ['Amounts use Decimal with 4 places internally, rounded to 2 at output', 'rounding per line and summing gave totals 0.01 off the tax office calculator'],
        ['A failed finalization releases no number', 'the counter update and the invoice update share one transaction'],
        ['Tenants migrate in 3 waves, smallest first', 'a fault should hit the 12 pilot tenants before the 4 large ones'],
    ],
    needs: [
        ['Operator must confirm the wave 1 tenant list in ops/waves/wave1.csv', true],
        ['tests/numbering/test_concurrent.py fails 1 run in 20: two invoices get the same number', false],
        ['Operator to decide whether voided invoices keep their number or free it', true],
        ['billing/numbering/counter.py takes the lock after reading the counter, not before', false],
        ['The dry run on the copy of production reported 17 tenants with existing gaps', false],
        ['Does the auditor need the gap report as CSV or as PDF?', true],
        ['The worker in billing/render/worker.py has no retry when the font cache is cold', false],
        ['Operator must sign off the cutover plan in docs/cutover-2027.md by 2026-12-05', true],
        ['The export in billing/export/ledger.py still reads the old invoice_no column', false],
    ],
    rules: [
        'Never write to the production database outside a reviewed migration',
        'Every money calculation has a test with the tax office examples in tests/fixtures/tax',
        'Use Decimal, never float, for amounts',
        'Do not rename a column without a two-step migration',
        'Run ruff and mypy before every commit',
    ],
    now: [
        'Moving the lock before the read in billing/numbering/counter.py',
        'Running tests/numbering/test_concurrent.py 200 times in a loop',
        'Listing the 17 tenants with gaps into ops/reports/gaps-2026.csv',
    ],
    next: [
        'Point billing/export/ledger.py at the new invoice_number column',
        'Add a retry to billing/render/worker.py',
        'Write the gap report for the auditor',
        'Run the wave 1 migration on the staging copy',
        'Update docs/cutover-2027.md with the rollback steps',
    ],
    parts: [
        { name: 'the counter', path: 'billing/numbering/counter.py' },
        { name: 'the finalizer', path: 'billing/numbering/finalize.py' },
        { name: 'the render worker', path: 'billing/render/worker.py' },
        { name: 'the ledger export', path: 'billing/export/ledger.py' },
        { name: 'the nightly job', path: 'billing/jobs/nightly.py' },
        { name: 'the tenant model', path: 'billing/tenants/models.py' },
        { name: 'the credit note service', path: 'billing/credit/service.py' },
        { name: 'the rounding helpers', path: 'billing/money/rounding.py' },
    ],
    features: ['a retry with backoff', 'a structured log field', 'a type annotation', 'an index on tenant_id', 'a dry-run flag', 'a timeout of 10 seconds', 'an idempotency check', 'a metrics counter', 'a validation error', 'a fixture for leap years'],
    bugs: ['a naive datetime', 'a float in a money path', 'a missing commit', 'a wrong rounding mode', 'an N+1 query', 'a swallowed exception', 'a lock taken too late', 'a duplicated row on retry'],
    commands: ['pytest tests/numbering', 'pytest', 'ruff check .', 'mypy billing', 'python -m billing.jobs.nightly --dry-run'],
    branches: ['feat/gapless-numbering', 'main', 'fix/counter-lock'],
    mergeBase: 900,
};

const kestrel: Project = {
    name: 'kestrel-cli',
    language: 'en',
    label: 'kestrel-cli deploy preview',
    host: 'git.kestrel.test',
    goal: 'Add a kestrel deploy --preview command that uploads a build to a preview URL and prints it',
    oldGoal: null,
    decisions: [
        ['Preview URLs are derived from the branch name plus a 6 character hash', 'two branches named fix would otherwise collide'],
        ['Previews expire after 7 days', 'the storage quota is 50 GB and one build is about 180 MB'],
        ['The command exits 0 only after the URL answers 200', 'CI steps posted dead links when the upload finished before the CDN was ready'],
        ['Config is read from kestrel.yaml in the repository root only', 'searching parent directories picked up a stale file in the monorepo'],
        ['Uploads use 6 parallel workers', '8 workers hit the API limit of 100 requests per second'],
    ],
    needs: [
        ['Operator must choose whether --preview asks for confirmation on the main branch', true],
        ['internal/deploy/preview_test.go fails: the hash differs between Linux and macOS', false],
        ['cmd/kestrel/deploy.go prints the URL before the readiness check', false],
        ['Should expired previews be deleted by the CLI or by a server job?', true],
    ],
    rules: ['No new dependency without asking', 'Every flag needs an entry in docs/cli.md', 'Errors go to stderr, results to stdout'],
    now: ['Making the hash in internal/deploy/hash.go independent of path separators', 'Moving the print after the readiness check in cmd/kestrel/deploy.go'],
    next: ['Document --preview in docs/cli.md', 'Add the 7 day expiry header to the upload', 'Run go vet and the full test suite'],
    parts: [
        { name: 'the deploy command', path: 'cmd/kestrel/deploy.go' },
        { name: 'the hash helper', path: 'internal/deploy/hash.go' },
        { name: 'the uploader', path: 'internal/deploy/upload.go' },
        { name: 'the config reader', path: 'internal/config/read.go' },
        { name: 'the readiness check', path: 'internal/deploy/ready.go' },
        { name: 'the API client', path: 'internal/api/client.go' },
    ],
    features: ['a --json flag', 'a progress bar', 'a context timeout', 'a retry on 503', 'a table-driven test', 'a wrapped error', 'a --quiet flag', 'a default of 6 workers'],
    bugs: ['a nil pointer on an empty config', 'a wrong exit code', 'a path separator bug', 'a goroutine leak', 'an unclosed response body', 'a race in the worker pool'],
    commands: ['go test ./...', 'go vet ./...', 'go test ./internal/deploy', 'go build ./cmd/kestrel'],
    branches: ['feat/deploy-preview', 'main'],
    mergeBase: 20,
};

const marlin: Project = {
    name: 'marlin-docs',
    language: 'en',
    label: 'marlin-docs search ranking',
    host: 'git.marlin.test',
    goal: 'Rebuild the marlin-docs search so a query returns the right page in the first three results',
    oldGoal: null,
    decisions: [
        ['The index is built at publish time and shipped as one JSON file', 'the hosting is static and cannot run a search server'],
        ['Headings weigh 3 times body text', 'the test queries matched boilerplate paragraphs before the page that defines the term'],
        ['Code blocks are indexed without tokens shorter than 3 characters', 'single letters from code made the index 4 times larger'],
        ['Version 1 pages are excluded from the index', 'readers landed on the deprecated install guide'],
        ['The index file must stay under 900 kB gzipped', 'the mobile budget for the docs page is 1 MB'],
    ],
    needs: [
        ['search/eval/queries.tsv has 12 of 60 queries still failing the top-three check', false],
        ['Operator must decide whether the API reference is searchable from the guide pages', true],
        ['build/index.mjs emits 1.3 MB gzipped after code blocks were added', false],
        ['Operator to supply the list of synonyms for product names', true],
    ],
    rules: ['Do not edit generated files under public/', 'Every search change is measured on search/eval/queries.tsv', 'Keep page titles under 60 characters'],
    now: ['Dropping short tokens from code blocks in build/tokenize.mjs', 'Rerunning the 60 query check'],
    next: ['Exclude content/v1 from build/index.mjs', 'Measure the gzipped index size after the token change', 'Add synonyms once the list arrives'],
    parts: [
        { name: 'the index builder', path: 'build/index.mjs' },
        { name: 'the tokenizer', path: 'build/tokenize.mjs' },
        { name: 'the ranker', path: 'search/rank.mjs' },
        { name: 'the search box', path: 'site/components/search-box.mjs' },
        { name: 'the query check', path: 'search/eval/run.mjs' },
        { name: 'the page loader', path: 'build/pages.mjs' },
    ],
    features: ['a stop word list', 'a weight for headings', 'a size report', 'a debounce of 150 ms', 'a highlight of the match', 'a fallback for empty results', 'a version filter', 'a stemmer'],
    bugs: ['a broken anchor', 'a duplicated entry', 'a wrong weight', 'an unescaped query', 'a missing title', 'a case-sensitive match'],
    commands: ['npm run build', 'npm run search:eval', 'npm test', 'npm run lint'],
    branches: ['feat/search-rank', 'main'],
    mergeBase: 40,
};

const colmena: Project = {
    name: 'colmena-etl',
    language: 'es',
    label: 'colmena-etl carga incremental',
    host: 'git.colmena.test',
    goal: 'Migrar la carga nocturna de colmena-etl a cargas incrementales para que termine antes de las 05:00',
    oldGoal: 'Averiguar por qué la carga nocturna tarda más de seis horas',
    decisions: [
        ['La carga incremental usa la columna actualizado_en como marca de agua', 'es la única columna que rellenan todos los sistemas de origen'],
        ['Se reprocesan siempre las últimas 48 horas', 'el sistema de ventas corrige registros hasta un día después'],
        ['Los borrados se detectan con una comparación completa semanal, los domingos', 'el origen no deja rastro de las filas borradas'],
        ['Cada tabla se carga en una transacción propia', 'un fallo en clientes dejaba pedidos a medio cargar'],
        ['Los ficheros intermedios se guardan en Parquet, no en CSV', 'los CSV perdían los ceros a la izquierda de los códigos postales'],
        ['La carga se lanza a las 01:30', 'el sistema de ventas cierra el día a la 01:00'],
    ],
    needs: [
        ['El operador debe decidir si la tabla de devoluciones entra en la primera fase', true],
        ['tests/test_incremental.py falla: la marca de agua se guarda antes de confirmar la transacción', false],
        ['La carga de pedidos tarda 71 minutos y el objetivo es 25', false],
        ['¿Se mantiene la carga completa como respaldo durante el primer mes?', true],
    ],
    rules: [
        'No ejecutar nunca una carga contra producción sin pasar antes por el modo de prueba',
        'Cada tabla nueva necesita una prueba con datos de tests/datos',
        'Los nombres de columnas van en español y en minúsculas',
    ],
    now: ['Moviendo el guardado de la marca de agua después del commit en etl/cargas/incremental.py', 'Midiendo la carga de pedidos por lotes de 50.000 filas'],
    next: ['Añadir la comparación semanal de borrados en etl/cargas/borrados.py', 'Convertir la salida de etl/extraer/ventas.py a Parquet', 'Ejecutar la carga completa en el entorno de pruebas'],
    parts: [
        { name: 'la carga incremental', path: 'etl/cargas/incremental.py' },
        { name: 'el extractor de ventas', path: 'etl/extraer/ventas.py' },
        { name: 'el detector de borrados', path: 'etl/cargas/borrados.py' },
        { name: 'el planificador', path: 'etl/planificador.py' },
        { name: 'el validador de esquemas', path: 'etl/validar/esquema.py' },
        { name: 'el escritor de Parquet', path: 'etl/salida/parquet.py' },
    ],
    features: ['un reintento con espera', 'un registro estructurado', 'un límite de 60 segundos', 'un modo de prueba', 'una validación de nulos', 'un contador de filas', 'un índice por fecha', 'una comprobación de duplicados'],
    bugs: ['una fecha sin zona horaria', 'un commit que faltaba', 'una fila duplicada al reintentar', 'un error silenciado', 'un tipo de columna equivocado', 'un bucle que no terminaba'],
    commands: ['pytest tests', 'pytest tests/test_incremental.py', 'ruff check .', 'python -m etl.planificador --prueba'],
    branches: ['feat/carga-incremental', 'main'],
    mergeBase: 70,
};

const farol: Project = {
    name: 'farol-app',
    language: 'pt',
    label: 'farol-app modo offline',
    host: 'git.farol.test',
    goal: 'Fazer o farol-app guardar os relatórios de inspeção sem ligação e sincronizá-los quando a rede voltar',
    oldGoal: null,
    decisions: [
        ['Os relatórios ficam numa base SQLite local com uma fila de envio', 'os inspetores trabalham em caves sem rede durante horas'],
        ['Em caso de conflito ganha a versão do servidor e a local fica guardada como cópia', 'dois inspetores editaram o mesmo relatório e um perdeu o trabalho'],
        ['As fotografias são comprimidas para 1600 px antes do envio', 'o envio de originais de 12 MB falhava em redes móveis fracas'],
        ['A sincronização só corre com mais de 20 por cento de bateria', 'um inspetor ficou sem telefone a meio de um turno'],
        ['Cada relatório tem um identificador UUID criado no telefone', 'o identificador do servidor não existe enquanto não há rede'],
    ],
    needs: [
        ['O operador tem de decidir se as fotografias sincronizam em dados móveis ou só em Wi-Fi', true],
        ['O teste app/src/test/FilaDeEnvioTest.kt falha: a fila reenvia um relatório já confirmado', false],
        ['A cópia local do conflito não aparece no ecrã de histórico', false],
        ['O limite de 500 relatórios guardados no telefone é suficiente?', true],
    ],
    rules: ['Nunca apagar dados locais sem confirmação do servidor', 'Cada ecrã novo precisa de um teste de interface', 'Os textos da aplicação ficam em strings.xml, nunca no código'],
    now: ['A marcar o relatório como confirmado antes de o tirar da fila em app/src/main/sync/FilaDeEnvio.kt', 'A repetir o teste app/src/test/FilaDeEnvioTest.kt'],
    next: ['Mostrar a cópia de conflito em app/src/main/ui/HistoricoScreen.kt', 'Comprimir as fotografias em app/src/main/media/Compressor.kt', 'Testar a sincronização com a rede desligada durante 2 horas'],
    parts: [
        { name: 'a fila de envio', path: 'app/src/main/sync/FilaDeEnvio.kt' },
        { name: 'o ecrã de histórico', path: 'app/src/main/ui/HistoricoScreen.kt' },
        { name: 'o compressor', path: 'app/src/main/media/Compressor.kt' },
        { name: 'a base local', path: 'app/src/main/data/BaseLocal.kt' },
        { name: 'o gestor de conflitos', path: 'app/src/main/sync/Conflitos.kt' },
        { name: 'o ecrã do relatório', path: 'app/src/main/ui/RelatorioScreen.kt' },
    ],
    features: ['uma nova tentativa com espera', 'um registo estruturado', 'um limite de 30 segundos', 'uma validação de campos vazios', 'um indicador de progresso', 'um teste de interface', 'um índice por data', 'uma mensagem de erro clara'],
    bugs: ['uma data sem fuso horário', 'um envio duplicado', 'um erro ignorado', 'um ecrã que não atualizava', 'uma fuga de memória', 'um campo nulo'],
    commands: ['./gradlew test', './gradlew lint', './gradlew assembleDebug', './gradlew connectedCheck'],
    branches: ['feat/modo-offline', 'main'],
    mergeBase: 30,
};

export const PROJECTS: Readonly<Record<string, Project>> = { orchard, lantern, quarry, harbor, kestrel, marlin, colmena, farol };

export interface Phrases {
    readonly done: readonly string[];
    readonly now: readonly string[];
    readonly next: readonly string[];
    readonly needs: readonly string[];
    readonly branch: string;
    readonly commit: string;
    readonly go: readonly string[];
    readonly nextUp: string;
    readonly detail: readonly string[];
    readonly stand: string;
    readonly open: string;
    readonly waiting: string;
    readonly later: string;
}

export const PHRASES: Readonly<Record<Language, Phrases>> = {
    en: {
        done: ['Added {f} to {p}', 'Fixed {b} in {p}', '{c} passes after the change to {p}', 'Wrote a test for {n} covering {f}', 'Removed {b} from {n}', 'Merged !{m} into {br}', 'Reviewed {p} and found {b}', 'Moved {f} out of {p} into its own function'],
        now: ['Reading {p} to see how {n} handles {f}', 'Running {c} after editing {p}', 'Editing {p} to add {f}', 'Tracing {b} in {n}'],
        next: ['Add {f} to {n}', 'Run {c} before the next commit', 'Fix {b} in {p}', 'Write a test for {n}'],
        needs: ['Operator to confirm {f} for {n}', '{c} fails because of {b} in {p}', 'Is {f} wanted in {n}?'],
        branch: 'branch {br}',
        commit: 'commit {h}',
        go: ['Go on.', 'ok, continue.', 'Looks right, keep going.', 'Fine. Next step.', 'Yes, do that.', 'Good. Carry on with the plan.'],
        nextUp: 'Next: {x}.',
        detail: ['I checked the result by running {c} and reading the output line by line.', 'The change in {p} is small and stays inside {n}.', 'Nothing else in {p} needed to change.', 'I left {n} as it was apart from that.'],
        stand: 'Where things stand: {x}.',
        open: 'Still unfinished: {x}.',
        waiting: 'I am waiting for your answer on this: {x}',
        later: 'I will answer that later. Keep going with the rest.',
    },
    es: {
        done: ['Se añadió {f} en {p}', 'Se corrigió {b} en {p}', '{c} pasa tras el cambio en {p}', 'Se escribió una prueba para {n} que cubre {f}', 'Se eliminó {b} en {p}', 'Se fusionó !{m} en {br}', 'Se revisó {p}: había {b}'],
        now: ['Leyendo {p} para entender cómo funciona', 'Ejecutando {c} tras editar {p}', 'Editando {p} para añadir {f}', 'Buscando {b} en {p}'],
        next: ['Añadir {f} en {p}', 'Ejecutar {c} antes del próximo commit', 'Corregir {b} en {p}', 'Escribir una prueba para {n}'],
        needs: ['El operador debe confirmar {f} para {n}', '{c} falla por {b} en {p}', '¿Hace falta {f} en {p}?'],
        branch: 'rama {br}',
        commit: 'commit {h}',
        go: ['Sigue.', 'Vale, continúa.', 'Correcto, adelante.', 'Bien. Siguiente paso.', 'Sí, hazlo.'],
        nextUp: 'Siguiente: {x}.',
        detail: ['Lo comprobé ejecutando {c} y leyendo la salida línea a línea.', 'El cambio en {p} es pequeño.', 'No hizo falta cambiar nada más en {p}.'],
        stand: 'Estado actual: {x}.',
        open: 'Sigue pendiente: {x}.',
        waiting: 'Espero tu respuesta sobre esto: {x}',
        later: 'Te respondo luego. Sigue con lo demás.',
    },
    pt: {
        done: ['Adicionou-se {f} em {p}', 'Corrigiu-se {b} em {p}', '{c} passa depois da alteração em {p}', 'Escreveu-se um teste para {n} que cobre {f}', 'Removeu-se {b} em {p}', 'Integrou-se !{m} em {br}', 'Reviu-se {p}: havia {b}'],
        now: ['A ler {p} para perceber como funciona', 'A correr {c} depois de editar {p}', 'A editar {p} para adicionar {f}', 'À procura de {b} em {p}'],
        next: ['Adicionar {f} em {p}', 'Correr {c} antes do próximo commit', 'Corrigir {b} em {p}', 'Escrever um teste para {n}'],
        needs: ['O operador tem de confirmar {f} para {n}', '{c} falha por causa de {b} em {p}', 'É preciso {f} em {p}?'],
        branch: 'ramo {br}',
        commit: 'commit {h}',
        go: ['Continua.', 'Está bem, segue.', 'Certo, avança.', 'Bom. Próximo passo.', 'Sim, faz isso.'],
        nextUp: 'A seguir: {x}.',
        detail: ['Confirmei correndo {c} e lendo a saída linha a linha.', 'A alteração em {p} é pequena.', 'Não foi preciso mudar mais nada em {p}.'],
        stand: 'Ponto da situação: {x}.',
        open: 'Continua por resolver: {x}.',
        waiting: 'Aguardo a tua resposta sobre isto: {x}',
        later: 'Respondo mais tarde. Continua com o resto.',
    },
};
