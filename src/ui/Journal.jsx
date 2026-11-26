// The journal: an interstitial diary. Each day has its own page; write whenever something's going on and the
// time you wrote it is kept. Entries (and the day's canvas) can hold drawings, flows, photos and videos.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Ink, markFresh } from './Ink.jsx';
import { CreativeSpace } from './Creative.jsx';
import { Sheet, fmtMins, shortDay, toast } from './common.jsx';
import { dayPage, entryPage } from '../lib/journal.js';
import { addDays, todayStr, nowLondon } from '../lib/util.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const wd = (d) => WD[new Date(d + 'T12:00:00Z').getUTCDay()];
const timeOf = (e) => (e.kind === 'session' ? e.time : (e.at || '').slice(11, 16));

export function JournalHome({ journal }) {
  const [q, setQ] = useState('');
  const today = todayStr();
  let days = journal.journalDays();
  if (q.trim()) {
    const s = q.trim().toLowerCase();
    days = days.filter((d) => d.entries.some((e) => e.text.toLowerCase().includes(s)));
  }
  const hasToday = days.some((d) => d.date === today);
  return (
    <section class="page journal-home">
      <header class="page-head">
        <div class="ph-text"><h1 class="page-title">Journal</h1><div class="ph-sub">{days.length} day{days.length === 1 ? '' : 's'} written</div></div>
        <div class="ph-nav"><a class="btn primary" href={`#/journal/${today}`}>✎ Write today</a></div>
      </header>
      <input class="search" type="search" placeholder="Search your journal…" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
      {!hasToday && !q && (
        <a class="jday card empty-today" href={`#/journal/${today}`}>
          <div class="jd-date"><b>{+today.slice(8)}</b><span>{MON[+today.slice(5, 7) - 1]}</span></div>
          <div class="jd-main"><div class="jd-wd">{wd(today)} · today</div><div class="jd-prev muted">Nothing yet. What's going on right now?</div></div>
        </a>
      )}
      {days.map((d) => {
        const first = d.entries[0], last = d.entries[d.entries.length - 1];
        return (
          <a class="jday card" href={`#/journal/${d.date}`}>
            <div class="jd-date"><b>{+d.date.slice(8)}</b><span>{MON[+d.date.slice(5, 7) - 1]}</span>{d.date.slice(0, 4) !== today.slice(0, 4) && <span>{d.date.slice(0, 4)}</span>}</div>
            <div class="jd-main">
              <div class="jd-wd">{wd(d.date)}{d.date === today ? ' · today' : ''}<span class="muted"> · {d.entries.length} entr{d.entries.length === 1 ? 'y' : 'ies'}{first ? ` · ${timeOf(first)}${last !== first ? `–${timeOf(last)}` : ''}` : ''}{d.cards ? ` · ${d.cards} attachment${d.cards === 1 ? '' : 's'}` : ''}</span></div>
              {first && <div class="jd-prev">{first.text}</div>}
            </div>
            {d.photos.length > 0 && <div class="jd-photos">{d.photos.slice(0, 3).map((p) => <img src={p} alt="" loading="lazy" />)}</div>}
          </a>
        );
      })}
    </section>
  );
}

