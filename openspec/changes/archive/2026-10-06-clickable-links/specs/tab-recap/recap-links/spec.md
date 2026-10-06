## Purpose

Which references in a recap become hyperlinks, to where, and how they are drawn.

## ADDED Requirements

### Requirement: References are clickable

In the column and the modal, every reference the plugin can resolve SHALL be drawn as an OSC 8
hyperlink whose visible text is the reference as written: full `http(s)` URLs, merge request and pull
request numbers, commit SHAs, branch names and repository file paths, in any section of the recap.

#### Scenario: A merge request in Done

- **WHEN** a Done bullet says `!252 merged` and the tab's agent works in a GitLab repository
- **THEN** `!252` SHALL be a hyperlink to that repository's merge request 252 and SHALL still read `!252`

#### Scenario: A file in Links

- **WHEN** Links holds `` `src/cart.ts` `` and the agent's branch is `feat/cart`
- **THEN** it SHALL link to the file's web page on `feat/cart`

### Requirement: Links follow the repository's forge

The web address SHALL come from the repository's `origin` remote: `ssh` remotes are turned into `https`,
`.git` is dropped, credentials in the remote are never stored or shown, github.com uses GitHub paths and
any other host uses GitLab paths. Without a known remote only full URLs are linked.

#### Scenario: SSH remote

- **WHEN** the remote is `git@github.com:acme/shop.git` and the recap says `#12`
- **THEN** `#12` SHALL link to `https://github.com/acme/shop/pull/12`

#### Scenario: Token in the remote

- **WHEN** the remote is `https://user:secret@gitlab.example/acme/shop.git`
- **THEN** no stored value and no drawn link SHALL contain `secret`

### Requirement: No guessing across repositories

When the agents of the task being drawn work in different repositories, only full URLs SHALL be
linked.

#### Scenario: Two repositories

- **WHEN** one task's agents work in two repositories and a bullet says `!7`
- **THEN** `!7` SHALL be drawn as plain text

### Requirement: Links do not change the layout

Hyperlink sequences SHALL take no cells; a wrapped link SHALL stay a link on every line it spans; text
drawn with `NO_COLOR` SHALL keep its links.

#### Scenario: A long link in a narrow column

- **WHEN** a linked reference wraps onto a second line
- **THEN** both parts SHALL be hyperlinks to the same address and no line SHALL be wider than the column
