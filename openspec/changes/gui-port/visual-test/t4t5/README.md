# T4 and T5 visual test: Mark done and the compact message popup

Mod: `tab-recap/gui` at the working tree, installed into an isolated app home (`~/.cache/hcs/t4v-app`, core session `t4v`, state `~/.cache/hcs/t4v-state`, private Xvnc display, window 1500 x 1000, overlay 780 x 620). The daemon was a stub (`docs/research/studies/2026-11-08-desktop-transport-cli-vs-socket/scripts/t4-visual/`: `stub-api.mjs`, `make-fixtures.mjs`, `install.sh`, `up.sh`, `xi.py`, `contrast.py`). The stub writes `api.json` (mode 0600, version 1, port, 64 hex token, pid, startedAt), answers health with the same pid and startedAt, and serves index, tab documents (made by the real engine, GuiTab v2, 3 needs with fact ids, one with a long text), events (long poll), and the three new routes with outcomes switched from a control file (success, 404, 404need, 409, 409need, 429, 500, slow, down by killing the stub). A successful answer closes the fact in the served document and wakes the poll.

Input: no real pointer or key reached the window (the display has no xinput mouse), so clicks and keys went through a test-only copy of `main.js` with a 300 ms command-file hook that calls the mod's own handlers. Hover, focus and tooltip states were therefore not captured; they come from the existing `btn` (hover uses `t.hover`, disabled uses the 0.5 dim and a tooltip). The clipboard failure was forced by replacing `write_to_clipboard` with a function that throws in the test copy. The real clipboard call did not throw on this display (Copied shown).

Overlay shots are cropped to the overlay (and the popup next to it). Contrast was measured on the shot pixels (`contrast.py`, WCAG ratio of the most extreme text pixel against the most common background pixel).

| Scene | Shot | Verdict |
|---|---|---|
| Need card idle, dark | 01-idle-dark.png | pass after fix 1 |
| Need card idle, light | 01-idle-light.png | pass |
| Confirm row, dark | 02-confirm-dark.png | pass |
| Confirm row, light | 02-confirm-light.png | pass (sentence 5.05:1) |
| Pending | 03-pending-dark.png | pass after fix 2 (label 8.0:1, was 1.8:1) |
| Success toast | 04-success-toast.png | pass; toast bottom right, closed need leaves the card, banner count drops |
| Error line 404 unknown-tab, 404 unknown-need | 05-error-404.png, 05-error-404need.png | pass |
| Error line 409 not-open, 409 not-a-need | 05-error-409.png, 05-error-409need.png | pass (409 in light: 05-error-409-light.png, 4.6:1) |
| Error line 429, 500 | 05-error-429.png, 05-error-500.png | pass |
| Error line daemon unreachable (stub killed) | 05-error-down.png | pass; the existing "daemon is not running" banner appears above |
| Button disabled with the API down | 06-api-down-dark.png | pass (tooltip not capturable) |
| Popup loading | 10-popup-loading-dark.png | pass after fix 3 (6.1:1) |
| Popup with the guidance and caption | 11-popup-ready-dark.png, 11-popup-ready-light.png | pass after fix 3 (caption 4.8:1 dark, 5.1:1 light) |
| Popup with a note | 12-popup-note-dark.png, 12-popup-note-light.png | pass |
| Note near the limit (276 / 280) | 13-popup-longnote-dark.png | pass |
| Copied | 14-popup-copied-dark.png, 14-popup-copied-light.png | pass after fix 4 |
| Copy failed, selectable text | 15-popup-copyfail-dark.png, 15-popup-copyfail-light.png | pass with note: the fallback view uses the host markdown code block (grey fill in light, 14 px text) so it differs a little from the normal frame; the red line is 4.66:1 |
| Handoff enabled (two lanes) | 16-handoff-enabled-dark.png | pass |
| Handoff pending | 17-handoff-busy-dark.png | pass (spinner, label at full contrast) |
| Handoff copied | 18-handoff-copied-dark.png, 18-handoff-copied-light.png | pass |
| Handoff disabled (one lane) | 19-handoff-disabled-dark.png | pass |

Nothing overflowed the 780 x 620 window after the fixes. The popup grows by one line for the Copy failed line and stays inside the window.

## Defects found and fixed in `tab-recap/gui` (each with a test, 220 gui tests pass, `herdr-app check gui` passes)

1. First need card: Jump to lane, Mark done, the Reply field and Send no longer fit one row at the card width (363 px). The Reply field shrank to a sliver and Send overflowed the card edge by about 10 px. The reply field and Send now sit on their own row under the two buttons when Mark done is present (`views/need.js`). Cards without a fact id (version 1 documents) keep the old single row.
2. Pending label "Marking done" was drawn with the disabled 0.5 dim: 1.8:1 contrast on the accent fill. `ui/button.js` has a `busy` option (full contrast, no click, no hover, tooltip kept); Mark done pending and Copy handoff pending use it.
3. New popup text used the `dim` role (2.5:1 on the raised popup): "Loading the message", the "Engine guidance" caption, the "Compact message" heading and "Hand off to". They use `muted` now (4.8:1 or more).
4. Copy became Copied and widened by about 14 px, which moved Copy handoff under the pointer. Copy has a fixed minimum width (`SIZE.copyW`).

