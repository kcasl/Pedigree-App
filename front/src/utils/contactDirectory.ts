import type { ActiveView, PedigreeStore } from '../types/lineage';
import { ACTIVE_VIEW_LABEL } from '../types/lineage';
import type { PersonId } from '../types/pedigree';
import { buildViewKinshipLabels } from './viewSync';
import { lineageGroupsForPerson } from './kinship';
import { normalizePhoneDigits } from './phone';
import { slotIdsForView } from './standardTemplate';

export type ContactLineageGroup = 'paternal' | 'maternal' | 'spouse';

export type ContactDirectoryEntry = {
  id: string;
  name: string;
  phone: string;
  viewLabel: string;
  kinshipLabel: string;
  /** 친가/외가/배우자 중 하나 — 없으면 전체(공통)만 */
  primaryLineage: ContactLineageGroup | null;
};

export type ContactLineageFilter = 'all' | ContactLineageGroup;

export const CONTACT_LINEAGE_FILTER_LABEL: Record<ContactLineageFilter, string> = {
  all: '전체선택',
  paternal: '친가선택',
  maternal: '외가선택',
  spouse: '배우자선택',
};

export const CONTACT_LINEAGE_FILTERS: ContactLineageFilter[] = [
  'all',
  'paternal',
  'maternal',
  'spouse',
];

type PhoneAccumulator = {
  name: string;
  phone: string;
  kinshipLabel: string;
  viewLabels: Set<string>;
  primaryLineage: ContactLineageGroup | null;
};

function resolvePrimaryLineageFromGroups(groups: ContactLineageGroup[]): ContactLineageGroup | null {
  if (groups.includes('spouse')) return 'spouse';
  if (groups.includes('paternal') && !groups.includes('maternal')) return 'paternal';
  if (groups.includes('maternal') && !groups.includes('paternal')) return 'maternal';
  if (groups.includes('paternal')) return 'paternal';
  if (groups.includes('maternal')) return 'maternal';
  return null;
}

function primaryLineageForPerson(
  view: ActiveView,
  personId: PersonId,
  selfPeople: PedigreeStore['views']['self'],
  selfId: PersonId,
): ContactLineageGroup | null {
  if (view === 'paternal') return 'paternal';
  if (view === 'maternal') return 'maternal';
  if (view === 'spouse') return 'spouse';
  return resolvePrimaryLineageFromGroups(
    lineageGroupsForPerson(selfPeople, selfId, personId),
  );
}

export function buildContactDirectoryEntries(store: PedigreeStore): ContactDirectoryEntry[] {
  const views: ActiveView[] = ['self', 'paternal', 'maternal', 'spouse'];
  const selfSlots = slotIdsForView('self');
  const selfPeople = store.views.self;
  const byPhone = new Map<string, PhoneAccumulator>();

  for (const view of views) {
    const people = store.views[view];
    const labels = buildViewKinshipLabels(view, people, selfPeople);

    for (const person of Object.values(people)) {
      const phone = normalizePhoneDigits(person.phone);
      if (!phone) continue;

      const lineage = primaryLineageForPerson(view, person.id, selfPeople, selfSlots.selfId);
      const existing = byPhone.get(phone);

      if (!existing) {
        byPhone.set(phone, {
          name: person.name?.trim() || '이름 없음',
          phone,
          kinshipLabel: labels[person.id] ?? person.name ?? '친족',
          viewLabels: new Set([ACTIVE_VIEW_LABEL[view]]),
          primaryLineage: lineage,
        });
        continue;
      }

      existing.viewLabels.add(ACTIVE_VIEW_LABEL[view]);
      if (person.name?.trim()) existing.name = person.name.trim();
      if (labels[person.id]) existing.kinshipLabel = labels[person.id];

      if (view === 'self' && lineage != null) {
        existing.primaryLineage = lineage;
      } else if (existing.primaryLineage == null && lineage != null) {
        existing.primaryLineage = lineage;
      }
    }
  }

  return Array.from(byPhone.values()).map(entry => ({
    id: entry.phone,
    name: entry.name,
    phone: entry.phone,
    viewLabel: Array.from(entry.viewLabels).join(' · '),
    kinshipLabel: entry.kinshipLabel,
    primaryLineage: entry.primaryLineage,
  }));
}

export function entryMatchesLineageFilter(
  entry: ContactDirectoryEntry,
  filter: ContactLineageFilter,
): boolean {
  if (filter === 'all') return true;
  return entry.primaryLineage === filter;
}

export function filterContactEntries(
  entries: ContactDirectoryEntry[],
  filter: ContactLineageFilter,
): ContactDirectoryEntry[] {
  return entries.filter(entry => entryMatchesLineageFilter(entry, filter));
}
