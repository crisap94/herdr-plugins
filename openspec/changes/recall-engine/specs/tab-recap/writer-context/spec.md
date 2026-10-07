## ADDED Requirements

### Requirement: Candidates and anchors travel in the documents

The enumeration SHALL receive one `enumerate_input` document, valid against `tab-recap/schema/enumerate-input.dtd`:
the chunk's turns and tool calls, the eight sections with one line of definition each, the mandatory candidates
found, and the questions of an ask-back. The writer's `recap_input` SHALL carry the candidates in a `candidates`
element, each with its section, text, why, reference, time and anchor, and every `fact` SHALL carry its anchor
when it has one. The correction SHALL be its own document, `correction_input`, valid against
`tab-recap/schema/correction-input.dtd`, holding only the refused operations, their reasons and anchors and the
facts they name.

#### Scenario: Validity

- **WHEN** a chunk holds `<`, `]]>` and terminal escapes
- **THEN** the enumerate document SHALL validate against its DTD and the readable text SHALL be kept

#### Scenario: A correction without the transcript

- **WHEN** two operations are refused
- **THEN** the correction document SHALL contain no `transcript` element
