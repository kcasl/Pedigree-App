import { fitNodeFontSize, visualTextUnits } from './fitNodeText';

describe('fitNodeText', () => {
  it('counts Korean kinship as short and English as longer', () => {
    expect(visualTextUnits('삼촌')).toBe(2);
    expect(visualTextUnits('Paternal uncle')).toBeGreaterThan(visualTextUnits('삼촌'));
  });

  it('keeps the base size for short Korean labels', () => {
    expect(fitNodeFontSize('삼촌', 12, { maxUnits: 8, minSize: 8 })).toBe(12);
    expect(fitNodeFontSize('이모', 16, { maxUnits: 14, minSize: 11 })).toBe(16);
  });

  it('shrinks long English kinship without going below minSize', () => {
    const uncle = fitNodeFontSize('Paternal uncle', 12, { maxUnits: 8, minSize: 8 });
    expect(uncle).toBeLessThan(12);
    expect(uncle).toBeGreaterThanOrEqual(8);

    const long = fitNodeFontSize("Paternal aunt's husband", 12, {
      maxUnits: 8,
      minSize: 8,
    });
    expect(long).toBe(8);
  });
});
