/**
 * Convert a color temperature in Kelvin (1000–40000) to a hex color string.
 * Uses the Tanner Helland approximation algorithm.
 */
export function kelvinToHex(kelvin: number): string {
  const t = Math.min(Math.max(kelvin, 1000), 40000) / 100;
  const clamp = (v: number) => Math.min(255, Math.max(0, v));
  const r = t <= 66 ? 255 : clamp(329.698727446 * Math.pow(t - 60, -0.1332047592));
  const g = t <= 66
    ? clamp(99.4708025861 * Math.log(t) - 161.1195681661)
    : clamp(288.1221695283 * Math.pow(t - 60, -0.0755148492));
  const b = t >= 66 ? 255 : t <= 19 ? 0 : clamp(138.5177312231 * Math.log(t - 10) - 305.0447927307);
  const h = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
