# Notebook

A bullet journal and an interstitial journal in one handwritten notebook. Works offline, syncs between
devices through Firebase, and publishes itself to GitHub Pages on every push to `main`.

## Writing
Type on the line at the bottom of a page and press Enter. It's written onto the page in handwriting,
with the time in the margin.

| Start the line with | You get |
|---|---|
| nothing | a note: a timestamped log line (interstitial journal). Settings can make plain lines tasks instead |
| `.`  `t`  `[]` | a task `•`. Tap the dot to tick it off `×` |
| `x` | a task that's already done |
| `o` | an event `○` (add `@3pm` or `@14:30` for a time) |
| `-` | a note `–` |
| `!` | an idea `!` |
| `*` first | priority, e.g. `* . pay VAT` |
| `#word` anywhere | a tag (searchable) |
| `12 …` on a month page | pins it to the 12th |

## Pages
- **Daily pages**: one per day, with the rapid log.
- **Monthly log**: a calendar down the left (events, plus tasks done per day) and the month's task list.
- **Future log**: the next 12 months. Scheduling a task with `<` puts it here.
- **Migration**: every open task left on an earlier page. Carry it forward `>`, schedule it `<`, tick it, or strike it out.
- **Collections**: pages that aren't tied to a date (a business, a project, a list).
- **Index** and **Search**: everything, plus tags.

## Focus (interstitial journaling)
Press **What are you working on?** at the top and pick one thing. When you switch or stop, the app asks how it
went and what's next. A line like `◷ 09:15–09:57 · 42m  Proposal — draft done, needs pricing` is written into
today's page, and the minutes add up against the task (even after it's migrated).

## Excel
Settings → **Back up everything to Excel** saves one workbook (Entries, Collections, Focus). **Restore from Excel
backup** rebuilds the notebook from it on any device or a fresh copy of the app. **Import tasks from a
spreadsheet** reads any sheet with a Task/Text/Title/Item column (plus an optional Date and Done column).

## Setup
`src/config.js` holds the Firebase web config. Leave `apiKey` empty and the app keeps everything in the browser
only. Firestore rules are in `firestore.rules`. Data is stored under `users/{uid}/records`.

```
npm install
npm run dev     # local
npm test
npm run build
```
