import { PENCILS } from '../lib/journal.js';

/** Colour picker for events, tasks and time blocks. */
export function ColorDots({ value, onChange }) {
  return (
    <div class="color-dots" role="radiogroup" aria-label="Colour">
      {Object.entries(PENCILS).map(([k, p]) => (
        <button role="radio" aria-checked={value === k} class={`cdot ${value === k ? 'on' : ''}`} style={`--c:${p.hex}`} title={p.label} aria-label={p.label} onClick={() => onChange(k)} />
      ))}
    </div>
  );
}
export const PencilPicker = ColorDots;
