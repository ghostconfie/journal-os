// The planning flow, shown at the top of each step: matrix → pick days → sort by pillar → give it a time.
import { todayStr } from '../lib/util.js';

export function Steps({ at, date }) {
  const d = date || todayStr();
  const steps = [
    [1, 'Matrix', 'rank what matters', '#/matrix'],
    [2, 'Pick days', 'drag tasks onto days', `#/plan/week/${d}`],
    [3, 'Sort by pillar', "the day's task manager", `#/plan/day/${d}`],
    [4, 'Give it a time', 'drag or auto-schedule', `#/plan/day/${d}`],
  ];
  return (
    <nav class="steps" aria-label="Planning steps">
      {steps.map(([n, t, s, h]) => (
        <a class={`step ${n === at || (at === 3 && n === 4) ? 'on' : ''} ${n < at ? 'past' : ''}`} href={h}>
          <span class="step-n">{n < at ? '✓' : n}</span>
          <span class="step-t"><b>{t}</b><small>{s}</small></span>
        </a>
      ))}
    </nav>
  );
}
