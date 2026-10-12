# Tasks

Paths are under `tab-recap/`. Every code merge request ticks its own boxes and names itself on the line. One merge request
carries all groups.

## 1. Wording

- [x] (!131) 1.1 The handoff's `deadline-ms` reads 200 000 in the archived exchange text and in the main lane-tokens spec.
- [x] (!131) 1.2 The requirement «A handoff request seen while sharing is off is remembered» is in the main spec.

## 2. The exchange

- [x] (!131) 2.1 Token writes of one source pane are serialised; a terminal stage is never overwritten by an earlier one.
- [x] (!131) 2.2 The ask, the request row and the attachment of its id are one transaction.
- [x] (!131) 2.3 The exchange-only refusals and the flow refusals are two named constants.

## 3. Slice 1

- [x] (!131) 3.1 The answers port takes the domain outcome; failure causes in logs are code-only; the restart sweep cannot abort on one bad row; the answer of a finished handoff is retried once.

## 4. Slice 2

- [x] (!131) 4.1 The found/closed distinction is a discriminated union; the closed-lane dependencies of Dispatch are required; the unreadable cause is carried by one helper; the three files over the size limit are split; the Freshness block formats the close instant like its other lines.

## 5. Archive

- [x] (!131) 5.1 Archive the change in this merge request.
