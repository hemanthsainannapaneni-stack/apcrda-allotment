/**
 * Chart colour tokens.
 *
 * Every value here has been run through the palette validator rather than
 * picked by eye. Four jobs, four token sets — a colour never does two of them:
 *
 *   SERIES     identity  — which series is this? Fixed order, assigned in
 *                          sequence, never cycled. Slots 1-8 only; a ninth
 *                          series folds into "Other" or becomes its own chart.
 *   ORDINAL    position  — funnel steps, phases, tiers. One hue, light → dark,
 *                          so the reader sees the order in the colour itself.
 *   SEQUENTIAL magnitude — how much. One hue, light → dark.
 *   STATUS     state     — good / warning / serious / critical. Reserved: a
 *                          status colour never stands in for "series 4", and it
 *                          always ships with a label beside it.
 *
 * Measured on the white card surface these charts actually render on:
 *   SERIES   — worst adjacent pair ΔE 9.1 under protanopia (target ≥ 8),
 *              19.6 under normal vision (floor ≥ 15). Aqua, yellow and magenta
 *              sit below 3:1 against white, so every chart using them also
 *              ships the value as a direct label or in the table below.
 *   ORDINAL  — monotone lightness, light end 3.08:1 against white.
 */

/** Categorical identity. Assign in order; do not reorder, do not cycle. */
export const SERIES = [
  '#2a78d6', // 1 blue
  '#eb6834', // 2 orange
  '#1baf7a', // 3 aqua
  '#eda100', // 4 yellow
  '#e87ba4', // 5 magenta
  '#008300', // 6 green
  '#4a3aa7', // 7 violet
  '#e34948', // 8 red
] as const;

/** Ordered categories — the brand navy, stepped so the sequence reads as a ramp. */
export const ORDINAL = ['#6497ca', '#4079b2', '#2f5f95', '#254265', '#0f2d52'] as const;

/** Magnitude on a continuous scale. Same hue as ORDINAL, wider range. */
export const SEQUENTIAL = ['#c5d8ee', '#98bade', '#6497ca', '#4079b2', '#2f5f95', '#0f2d52'] as const;

/** Reserved meanings. Always shown with a label — never colour alone. */
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
} as const;

/** Chart chrome: recessive by design, so the data is the only loud thing. */
export const CHROME = {
  surface: '#ffffff',
  grid: '#e7ebf1',
  axis: '#c2cad7',
  muted: '#8f9bad',
  ink: '#414a58',
} as const;

/** Axis/tick defaults shared by every chart, so they stay visually identical. */
export const AXIS = { fontSize: 10, fill: CHROME.muted } as const;
export const AXIS_LINE = { stroke: CHROME.axis } as const;

/** Bars are capped rather than filling their band — the leftover is the air. */
export const BAR_SIZE = 22;

/** A 2px surface-coloured separator between touching fills in a stack. */
export const STACK_GAP = { stroke: CHROME.surface, strokeWidth: 2 } as const;

/** Series colour for slot n (0-based). Past slot 8 the caller must fold to "Other". */
export const seriesAt = (index: number) => SERIES[Math.min(index, SERIES.length - 1)];

/** Ordinal step for position i of n, so short ramps still span the full range. */
export function ordinalAt(index: number, total: number) {
  if (total <= 1) return ORDINAL[ORDINAL.length - 1];
  const step = Math.round((index / (total - 1)) * (ORDINAL.length - 1));
  return ORDINAL[step];
}

/** Sequential step for a value inside [0, max]. */
export function sequentialFor(value: number, max: number) {
  if (max <= 0) return SEQUENTIAL[0];
  const step = Math.min(SEQUENTIAL.length - 1, Math.floor((value / max) * SEQUENTIAL.length));
  return SEQUENTIAL[step];
}
