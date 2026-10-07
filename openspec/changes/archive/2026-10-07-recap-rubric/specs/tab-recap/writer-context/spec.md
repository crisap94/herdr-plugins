## MODIFIED Requirements

### Requirement: Contradicted facts do not survive

The instructions SHALL tell the writer to keep an item from the previous recap only while the new
transcript does not contradict it, and to write links as names, not descriptions. The instructions SHALL
quote the rubric's item checks and section checks from `tab-recap/schema/recap-rubric.md`, and SHALL tell
the writer that refused items come back in `<correction>` with the gate's reason, to be rewritten or left out.

#### Scenario: A wrong link label

- **WHEN** the previous recap describes a merge request wrongly and the transcript shows what it is
- **THEN** the instructions given to the writer SHALL require dropping or correcting that item

#### Scenario: A refused item

- **WHEN** the gates refuse two items of an answer
- **THEN** the retry's `<correction>` SHALL list both with the gate's reason and the instructions SHALL say how to answer it
