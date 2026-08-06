import { useCallback, useMemo } from 'react';
import { PixelRatio, useWindowDimensions } from 'react-native';
import type { StandardLayoutOptions } from '../utils/standardLayout';
import { STANDARD_LAYOUT_DEFAULTS } from '../utils/standardLayout';

/** iPhone 14 기준 설계 폭 */
export const DESIGN_WIDTH = 390;

const MIN_SCALE = 0.82;
const MAX_SCALE = 1.12;
const MIN_FONT_SCALE = 1;
const MAX_FONT_SCALE = 1.45;

export function clampScale(raw: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw));
}

export function clampFontScale(raw: number): number {
  return Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, raw));
}

export function scaleSize(size: number, scale: number): number {
  return PixelRatio.roundToNearestPixel(size * scale);
}

export function buildScaledLayoutOptions(
  uiScale: number,
  _fontScale = 1,
  overrides: Partial<StandardLayoutOptions> = {},
): Omit<StandardLayoutOptions, 'view'> {
  const rs = (n: number) => scaleSize(n, uiScale);
  const base = STANDARD_LAYOUT_DEFAULTS;
  return {
    cardWidth: rs(base.cardWidth),
    cardHeight: rs(base.cardHeight),
    spouseGap: rs(base.spouseGap),
    coupleGap: rs(base.coupleGap),
    rowGap: rs(base.rowGap),
    childGap: rs(base.childGap),
    padding: rs(base.padding),
    ...overrides,
  };
}

export function useResponsive() {
  const { width, height, fontScale: windowFontScale } = useWindowDimensions();
  const uiScale = useMemo(() => clampScale(width / DESIGN_WIDTH), [width]);
  const fontScale = useMemo(
    () => clampFontScale(windowFontScale ?? PixelRatio.getFontScale()),
    [windowFontScale],
  );
  const rs = useCallback((size: number) => scaleSize(size, uiScale), [uiScale]);
  const layoutBase = useMemo(
    () => buildScaledLayoutOptions(uiScale, fontScale),
    [uiScale, fontScale],
  );

  return { width, height, scale: uiScale, uiScale, fontScale, rs, layoutBase };
}

/** 모달·시트 공통 비율 스타일 */
export function useScaledModalStyles() {
  const { rs } = useResponsive();
  return useMemo(
    () => ({
      sheet: {
        borderTopLeftRadius: rs(20),
        borderTopRightRadius: rs(20),
      },
      card: {
        borderRadius: rs(16),
      },
      backdropPad: { padding: rs(18) },
      backdropPadH: { paddingHorizontal: rs(16) },
      header: { paddingHorizontal: rs(16), paddingVertical: rs(14) },
      headerCompact: { paddingVertical: rs(12) },
      title: { fontSize: rs(16) },
      closeBtn: {
        paddingHorizontal: rs(10),
        paddingVertical: rs(6),
        borderRadius: rs(10),
      },
      closeText: { fontSize: rs(12) },
      body: { padding: rs(16), gap: rs(14) },
      bodyCompact: { gap: rs(12) },
      field: { gap: rs(6) },
      label: { fontSize: rs(12) },
      fieldHint: { fontSize: rs(11) },
      noteCount: { fontSize: rs(11) },
      input: {
        borderRadius: rs(12),
        paddingHorizontal: rs(12),
        paddingVertical: rs(11),
        fontSize: rs(14),
      },
      noteInput: { minHeight: rs(72) },
      genderRow: { gap: rs(8) },
      genderBtn: { borderRadius: rs(12), paddingVertical: rs(11) },
      genderBtnText: { fontSize: rs(13) },
      photoRow: { gap: rs(10) },
      photoBtn: {
        paddingHorizontal: rs(12),
        paddingVertical: rs(10),
        borderRadius: rs(12),
      },
      photoBtnText: { fontSize: rs(12) },
      photoInfo: { paddingHorizontal: rs(10) },
      photoInfoText: { fontSize: rs(12) },
      footer: { padding: rs(16) },
      saveBtn: { borderRadius: rs(12), paddingVertical: rs(13) },
      saveText: { fontSize: rs(15) },
      avatar: { width: rs(62), height: rs(62), borderRadius: rs(31) },
      avatarFallbackText: { fontSize: rs(22) },
      topRow: { gap: rs(12), marginBottom: rs(6) },
      topText: { gap: rs(4) },
      name: { fontSize: rs(18) },
      section: { gap: rs(4) },
      value: { fontSize: rs(14) },
      footerRow: { gap: rs(10) },
      primaryBtn: { borderRadius: rs(12), paddingVertical: rs(13) },
      primaryText: { fontSize: rs(14) },
      list: { maxHeight: rs(320) },
      listContent: { gap: rs(8), paddingBottom: rs(4) },
      row: {
        gap: rs(10),
        borderRadius: rs(12),
        paddingHorizontal: rs(12),
        paddingVertical: rs(10),
      },
      toolbar: { gap: rs(8) },
      toolbarBtn: {
        borderRadius: rs(10),
        paddingHorizontal: rs(10),
        paddingVertical: rs(7),
      },
      toolbarBtnText: { fontSize: rs(12) },
      subtitle: { fontSize: rs(12) },
      sendBtnText: { fontSize: rs(15) },
      dangerBtn: {
        borderRadius: rs(12),
        paddingHorizontal: rs(14),
        paddingVertical: rs(13),
      },
      dangerText: { fontSize: rs(13) },
      messageInput: {
        borderRadius: rs(12),
        padding: rs(12),
        fontSize: rs(14),
        minHeight: rs(72),
      },
      sendBtn: { borderRadius: rs(12), paddingVertical: rs(13) },
      sheetPad: { padding: rs(16), gap: rs(10) },
    }),
    [rs],
  );
}
