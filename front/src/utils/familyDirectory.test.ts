import type { Person } from '../types/pedigree';
import { searchFamilyDirectory, type FamilyDirectoryEntry } from './familyDirectory';
import { buildAnniversaryList, daysUntilNextBirthday } from './anniversaries';

function person(id: string, extra: Partial<Person> = {}): Person {
  return {
    id,
    name: '',
    createdAt: '2020-01-01T00:00:00.000Z',
    ...extra,
  };
}

function entry(partial: Partial<FamilyDirectoryEntry> & Pick<FamilyDirectoryEntry, 'key' | 'person'>): FamilyDirectoryEntry {
  return {
    view: 'self',
    viewLabel: '나',
    kinshipLabel: '친족',
    ...partial,
  };
}

describe('searchFamilyDirectory', () => {
  const entries: FamilyDirectoryEntry[] = [
    entry({
      key: '1',
      person: person('a', { name: '김민수' }),
      kinshipLabel: '삼촌',
    }),
    entry({
      key: '2',
      person: person('b', { name: '박영희' }),
      kinshipLabel: '이모',
    }),
    entry({
      key: '3',
      person: person('c', { name: '이수진' }),
      kinshipLabel: '큰이모',
    }),
  ];

  it('이름으로 찾는다', () => {
    expect(searchFamilyDirectory(entries, '영희').map(e => e.person.name)).toEqual(['박영희']);
  });

  it('호칭으로 찾는다', () => {
    expect(searchFamilyDirectory(entries, '삼촌').map(e => e.person.name)).toEqual(['김민수']);
  });

  it('이모가 들어간 호칭을 모두 찾는다', () => {
    expect(searchFamilyDirectory(entries, '이모').map(e => e.person.name)).toEqual(['박영희', '이수진']);
  });
});

describe('daysUntilNextBirthday', () => {
  const ref = new Date(2026, 7, 16); // Aug 16 2026

  it('오늘 생일이면 0', () => {
    expect(daysUntilNextBirthday(8, 16, ref)).toBe(0);
  });

  it('내일 생일이면 1', () => {
    expect(daysUntilNextBirthday(8, 17, ref)).toBe(1);
  });

  it('지난 생일은 내년으로 넘긴다', () => {
    expect(daysUntilNextBirthday(1, 1, ref)).toBeGreaterThan(100);
  });
});

describe('buildAnniversaryList', () => {
  const ref = new Date(2026, 7, 16);
  const entries: FamilyDirectoryEntry[] = [
    entry({
      key: 'later',
      person: person('a', { name: '가을', birthDate: '1990-12-01' }),
      kinshipLabel: '형',
    }),
    entry({
      key: 'soon',
      person: person('b', { name: '여름', birthDate: '1988-08-20' }),
      kinshipLabel: '누나',
    }),
    entry({
      key: 'none',
      person: person('c', { name: '날짜없음' }),
      kinshipLabel: '동생',
    }),
  ];

  it('생일이 가까운 순으로 정렬하고 날짜 없는 사람은 뺀다', () => {
    const list = buildAnniversaryList(entries, ref);
    expect(list.map(e => e.person.name)).toEqual(['여름', '가을']);
    expect(list[0].daysUntil).toBeLessThan(list[1].daysUntil);
  });
});
