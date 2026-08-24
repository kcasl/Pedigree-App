import { formatPhoneDisplay, normalizePhoneDigits } from './phone';

describe('formatPhoneDisplay', () => {
  it('formats mobile numbers as 010-XXXX-XXXX', () => {
    expect(formatPhoneDisplay('01012345678')).toBe('010-1234-5678');
    expect(formatPhoneDisplay('010-1234-5678')).toBe('010-1234-5678');
    expect(formatPhoneDisplay('010 1234 5678')).toBe('010-1234-5678');
  });

  it('formats while typing', () => {
    expect(formatPhoneDisplay('010')).toBe('010');
    expect(formatPhoneDisplay('0101')).toBe('010-1');
    expect(formatPhoneDisplay('0101234')).toBe('010-1234');
    expect(formatPhoneDisplay('01012345')).toBe('010-1234-5');
  });

  it('normalizes digits only', () => {
    expect(normalizePhoneDigits('010-1234-5678')).toBe('01012345678');
  });
});
