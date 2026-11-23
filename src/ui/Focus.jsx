// Interstitial journaling: one thing at a time, and a short note every time you switch.
import { useState } from 'preact/hooks';
import { Sheet, fmtMins, useTick, toast } from './common.jsx';
import { markFresh } from './Ink.jsx';
import { dayPage } from '../lib/journal.js';
import { nowLondon, todayStr } from '../lib/util.js';

const PROMPTS = [
  'What did you just finish? How did it go? Anything get in the way?',
  'Where did you leave it, so future-you can pick it straight back up?',
  'How are you feeling: energy, focus, mood?',
];

export function FocusBar({ journal, onSwitch, onStart }) {
  useTick(20000);
  const f = journal.focus();
  if (!f) {
    return (
      <button class="focusbar idle" onClick={onStart}>
        <span class="dot" /> Not tracking. <b>What are you working on?</b>
      </button>
    );
  }
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(f.startedAt)) / 60000));
  return (
    <div class="focusbar on">
      <span class="dot live" />
      <span class="now">Now: <span class="hand">{f.text}</span></span>
      <span class="mins">since {f.startTime} · {fmtMins(mins)}</span>
      <button class="btn small" onClick={onSwitch}>Switch / stop</button>
    </div>
  );
}

function NextPicker({ journal, next, setNext, exclude }) {
  const open = journal.entries(dayPage(todayStr())).filter((e) => e.kind === 'task' && e.status === 'open' && e.id !== exclude);
  return (
    <>
      <div class="group-label">What's next?</div>
      <div class="next-list">
        {open.slice(0, 12).map((t) => (
          <button class={`chip ${next?.taskId === t.id ? 'on' : ''}`} onClick={() => setNext(next?.taskId === t.id ? null : { taskId: t.id })}>
            {t.priority ? '* ' : ''}• {t.text.length > 48 ? `${t.text.slice(0, 46)}…` : t.text}
          </button>
        ))}
      </div>
      <input
        class="hand-input"
        placeholder={open.length ? '…or type something else' : 'Type what you’ll do next'}
        value={next?.text || ''}
        onInput={(ev) => setNext(ev.currentTarget.value ? { text: ev.currentTarget.value } : null)}
      />
    </>
  );
}

export function SwitchSheet({ journal, onClose }) {
  const f = journal.focus();
  const [note, setNote] = useState('');
  const [markDone, setMarkDone] = useState(false);
  const [next, setNext] = useState(null);
  const [prompt] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);
  if (!f) { onClose(); return null; }
  const mins = Math.max(1, Math.round((Date.now() - Date.parse(f.startedAt)) / 60000));
  const task = f.taskId ? journal.s.get('entries', f.taskId) : null;
  const finish = (withNext) => {
    const e = journal.stopFocus({ note, markDone, next: withNext ? next : null });
    markFresh(e?.id);
    toast(withNext && next ? 'Logged. On to the next thing.' : `Logged ${fmtMins(mins)}.`);
    onClose();
  };
  return (
    <Sheet title={`It's ${nowLondon().time}. You've been on this for ${fmtMins(mins)}`} onClose={onClose}>
      <p class="hand big-line">{f.text}</p>
      <textarea class="hand-edit" rows={3} autoFocus placeholder={prompt} value={note} onInput={(ev) => setNote(ev.currentTarget.value)} aria-label="How did it go?" />
      {task && task.status === 'open' && (
        <label class="check"><input type="checkbox" checked={markDone} onChange={(ev) => setMarkDone(ev.currentTarget.checked)} /> Tick “{task.text}” off as done</label>
      )}
      <NextPicker journal={journal} next={next} setNext={setNext} exclude={f.taskId} />
      <div class="row spread sheet-foot">
        <button class="btn ghost" onClick={() => finish(false)}>Log it, take a break</button>
        <button class="btn primary" disabled={!next} onClick={() => finish(true)}>Log it &amp; start next</button>
      </div>
    </Sheet>
  );
}

export function StartSheet({ journal, onClose }) {
  const [next, setNext] = useState(null);
  const go = () => {
    if (!next) return;
    let n = next;
    // something typed that isn't on the page yet becomes a task on today's page, so the session links to it
    if (n.text) { const t = journal.write(dayPage(todayStr()), n.text, { defaultKind: 'task' }); markFresh(t?.id); n = { taskId: t.id }; }
    journal.startFocus(n);
    onClose();
  };
  return (
    <Sheet title="What are you working on?" onClose={onClose}>
      <p class="muted small">Pick one thing. When you switch or stop, you'll jot a line about how it went, and it's written into today's page with the time it took.</p>
      <NextPicker journal={journal} next={next} setNext={setNext} />
      <div class="row spread sheet-foot">
        <span />
        <button class="btn primary" disabled={!next} onClick={go}>▶ Start</button>
      </div>
    </Sheet>
  );
}
