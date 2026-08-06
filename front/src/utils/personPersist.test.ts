import type { Person } from '../types/pedigree';
import {
  mergePersonPreferLocalUserData,
  mergePersonWithTemplate,
  mergeUserFieldsFromSource,
} from './personPersist';

function p(partial: Partial<Person> & Pick<Person, 'id' | 'name'>): Person {
  return {
    createdAt: '2020-01-01T00:00:00.000Z',
    gender: 'unknown',
    ...partial,
  };
}

describe('personPersist', () => {
  it('mergeUserFieldsFromSource keeps target photo when source has none', () => {
    const target = p({ id: 'a', name: '나', photoUri: 'file://local.jpg' });
    const source = p({ id: 'a', name: '나' });
    expect(mergeUserFieldsFromSource(source, target).photoUri).toBe('file://local.jpg');
  });

  it('mergePersonPreferLocalUserData prefers local photo over remote', () => {
    const local = p({ id: 'a', name: '나', photoUri: 'file://local.jpg' });
    const remote = p({ id: 'a', name: '나', photoUri: 'https://remote.jpg' });
    expect(mergePersonPreferLocalUserData(local, remote).photoUri).toBe('file://local.jpg');
  });

  it('mergePersonWithTemplate keeps user-edited name over kinship default', () => {
    const template = p({ id: 'x', name: '이모' });
    const existing = p({ id: 'x', name: '순자', photoUri: 'file://a.jpg' });
    const merged = mergePersonWithTemplate(
      template,
      existing,
      { id: 'x', fatherId: 'f', motherId: 'm' },
      { kinshipName: '이모' },
    );
    expect(merged.name).toBe('순자');
    expect(merged.photoUri).toBe('file://a.jpg');
  });
});
