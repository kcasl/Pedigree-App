/**
 * 사용자 입력(사진·연락처 등) 유지 — 템플릿/동기화/마이그레이션 공통 규칙
 * @see .cursor/rules/persist-user-data.mdc
 */

import type { ActiveView, PedigreeStore } from '../types/lineage';
import type { GenderType, Person, PersonId } from '../types/pedigree';

export const USER_OWNED_PERSON_FIELDS = [
  'name',
  'phone',
  'birthDate',
  'photoUri',
  'note',
  'gender',
] as const satisfies ReadonlyArray<keyof Person>;

const ALL_VIEWS: ActiveView[] = ['self', 'paternal', 'maternal', 'spouse'];

/** 템플릿 기본 이름이 아닌, 사용자가 입력한 이름인지 */
export function hasUserEditedPersonName(
  person: Person,
  templateDefaultName?: string,
): boolean {
  const name = person.name?.trim();
  if (!name) return false;
  if (templateDefaultName && name === templateDefaultName.trim()) return false;
  return true;
}

/** 뷰 동기화 — source에 값이 있을 때만 target에 반영, 없으면 target 유지 */
export function mergeUserFieldsFromSource(source: Person, target: Person): Person {
  return {
    ...target,
    name: source.name?.trim() ? source.name : target.name,
    phone: source.phone ?? target.phone,
    birthDate: source.birthDate ?? target.birthDate,
    gender:
      source.gender && source.gender !== 'unknown' ? source.gender : target.gender,
    photoUri: source.photoUri ?? target.photoUri,
    note: source.note ?? target.note,
  };
}

type StructuralPersonFields = Pick<Person, 'id' | 'fatherId' | 'motherId' | 'spouseId'>;

/** 템플릿 reconcile — 구조는 template, 사용자 입력은 existing 우선 */
export function mergePersonWithTemplate(
  template: Person,
  existing: Person,
  structural: StructuralPersonFields,
  options?: {
    renameFrom?: string;
    renameTo?: string;
    kinshipName?: string;
  },
): Person {
  let name = existing.name?.trim() ? existing.name : template.name;
  if (options?.renameFrom && options?.renameTo && existing.name === options.renameFrom) {
    name = options.renameTo;
  } else if (
    options?.kinshipName &&
    !hasUserEditedPersonName(existing, template.name)
  ) {
    name = options.kinshipName;
  }

  return {
    ...template,
    ...existing,
    ...structural,
    name,
    photoUri: existing.photoUri ?? template.photoUri,
    phone: existing.phone ?? template.phone,
    birthDate: existing.birthDate ?? template.birthDate,
    note: existing.note ?? template.note,
    gender:
      existing.gender && existing.gender !== 'unknown'
        ? existing.gender
        : template.gender,
    createdAt: existing.createdAt || template.createdAt,
  };
}

/** 로컬·원격 병합 — 사진 등 사용자 필드는 local 우선, 관계는 incoming 보강 */
export function mergePersonPreferLocalUserData(local: Person, incoming: Person): Person {
  const gender: GenderType | undefined =
    local.gender && local.gender !== 'unknown'
      ? local.gender
      : incoming.gender;

  return {
    ...incoming,
    ...local,
    id: local.id,
    fatherId: incoming.fatherId ?? local.fatherId,
    motherId: incoming.motherId ?? local.motherId,
    spouseId: local.spouseId ?? incoming.spouseId,
    name: local.name?.trim() ? local.name : incoming.name,
    photoUri: local.photoUri ?? incoming.photoUri,
    phone: local.phone ?? incoming.phone,
    birthDate: local.birthDate ?? incoming.birthDate,
    note: local.note ?? incoming.note,
    gender,
    createdAt: local.createdAt || incoming.createdAt,
  };
}

export function mergeViewPeoplePreferLocal(
  local: Record<PersonId, Person>,
  incoming: Record<PersonId, Person>,
): Record<PersonId, Person> {
  const out: Record<PersonId, Person> = { ...local };
  for (const id of Object.keys(incoming)) {
    const fromLocal = local[id];
    const fromIncoming = incoming[id];
    if (!fromIncoming) continue;
    out[id] = fromLocal
      ? mergePersonPreferLocalUserData(fromLocal, fromIncoming)
      : fromIncoming;
  }
  for (const id of Object.keys(local)) {
    if (!incoming[id] && local[id]) {
      out[id] = local[id];
    }
  }
  return out;
}

/** 서버·로컬 store 병합 후 reconcile/sync는 호출 측에서 수행 */
export function mergePedigreeStoresPreferLocalUserData(
  local: PedigreeStore,
  incoming: PedigreeStore,
): PedigreeStore {
  const views = { ...local.views };
  for (const view of ALL_VIEWS) {
    views[view] = mergeViewPeoplePreferLocal(
      local.views[view] ?? {},
      incoming.views[view] ?? {},
    );
  }
  return {
    ...local,
    version: 2,
    activeView: local.activeView ?? incoming.activeView,
    views,
  };
}

/** legacy flat → slot 인물 병합 */
export function mergeLegacyPersonIntoSlot(
  template: Person,
  legacy: Person,
  slotId: PersonId,
): Person {
  return mergePersonWithTemplate(template, legacy, {
    id: slotId,
    fatherId: template.fatherId,
    motherId: template.motherId,
    spouseId: template.spouseId ?? legacy.spouseId,
  });
}