## Observations, not changed

- With the daemon killed, an open window kept the API mode for about 25 s (the pending long poll) and then went to files mode. During that time Mark done is enabled and a click shows "The daemon is not reachable". After the daemon returns, the store takes up to 60 s to switch back (backoff up to 30 s). This is the existing feed, not T4.
- The first frame after opening a brief is in files mode, so Mark done shows disabled for a moment before the first render after the API attach.
- The popup is about 400 px tall, not the 480 given as `popHeight`; the host sizes it to the content.
- The lane picker (three lanes or more) was not rendered: the fixtures have at most two lanes.
- Hover, focus ring and tooltip text were not captured (no pointer input).

Everything started for this test (stub, app, core session, Xvnc) was stopped. Names and paths in the shots are masked: the shots show only the isolated window with a space named `t4`, a fixture tab and `/tmp`.

## Second pass: three-lane picker, new error lines (HC_SESSION t4w)

Same method, fresh names: core session `t4w`, state `~/.cache/hcs/t4w-state`, app home copy `~/.cache/hcs/t4w-app`, private Xvnc `:75` (1500 x 1000). The scripts in `scripts/t4-visual/` take `T=t4w` (`install.sh`, `up.sh`); `make-fixtures.mjs` gives the first tab a third lane (review lane, working) when `LANES3=1` (default unchanged: two lanes) and the stub has the new outcomes (`404pane`, `toolong`, `over`, handoff `409` with a detail). Window shots are 1280 x 820 (logical px). Shots 20 to 28 anchored the popup with made-up bounds (y 200), which is about 60 px higher than a real click, so they judge the popup content only; shots 30 and 31 use the real chip bounds read from shot 20 (lane 0: 272,217,363x72; lane 2, the wrapped second row: 272,299,419x72) and judge the placement.

| Scene | Shot | Verdict |
|---|---|---|
| Brief with 3 lanes | 20-brief-3lanes-dark.png | pass (two chips on the first row, third wraps, all inside the overlay) |
| Popup, 3 lanes, picker | 21-popup-3lanes-dark.png, 21-popup-3lanes-light.png | pass: "Hand off to" with the two other lanes as pills, first selected with the accent border; Copy and Copy handoff on their own row, nothing clipped or overflowing |
| Other lane picked | 22-popup-3lanes-picked-dark.png | pass |
| Handoff copied | 23-popup-3lanes-copied-dark.png | pass |
| Real anchor, lane 0, tallest state (refusal detail showing) | 30-popup-lane0-real-anchor-dark.png | pass with note: the popup opens under the chip and ends at y 772, 52 px below the 780 x 620 frame (bottom 720) but inside the 820 px window; it is its own overlay, so the frame does not clip it |
| Real anchor, lane 2 (wrapped row), tallest state | 31-popup-lane2-real-anchor-dark.png | pass with note: asked for y 379, the host moved it up to 337 so it ends at 811 inside the 820 px window; it then covers the lane 2 chip body (the chip title stays visible) and the frame footer, which is the host clamp, not the mod |
| Handoff refused (409 detail) | 24-handoff-refused-dark.png, 24-handoff-refused-light.png | pass after fix 1 |
| Handoff to a gone lane (404 unknown-pane) | 25-handoff-lane-gone-dark.png | pass: "That lane is gone" in the error colour, Copy handoff stays enabled |
| Message over 3000 characters | 26-compact-over-limit-dark.png | pass: shown as it is, no error line, Copy enabled; the frame scrolls |
| Note too long (400 note-too-long) | 27-note-too-long-dark.png | pass: "The note is too long" in the frame, Copy disabled |
| Compact on a gone lane (404 unknown-pane) | 28-compact-lane-gone-dark.png | pass |

Defects found and fixed in `tab-recap/gui` (each with a test):

1. A 131-character refusal detail wrapped to three lines and pushed the last line against the bottom edge of the 480 px popup (no bottom padding). The detail is clipped to 90 code points plus an ellipsis, which is two lines at the popup width and leaves the padding (`DETAIL_MAX`).
2. The note placeholder ("Optional note: what the agent should keep in mind after compaction") was cut mid-word at the field edge ("keep in mir"). Text shortened to "Optional note for after compaction" (text change only, the look is untouched).

Observations, not changed: the popup can end below the 780 x 620 frame and, near the window bottom, covers the chip it belongs to (host clamping); the real refusal `detail` from the daemon is a kebab-case code (for example `ledger-empty`, `content-empty`, `source-equals-target`), not a sentence, so the red line will read as that code, the stub sentence is only a stand-in for the long case; the placeholder text is also in the locked mockup (`ux-mockup/js/roles/popover.js`), so fix 2 is a deviation the owner can veto; the message frame shows four lines and scrolls (no scrollbar is visible without the pointer); a handoff error stays on screen while the note changes; hover and tooltip states were not captured (no pointer input). Everything started for this pass (stub, app, core, Xvnc) was stopped.
