# @stateforge-labs/recap-view — vocabulary

The package's own terms. Everything else is in [tab-recap/CONTEXT.md](../../tab-recap/CONTEXT.md).

| Term | Meaning |
| --- | --- |
| `Frame` | The ordered lines a view draws, before it is cut to the screen. |
| `Line` | One line of a frame: a string the screen shows as one row. |
| `Screen` | The lines shown for one frame, and the cursor that says where they start. |
| `Cursor` | How far down the frame the view starts; never `offset`. |
| `Height` | The number of terminal rows the screen has, footer included. |
| `Row` | One session row of a recap column. |
| `Wording` | The translated text the view draws its labels with. |
| `Web` | The browser-facing recap view. |
| `Note` | A short line the recap attaches to a row or a task. |
| `RecapColumn` | The recap column as a whole: its rows, its tasks and its wording. |
| `ColumnTask` | One task inside a recap column. |
| `SessionRecap` | The recap of one session, read from the session ledger. |
