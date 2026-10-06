# Proposal

## Why

The recap names merge requests, commits, branches, files and pages, but nothing can be opened from
it: the Links section shows bare names. herdr opens OSC 8 hyperlinks and `http(s)` URLs on Ctrl-click
in any pane (also when a link wraps), so the column and the modal can make every reference clickable.

## What Changes

- References anywhere in a recap (every section, column and modal) become OSC 8 hyperlinks that keep
  their short visible name: full URLs; `!N` (GitLab merge request) and `#N` (GitHub pull request or
  issue); commit SHAs; branch names; repository file paths (to the file's web page on the current
  branch).
- The daemon learns each lane's web base from its repository remote (`origin`; `ssh` → `https`, `.git`
  dropped; github.com uses GitHub paths, any other host GitLab `/-/` paths) and publishes it with the
  tab view (database migration 002: the first real one).
- Cell width and wrapping skip OSC 8 sequences; a link split across lines is reopened on each line.
- The writer is told to write links as resolvable names or as full URLs copied from the transcript.

Out of scope: opening files inside herdr (link handlers), references to another repository without a
full URL, the bar (one headline line).

Merge request label: `changelog::added`.

## Capabilities

### New Capabilities

- `tab-recap/recap-links`: which references in a recap become hyperlinks, to where, and how they are
  drawn.

### Modified Capabilities

_None._

## Impact

`src/ports/lane-repo.ts` + `src/adapters/git-lane-repo.ts` (remote → web base), `src/ports/tab-views.ts`
(`TabLane.web`), database migration `schema/002-lane-web.ts`, `src/recap/render/{wrap,present}.ts` +
a new pure `src/recap/render/links.ts`, `src/adapters/recap-instructions.ts`, tests, CONTEXT.md.
