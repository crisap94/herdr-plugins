## Why

Job harness ids and their behavior are repeated across the domain, configuration, setup and user-facing messages. That lets a new harness be added incompletely without a type error.

## What changes

Add one typed job harness registry and derive the backend ids, automatic order, model defaults, job choices, setup lists, legacy model keys and installation messages from it. Declare each harness's job contract and enumerator capability in the registry. The merge request carries `changelog::internal`.

## Out of scope

Transcript adapters, compaction eligibility, context windows, autocompact readers and Hermes history support.
