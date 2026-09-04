/**
 * 가족 검색용 디렉터리.
 * 전화·이름+생년월일로 동일 인물을 합치고, 나 보기 항목을 우선한다.
 */

import { ALL_VIEWS, type ActiveView, type PedigreeStore } from '../types/lineage';
import { ACTIVE_VIEW_LABEL } from '../types/lineage';
import type { Person } from '../types/pedigree';
import { kinshipLabelToDisplayName } from './kinship';
import { normalizePhoneDigits } from './phone';
import { buildViewKinshipLabels } from './viewSync';
import { getActiveLocale, displayKinship, displayViewLabels } from '../i18n/translate';
import { collatorLocale } from '../i18n/types';

export type FamilyDirectoryEntry = {
  key: string;
  person: Person;
  view: ActiveView;
  viewLabel: string;
  kinshipLabel: string;
};

function identityKey(person: Person, view: ActiveView): string {
  const phone = normalizePhoneDigits(person.phone);
  if (phone) return `phone:${phone}`;
  const name = person.name?.trim() ?? '';
  const birth = person.birthDate?.trim() ?? '';
  if (name && birth) return `nb:${name}|${birth}`;
  return `id:${view}:${person.id}`;
}

function isSparsePerson(person: Person): boolean {
  return (
    !person.name?.trim() &&
    !normalizePhoneDigits(person.phone) &&
    !person.birthDate?.trim() &&
    !person.note?.trim() &&
    !person.photoUri?.trim()
  );
}

export function collectFamilyDirectory(
  store: PedigreeStore,
  opts?: { includeEmpty?: boolean },
): FamilyDirectoryEntry[] {
  const selfPeople = store.views.self;
  const byKey = new Map<string, FamilyDirectoryEntry>();

  for (const view of ALL_VIEWS) {
    const people = store.views[view];
    if (!people) continue;
    const labels = buildViewKinshipLabels(view, people, selfPeople);

    for (const person of Object.values(people)) {
      if (!opts?.includeEmpty && isSparsePerson(person)) continue;

      const kinshipLabel =
        kinshipLabelToDisplayName(labels[person.id] ?? person.name ?? '', person) ||
        person.name?.trim() ||
        '친족';
      const key = identityKey(person, view);
      const entry: FamilyDirectoryEntry = {
        key,
        person,
        view,
        viewLabel: ACTIVE_VIEW_LABEL[view],
        kinshipLabel,
      };
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, entry);
        continue;
      }
      if (existing.view !== 'self' && view === 'self') {
        byKey.set(key, entry);
      } else if (person.name?.trim() && !existing.person.name?.trim()) {
        byKey.set(key, { ...existing, person, kinshipLabel });
      }
    }
  }

  return Array.from(byKey.values());
}

function compact(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, '');
}

export function searchFamilyDirectory(
  entries: FamilyDirectoryEntry[],
  query: string,
): FamilyDirectoryEntry[] {
  const q = compact(query);
  const locale = getActiveLocale();
  if (!q) {
    return [...entries].sort((a, b) =>
      a.kinshipLabel.localeCompare(b.kinshipLabel, collatorLocale(locale)),
    );
  }

  return entries
    .filter(entry => {
      const name = compact(entry.person.name ?? '');
      const kinship = compact(entry.kinshipLabel);
      const kinshipTranslated = compact(displayKinship(entry.kinshipLabel, locale));
      const viewTranslated = compact(displayViewLabels(entry.viewLabel, locale));
      const phone = normalizePhoneDigits(entry.person.phone);
      return (
        name.includes(q) ||
        kinship.includes(q) ||
        kinshipTranslated.includes(q) ||
        viewTranslated.includes(q) ||
        phone.includes(q)
      );
    })
    .sort((a, b) => a.kinshipLabel.localeCompare(b.kinshipLabel, collatorLocale(locale)));
}
