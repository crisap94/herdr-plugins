# Proposal: Relocate harness-specific behavior

## Why

Job environment names, screen chrome rules, session identity handling, observed context readers, and tool-name mappings are split across layers. Moving them beside their owning adapters makes harness behavior easier to trace while keeping outputs stable.

## What Changes

The registry and adapters own the moved behavior. Golden tests pin existing environment, screen, session, and transcript outputs. A tool name outside an adapter's own vocabulary intentionally classifies as `other`, including names native to another harness. The merge request will carry `changelog::internal`.

## Out of Scope

Changing any environment boundary, screen filtering rule, session value, or transcript interpretation.