export function JournalDay({ journal, date }) {
  const today = todayStr();
  const list = journal.journalEntries(date);
  const [open, setOpen] = useState(null);
  const [text, setText] = useState('');
  const ta = useRef();
  useEffect(() => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.max(90, el.scrollHeight)}px`; } }, [text]);
  const write = () => {
    if (!text.trim()) return;
    const e = journal.journalWrite(date, text.trim());
    markFresh(e?.id);
    setText('');
    toast(`Written at ${(e?.at || '').slice(11, 16)}`);
  };
  const [y, m, d] = date.split('-').map(Number);
  return (
    <section class="page journal-day">
      <header class="page-head">
        <div class="ph-text">
          <h1 class="page-title">{wd(date)}, {d} {MON[m - 1]} {y !== +today.slice(0, 4) ? y : ''}</h1>
          <div class="ph-sub">{date === today ? `Today · it's ${nowLondon().time}` : shortDay(date)} · {list.length} entr{list.length === 1 ? 'y' : 'ies'}</div>
        </div>
        <div class="ph-nav">
          <a class="icon-btn" href={`#/journal/${addDays(date, -1)}`} aria-label="Previous day">‹</a>
          {date !== today && <a class="btn" href={`#/journal/${today}`}>Today</a>}
          <a class="icon-btn" href={`#/journal/${addDays(date, 1)}`} aria-label="Next day">›</a>
          <a class="btn" href="#/journal">All days</a>
        </div>
      </header>

      <div class="composer card">
        <div class="comp-time">{date === today ? nowLondon().time : 'Add to this day'}</div>
        <textarea ref={ta} value={text} placeholder="What's going on? Write what you're doing, thinking or feeling…" onInput={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); write(); } }} aria-label="Journal entry" />
        <div class="row spread">
          <span class="muted small">Start with ! for an idea · Ctrl/⌘+Enter to save</span>
          <button class="btn primary" disabled={!text.trim()} onClick={write}>Write it down</button>
        </div>
      </div>

      <div class="jstream">
        {list.length === 0 && <p class="muted center">Nothing written yet. Whenever something happens, jot it here and the time is kept.</p>}
        {[...list].reverse().map((e) => {
          const att = journal.cards(entryPage(e.id));
          return (
            <article class={`jentry card k-${e.kind}`} onClick={() => setOpen(e)}>
              <div class="je-time">{timeOf(e)}</div>
              <div class="je-body">
                {e.kind === 'idea' && <div class="je-tag">Idea</div>}
                {e.kind === 'session' && <div class="je-tag">Focus · {e.time}–{e.endTime} · {fmtMins(e.minutes)}</div>}
                <div class="je-text"><Ink text={e.text} id={e.id} /></div>
                {att.length > 0 && (
                  <div class="je-att">
                    {att.map((c) => c.type === 'image'
                      ? <img src={c.data} alt={c.caption || ''} loading="lazy" />
                      : <span class="je-chip">{{ sketch: '✎ Drawing', mindmap: '✳ Flow', video: '▶ Video', sticky: '▭ Note' }[c.type] || c.type}{c.caption ? ` · ${c.caption}` : ''}</span>)}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <div class="canvas-sec">
        <h2 class="sec-title">Canvas for the day</h2>
        <p class="muted small">Draw, map out flows, add photos and videos for the whole day. Open an entry to attach things to it instead.</p>
        <CreativeSpace journal={journal} page={dayPage(date)} />
      </div>

      {open && <EntryEditor journal={journal} e={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function EntryEditor({ journal, e: initial, onClose }) {
  const e = journal.s.get('entries', initial.id) || initial;
  const [text, setText] = useState(e.text);
  const save = () => { if (text.trim() && text.trim() !== e.text) journal.update(e.id, { text: text.trim() }); };
  return (
    <Sheet title={`Written ${shortDay((e.at || '').slice(0, 10))} at ${timeOf(e)}`} onClose={() => { save(); onClose(); }} wide>
      <textarea class="entry-edit" value={text} rows={Math.min(16, Math.max(4, text.split('\n').length + 2))} onInput={(x) => setText(x.currentTarget.value)} aria-label="Entry" />
      <div class="field-l">Attach to this entry</div>
      <CreativeSpace journal={journal} page={entryPage(e.id)} />
      <div class="row spread sheet-foot">
        <button class="btn danger" onClick={() => { if (confirm('Delete this entry and its attachments?')) { for (const c of journal.cards(entryPage(e.id))) journal.removeCard(c.id); journal.remove(e.id); onClose(); } }}>Delete</button>
        <button class="btn primary" onClick={() => { save(); onClose(); }}>Done</button>
      </div>
    </Sheet>
  );
}
