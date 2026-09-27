/**
 * 족보 노드 안 긴 호칭(영어 Paternal uncle 등)이 카드 폭을 넘지 않게
 * 글자 크기만 줄인다. 노드 가로·세로는 레이아웃 값을 유지한다.
 */

const CJK_OR_KANA = /[\u1100-\uD7A3\u3000-\u9FFF\uF900-\uFAFF]/;

/** 한글·한자 1, 공백 0.3, 그 외(영문 등) 0.62 */
export function visualTextUnits(text: string): number {
  let units = 0;
  for (const ch of text) {
    if (ch === ' ') units += 0.3;
    else if (CJK_OR_KANA.test(ch)) units += 1;
    else units += 0.62;
  }
  return units;
}

export function fitNodeFontSize(
  text: string,
  baseSize: number,
  options?: { minSize?: number; maxUnits?: number },
): number {
  const minSize = options?.minSize ?? Math.max(8, baseSize * 0.62);
  const maxUnits = options?.maxUnits ?? 8;
  const units = visualTextUnits(text.trim());
  if (units <= maxUnits || baseSize <= minSize) return baseSize;
  return Math.max(minSize, (baseSize * maxUnits) / units);
}
