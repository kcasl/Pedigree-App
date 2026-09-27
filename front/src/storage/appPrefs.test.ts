import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_APP_PREFS, loadAppPrefs } from './appPrefs';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const getItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;

describe('appPrefs', () => {
  beforeEach(() => {
    getItem.mockReset();
  });

  it('treats a missing store as first launch (must pick language)', async () => {
    getItem.mockResolvedValue(null);
    const prefs = await loadAppPrefs();
    expect(prefs.localeChosen).toBe(false);
    expect(prefs).toEqual(DEFAULT_APP_PREFS);
  });

  it('does not force existing installs without localeChosen to pick again', async () => {
    getItem.mockResolvedValue(
      JSON.stringify({
        hideEmptyPeopleInSearch: true,
        showPhoneOnAnniversaries: true,
        locale: 'ko',
      }),
    );
    const prefs = await loadAppPrefs();
    expect(prefs.localeChosen).toBe(true);
    expect(prefs.locale).toBe('ko');
  });
});
