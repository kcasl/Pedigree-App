import { dictionaries } from './messages';
import { translateKinship } from './kinship';
import { setActiveLocale, t, translate } from './translate';
import { LOCALES } from './types';

describe('i18n', () => {
  afterEach(() => {
    setActiveLocale('ko');
  });

  it('uses English copy for the first-run language picker', () => {
    expect(t('languageSelect.title', undefined, 'en')).toBe('Choose your language');
    expect(t('languageSelect.subtitle', undefined, 'en')).toBe(
      'Please select a default language',
    );
    expect(t('languageSelect.continue', undefined, 'en')).toBe('Continue');
  });

  it('lists the four configured locales', () => {
    expect(LOCALES).toEqual(['ko', 'en', 'ja', 'zh']);
  });

  it('falls back to Korean when a locale table is missing a key at runtime', () => {
    expect(translate('en', 'settings.title')).toBe('Settings');
    expect(t('common.cancel', undefined, 'ja')).toBe('キャンセル');
  });

  it('interpolates variables', () => {
    expect(t('home.welcomeNamed', { name: '민수' })).toBe('민수님, 환영합니다');
    expect(t('home.welcomeNamed', { name: 'Mina' }, 'en')).toBe('Welcome, Mina');
  });

  it('has the same keys in all four dictionaries', () => {
    const keys = Object.keys(dictionaries.ko).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(dictionaries[locale]).sort()).toEqual(keys);
    }
  });

  it('translates kinship labels but leaves given names unchanged', () => {
    expect(translateKinship('아버지', 'en')).toBe('Father');
    expect(translateKinship('이모', 'ja')).toBe('母方の叔母');
    expect(translateKinship('형', 'zh')).toBe('哥哥');
    expect(translateKinship('김민수', 'en')).toBe('김민수');
    expect(translateKinship('아버지', 'ko')).toBe('아버지');
  });

  it('translates compound kinship like 배우자 아버지 and 형의 아들', () => {
    expect(translateKinship('배우자 아버지', 'en')).toBe("Spouse's father");
    expect(translateKinship('형의 아들', 'zh')).toBe('哥哥的儿子');
    expect(translateKinship('이모의 딸', 'ja')).toBe('叔母の娘');
  });
});
