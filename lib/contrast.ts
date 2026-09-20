/**
 * WCAG relative luminance and contrast, so the palette can be tested rather than eyeballed.
 *
 * Written because two status colours and the focus ring were failing 1.4.11 against the
 * backgrounds they actually appear on. The comment in lib/status.ts claimed "3:1 on white",
 * which was true and measured the wrong backdrop: map pins do not sit on white, they sit on
 * water.
 */
export function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [relativeLuminance(a), relativeLuminance(b)];
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
