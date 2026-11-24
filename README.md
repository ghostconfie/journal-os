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

| `@9-10:30` `@2-3pm` | start and finish time |
| `by:fri` `by:27/11` `by:tomorrow` | a deadline |
| `+physical` `+spiritual` `+mental` `+fin` `+rel` `+todo` | a pillar |

Every line shows when it was written (in the margin) and, if planned, when it starts, when it should be done by,
and its deadline.

## Pillars (task manager)
Six lists: Physical, Spiritual, Mental, Financial, Relational and Tasks to do. Anything can go in them (tasks,
events, notes, ideas, priorities). Press **plan →** on a line to put it on a day: pick the day, a time block
(early morning, morning, afternoon, evening, night), a start and finish time, and whether it's a priority for the
day. It keeps its pillar label, and ticking it off on the day ticks it off in the pillar too.

## Days
Each day has four tabs:
- **Schedule**: all 24 hours, half an hour per dot-grid line. Anything with a start time is drawn as a sketched box
  from its start to its finish, coloured in with the pencil colour you choose (or its pillar's colour). Tap an empty
  time to block it out. Priorities, deadlines and anything without a time sit beside it (above it on a phone).
- **Tasks**: the bullet-journal rapid log of tasks and events.
- **Journal**: notes, ideas and focus sessions, written across the page with the time in the margin.
- **Creative space**: drawings, photos, videos, mind maps and sticky notes.
Photos are shrunk to sync. Uploaded videos stay on the device they were added from; video links play everywhere.

## Calendar
Every year (each day shaded by how much was written, with marks for creative pages and deadlines) and every month
(a wall calendar showing what was written on each day). Tap any day to open it.

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
