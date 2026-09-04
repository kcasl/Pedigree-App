/**
 * 선택한 인물을 "나"(me_sib2)로 두고 족보를 다시 그린다.
 *
 * 나 보기: 직계·형제·자녀와 부모 형제(윙)만.
 * 친가/외가: 기존 프리셋 칸을 채울 사람이 있을 때만.
 * 배우자 집안: 실데이터 배우자가 있을 때만.
 * 증조 위에 한 세대가 더 있으면 칸을 올리고, 손자 아래가 있으면 내린다.
 */

import { ALL_VIEWS, type ActiveView, type PedigreeStore } from '../types/lineage';
import type { Person, PersonId } from '../types/pedigree';
import {
  assignSiblingSlotIndices,
  collectCoupleChildIds,
  defaultSiblingBloodOrder,
  orderSiblingCouplesAroundFocal,
  siblingSlotBloodId,
  sortChildIdsForLayout,
  sortIdsByBirth,
} from './birthOrder';
import { nowIso } from './date';
import { mergeUserFieldsFromSource } from './personPersist';
import { SELF_SLOT_INDEX, reconcileStore, slotIdsForView } from './standardTemplate';
import { buildKinshipLabels, kinshipLabelToDisplayName } from './kinship';
import { buildViewKinshipLabels, resolveUserBloodIdInView } from './viewSync';

type ViewPrefix = 'me' | 'pat' | 'mat' | 'spo';

type FocalRole = 'blood' | 'inlaw';

const VIEW_RANK: Record<ActiveView, number> = {
  self: 0,
  paternal: 1,
  maternal: 2,
  spouse: 3,
};

const DESCENDANT_DEPTH_SELF = 3;
const DESCENDANT_DEPTH_COLLATERAL = 2;

function collectCoupleChildren(
  people: Record<PersonId, Person>,
  bloodId?: PersonId,
  spouseId?: PersonId,
): PersonId[] {
  if (!bloodId && !spouseId) return [];
  if (!bloodId) return collectCoupleChildIds(people, spouseId!);
  return collectCoupleChildIds(people, bloodId, spouseId);
}

function userFieldsFrom(source: Person, createdAt: string): Person {
  return {
    id: source.id,
    name: source.name?.trim() ? source.name : '친족',
    phone: source.phone,
    birthDate: source.birthDate,
    createdAt: source.createdAt || createdAt,
    photoUri: source.photoUri,
    note: source.note,
    gender: source.gender ?? 'unknown',
  };
}

function hasNatalParent(
  people: Record<PersonId, Person>,
  person?: Person,
): boolean {
  if (!person) return false;
  return !!(
    (person.fatherId && people[person.fatherId]) ||
    (person.motherId && people[person.motherId])
  );
}

/** 사용자 입력·초점 없이 템플릿 기본명만 있는 인물 — 친가/외가 재배치 시 제외 */
function isUnusedTemplatePerson(person: Person): boolean {
  if (person.phone || person.photoUri || person.note || person.birthDate) return false;
  const name = person.name?.trim() ?? '';
  if (!name) return true;
  return (
    /^(큰아버지|큰어머니|고모|고모부|삼촌|숙모|외삼촌|외숙모|이모|이모부|동서)$/.test(name) ||
    /^(?:형|큰형|누나|남동생|오빠|언니|여동생|큰아버지|고모|삼촌|외삼촌|이모|나|배우자 형|배우자 오빠|배우자 누나|배우자 남동생)의 (?:아들|딸|손자)$/.test(
      name,
    ) ||
    /^(나의 아들|나의 딸|나의 손자)$/.test(name)
  );
}

const DEFAULT_SLOT_NAME =
  /^(형|큰형|나|누나|남동생|오빠|언니|여동생|배우자|아버지|어머니|친할아버지|친할머니|외할아버지|외할머니|증조할아버지|증조할머니|큰아버지|큰어머니|고모|고모부|삼촌|숙모|외삼촌|외숙모|이모|이모부|형수|제수|매형|매부|매제|형부|제부|오빠 부인|동서|처남|처형|처제|시누이|시동생|시아주버니|배우자 .+)$/;

/** 템플릿 기본 칸만 있는 인물은 방계·비속으로 복사하지 않음 */
function isExportableRelative(person: Person): boolean {
  if (isUnusedTemplatePerson(person)) return false;
  if (person.phone || person.photoUri || person.note || person.birthDate) return true;
  const name = person.name?.trim() ?? '';
  if (!name) return false;
  return !DEFAULT_SLOT_NAME.test(name);
}

function relativeDedupeKey(person: Person): string {
  return `${person.name?.trim() ?? ''}|${person.birthDate ?? ''}|${person.photoUri ?? ''}`;
}

function isSiblingOfFocal(
  people: Record<PersonId, Person>,
  person: Person,
  focalId: PersonId,
): boolean {
  const focal = people[focalId];
  if (!focal || person.id === focalId) return false;
  const pool = collectCoupleChildren(people, focal.fatherId, focal.motherId);
  if (pool.includes(person.id)) return true;
  if (person.fatherId || person.motherId) {
    return collectCoupleChildren(people, person.fatherId, person.motherId).includes(focalId);
  }
  return false;
}

function isParentSiblingOfFocal(
  people: Record<PersonId, Person>,
  person: Person,
  focalId: PersonId,
): boolean {
  const focal = people[focalId];
  if (!focal || person.id === focalId) return false;
  for (const parentId of [focal.fatherId, focal.motherId]) {
    if (!parentId || parentId === person.id) continue;
    const parent = people[parentId];
    if (!parent) continue;
    const sibs = collectCoupleChildren(people, parent.fatherId, parent.motherId);
    if (sibs.includes(person.id)) return true;
  }
  return false;
}

function isCousinOfFocal(
  people: Record<PersonId, Person>,
  person: Person,
  focalId: PersonId,
): boolean {
  return !!cousinUncleOf(people, person, focalId);
}

function cousinUncleOf(
  people: Record<PersonId, Person>,
  person: Person,
  focalId: PersonId,
): Person | undefined {
  for (const parentId of [person.fatherId, person.motherId]) {
    const parent = parentId ? people[parentId] : undefined;
    if (parent && isParentSiblingOfFocal(people, parent, focalId)) return parent;
  }
  return undefined;
}

function isGrandparentSiblingOfFocal(
  people: Record<PersonId, Person>,
  person: Person,
  focalId: PersonId,
): boolean {
  const focal = people[focalId];
  if (!focal || person.id === focalId) return false;
  for (const parentId of [focal.fatherId, focal.motherId]) {
    const parent = parentId ? people[parentId] : undefined;
    if (!parent) continue;
    for (const gpId of [parent.fatherId, parent.motherId]) {
      const gp = gpId ? people[gpId] : undefined;
      if (!gp || gp.id === person.id) continue;
      const sibs = collectCoupleChildren(people, gp.fatherId, gp.motherId);
      if (sibs.includes(person.id)) return true;
      if (
        person.fatherId &&
        person.motherId &&
        person.fatherId === gp.fatherId &&
        person.motherId === gp.motherId
      ) {
        return true;
      }
    }
  }
  return false;
}

function isChildOfFocal(
  people: Record<PersonId, Person>,
  person: Person,
  focalId: PersonId,
): boolean {
  const focal = people[focalId];
  if (!focal) return false;
  return collectCoupleChildren(people, focalId, focal.spouseId).includes(person.id);
}

/** 실데이터이거나, 나 프리셋이 한 세대 올라가 삼촌/고모가 되는 경우만 유지. */
function isSelfPresetSiblingName(name: string): boolean {
  return /^(형|큰형|나|누나|남동생|오빠|언니|여동생)$/.test(name.trim());
}

function shouldKeepPerson(
  people: Record<PersonId, Person>,
  person: Person | undefined,
  focalId: PersonId,
): boolean {
  if (!person) return false;
  if (person.id === focalId) return true;
  if (isSiblingOfFocal(people, person, focalId)) return true;
  if (isChildOfFocal(people, person, focalId)) {
    const name = person.name?.trim() ?? '';
    if (/손자$/.test(name) && isUnusedTemplatePerson(person)) return false;
    return true;
  }
  if (isParentSiblingOfFocal(people, person, focalId)) {
    return isExportableRelative(person) || isSelfPresetSiblingName(person.name ?? '');
  }
  if (isCousinOfFocal(people, person, focalId)) {
    if (isExportableRelative(person)) return true;
    const uncle = cousinUncleOf(people, person, focalId);
    if (!uncle) return false;
    return isExportableRelative(uncle) || isSelfPresetSiblingName(uncle.name ?? '');
  }
  return isExportableRelative(person);
}

function isGhostTemplateRelative(
  people: Record<PersonId, Person>,
  person: Person,
  focalId: PersonId,
): boolean {
  if (person.id === focalId) return false;
  if (!isUnusedTemplatePerson(person)) return false;
  if (isSiblingOfFocal(people, person, focalId)) return false;
  if (isCousinOfFocal(people, person, focalId)) return false;
  if (isParentSiblingOfFocal(people, person, focalId)) return false;
  if (isGrandparentSiblingOfFocal(people, person, focalId)) return false;
  if (isChildOfFocal(people, person, focalId)) {
    return /손자$/.test(person.name?.trim() ?? '');
  }
  return /의 (?:아들|딸|손자)$/.test(person.name?.trim() ?? '');
}

function pruneGhostPeople(
  people: Record<PersonId, Person>,
  focalId: PersonId,
): Record<PersonId, Person> {
  const drop = new Set<PersonId>();
  for (const person of Object.values(people)) {
    if (isGhostTemplateRelative(people, person, focalId)) drop.add(person.id);
  }
  if (!drop.size) return people;
  const out: Record<PersonId, Person> = {};
  for (const [id, person] of Object.entries(people)) {
    if (drop.has(id)) continue;
    out[id] = {
      ...person,
      fatherId: person.fatherId && drop.has(person.fatherId) ? undefined : person.fatherId,
      motherId: person.motherId && drop.has(person.motherId) ? undefined : person.motherId,
      spouseId: person.spouseId && drop.has(person.spouseId) ? undefined : person.spouseId,
    };
  }
  return out;
}

/** 현재 나(self 초점) 기준으로 네 보기를 다시 짠다. */
export function rearrangePedigreeStore(store: PedigreeStore): PedigreeStore {
  const selfId = slotIdsForView('self').selfId;
  if (store.views.self?.[selfId]) {
    try {
      return rebaseStoreAroundPerson(store, selfId, 'self');
    } catch {
      // 초점 해석 실패 시 유령만 정리
    }
  }
  const views: PedigreeStore['views'] = { ...store.views };
  for (const view of ALL_VIEWS) {
    const people = store.views[view] ?? {};
    const focalId = slotIdsForView(view).selfId;
    views[view] = pruneGhostPeople(people, people[focalId] ? focalId : Object.keys(people)[0] ?? focalId);
  }
  return reconcileStore({ ...store, views });
}

/** 동일 인물이 여러 뷰에 있을 때 사용자 필드를 합친다. a 우선 */
function mergePersonUnion(a: Person, b: Person): Person {
  return {
    ...a,
    name: a.name?.trim() ? a.name : b.name,
    phone: a.phone || b.phone,
    birthDate: a.birthDate || b.birthDate,
    photoUri: a.photoUri || b.photoUri,
    note: a.note || b.note,
    gender: a.gender && a.gender !== 'unknown' ? a.gender : b.gender,
    createdAt: a.createdAt || b.createdAt,
  };
}

function viewKey(view: ActiveView, id: PersonId): string {
  return `${view}\0${id}`;
}

type ViewMember = { view: ActiveView; id: PersonId; person: Person };

function parentIsAnchor(
  parent: Person,
  parentView: ActiveView,
  parentId: PersonId,
  childId: PersonId,
  views: Record<ActiveView, Record<PersonId, Person>>,
): boolean {
  if (isExportableRelative(parent)) return true;
  const kids = collectCoupleChildren(
    views[parentView] ?? {},
    parentId,
    parent.spouseId,
  );
  return kids.some(kidId => {
    if (kidId === childId) return false;
    const kid = views[parentView][kidId];
    return !!kid && isExportableRelative(kid);
  });
}

function pickCanonicalId(members: ViewMember[]): PersonId {
  const sorted = [...members].sort((a, b) => {
    const rank = VIEW_RANK[a.view] - VIEW_RANK[b.view];
    if (rank !== 0) return rank;
    return a.id.localeCompare(b.id);
  });
  return sorted[0]!.id;
}

function shouldPreserveLineageParentLink(view: ActiveView, id: PersonId): boolean {
  if (view === 'self') return true;
  const slots = slotIdsForView(view);
  const focalKids = slots.children[SELF_SLOT_INDEX] ?? [];
  if (focalKids.includes(id)) return false;
  if (/_gc\d+_/.test(id) && id.includes(`_gc${SELF_SLOT_INDEX}_`)) return false;
  return true;
}

function pickLinkedId(
  members: ViewMember[],
  role: 'fatherId' | 'motherId' | 'spouseId',
  canonOf: (view: ActiveView, id: PersonId) => PersonId | undefined,
  views: Record<ActiveView, Record<PersonId, Person>>,
): PersonId | undefined {
  const selfMember = members.find(m => m.view === 'self');
  if (selfMember) {
    const raw = selfMember.person[role];
    if (raw && views.self?.[raw]) return canonOf('self', raw);
  }
  const memberIsExportable = members.some(m => isExportableRelative(m.person));
  const selfSpouseId = slotIdsForView('self').spouseId;
  const isSelfSpouse = members.some(m => m.view === 'self' && m.id === selfSpouseId);
  let fallback: PersonId | undefined;
  for (const member of members) {
    const raw = member.person[role];
    if (!raw || !views[member.view]?.[raw]) continue;
    const linked = canonOf(member.view, raw);
    if (!linked) continue;
    if (role === 'spouseId') return linked;
    const parent = views[member.view][raw];
    if (
      memberIsExportable ||
      parentIsAnchor(parent, member.view, raw, member.id, views) ||
      (isSelfSpouse && member.view === 'spouse')
    ) {
      return linked;
    }
    if (shouldPreserveLineageParentLink(member.view, member.id)) {
      fallback ??= linked;
    }
  }
  return fallback;
}

function seedStaticIdentityUnions(union: (a: string, b: string) => void): void {
  const me = slotIdsForView('self');
  const pat = slotIdsForView('paternal');
  const mat = slotIdsForView('maternal');
  const spo = slotIdsForView('spouse');
  const pairs: Array<[ActiveView, PersonId, ActiveView, PersonId]> = [
    ['self', me.father, 'paternal', pat.selfId],
    ['self', me.mother, 'paternal', pat.spouseId],
    ['self', me.gf, 'paternal', pat.father],
    ['self', me.gm, 'paternal', pat.mother],
    ['self', me.ggf, 'paternal', pat.gf],
    ['self', me.ggm, 'paternal', pat.gm],
    ['self', me.mgf, 'paternal', pat.mgf],
    ['self', me.mgm, 'paternal', pat.mgm],
    ['self', me.mother, 'maternal', mat.selfId],
    ['self', me.father, 'maternal', mat.spouseId],
    ['self', me.mgf, 'maternal', mat.father],
    ['self', me.mgm, 'maternal', mat.mother],
    ['self', me.mggf, 'maternal', mat.gf],
    ['self', me.mggm, 'maternal', mat.gm],
    ['self', me.spouseId, 'spouse', spo.selfId],
    ['self', me.selfId, 'spouse', spo.spouseId],
  ];
  for (const [v1, i1, v2, i2] of pairs) {
    union(viewKey(v1, i1), viewKey(v2, i2));
  }
}

/**
 * 모든 보기의 동일 인물을 한 그래프에 합친다.
 * 슬롯 대응 + (같은 부모 컴포넌트 · 실데이터 키) + 배우자 링크.
 */
function flattenStoreToCanonical(store: PedigreeStore): {
  people: Record<PersonId, Person>;
  resolveId: (view: ActiveView, id: PersonId) => PersonId;
} {
  const views = store.views;
  const parent = new Map<string, string>();

  const find = (k: string): string => {
    if (!parent.has(k)) parent.set(k, k);
    const chain: string[] = [];
    let cur = k;
    while (parent.get(cur) !== cur) {
      chain.push(cur);
      cur = parent.get(cur)!;
    }
    for (const node of chain) parent.set(node, cur);
    return cur;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const view of ALL_VIEWS) {
    for (const id of Object.keys(views[view] ?? {})) {
      find(viewKey(view, id as PersonId));
    }
  }
  seedStaticIdentityUnions(union);

  const coupleKey = (view: ActiveView, person: Person): string | null => {
    const f =
      person.fatherId && views[view]?.[person.fatherId]
        ? find(viewKey(view, person.fatherId))
        : '';
    const m =
      person.motherId && views[view]?.[person.motherId]
        ? find(viewKey(view, person.motherId))
        : '';
    if (!f && !m) return null;
    return [f, m].filter(Boolean).sort().join('|');
  };

  for (let pass = 0; pass < 12; pass += 1) {
    let changed = false;
    const tryUnion = (a: string, b: string) => {
      if (find(a) !== find(b)) {
        union(a, b);
        changed = true;
      }
    };

    const membersByRoot = new Map<string, ViewMember[]>();
    for (const view of ALL_VIEWS) {
      for (const person of Object.values(views[view] ?? {})) {
        const root = find(viewKey(view, person.id));
        const list = membersByRoot.get(root) ?? [];
        list.push({ view, id: person.id, person });
        membersByRoot.set(root, list);
      }
    }

    for (const members of membersByRoot.values()) {
      const spouseKeys: string[] = [];
      for (const member of members) {
        const sid = member.person.spouseId;
        if (sid && views[member.view]?.[sid]) {
          spouseKeys.push(viewKey(member.view, sid));
        }
      }
      for (let i = 1; i < spouseKeys.length; i += 1) {
        tryUnion(spouseKeys[0]!, spouseKeys[i]!);
      }
    }

    const byParents = new Map<string, ViewMember[]>();
    for (const view of ALL_VIEWS) {
      for (const person of Object.values(views[view] ?? {})) {
        if (!isExportableRelative(person)) continue;
        const key = coupleKey(view, person);
        if (!key) continue;
        const list = byParents.get(key) ?? [];
        list.push({ view, id: person.id, person });
        byParents.set(key, list);
      }
    }
    for (const group of byParents.values()) {
      const byDedupe = new Map<string, ViewMember[]>();
      for (const member of group) {
        const k = relativeDedupeKey(member.person);
        const list = byDedupe.get(k) ?? [];
        list.push(member);
        byDedupe.set(k, list);
      }
      for (const same of byDedupe.values()) {
        for (let i = 1; i < same.length; i += 1) {
          tryUnion(
            viewKey(same[0]!.view, same[0]!.id),
            viewKey(same[i]!.view, same[i]!.id),
          );
        }
      }
    }

    if (!changed) break;
  }

  const membersByRoot = new Map<string, ViewMember[]>();
  for (const view of ALL_VIEWS) {
    for (const person of Object.values(views[view] ?? {})) {
      const root = find(viewKey(view, person.id));
      const list = membersByRoot.get(root) ?? [];
      list.push({ view, id: person.id, person });
      membersByRoot.set(root, list);
    }
  }

  const rootToCanon = new Map<string, PersonId>();
  const usedIds = new Set<PersonId>();
  for (const [root, members] of membersByRoot) {
    let canon = pickCanonicalId(members);
    if (usedIds.has(canon)) {
      const preferred = members.find(m => m.view === 'self') ?? members[0]!;
      canon = `${preferred.view}:${preferred.id}` as PersonId;
    }
    usedIds.add(canon);
    rootToCanon.set(root, canon);
  }

  const canonOf = (view: ActiveView, id: PersonId): PersonId | undefined => {
    const key = viewKey(view, id);
    if (!parent.has(key) && !views[view]?.[id]) return undefined;
    return rootToCanon.get(find(key));
  };

  const people: Record<PersonId, Person> = {};
  for (const [root, members] of membersByRoot) {
    const canonId = rootToCanon.get(root);
    if (!canonId) continue;
    const ordered = [...members].sort(
      (a, b) => VIEW_RANK[a.view] - VIEW_RANK[b.view] || a.id.localeCompare(b.id),
    );
    let merged = { ...ordered[0]!.person, id: canonId };
    for (let i = 1; i < ordered.length; i += 1) {
      merged = mergePersonUnion(merged, ordered[i]!.person);
    }
    merged = {
      ...merged,
      id: canonId,
      fatherId: pickLinkedId(members, 'fatherId', canonOf, views),
      motherId: pickLinkedId(members, 'motherId', canonOf, views),
      spouseId: pickLinkedId(members, 'spouseId', canonOf, views),
    };
    people[canonId] = merged;
  }

  return {
    people,
    resolveId: (view, id) => canonOf(view, id) ?? id,
  };
}

function classifyFocal(
  people: Record<PersonId, Person>,
  focalId: PersonId,
): FocalRole {
  const focal = people[focalId];
  if (!focal) return 'blood';
  const spouse = focal.spouseId ? people[focal.spouseId] : undefined;
  const focalNatal = hasNatalParent(people, focal);
  const spouseNatal = hasNatalParent(people, spouse);
  if (spouse && !focalNatal && spouseNatal) return 'inlaw';
  if (spouse && /_sp$/.test(focalId) && spouseNatal && !focalNatal) return 'inlaw';
  return 'blood';
}

/** 친가/외가 id → self 쪽 대응 id (있으면) */
export function resolveFocalToSelfView(
  store: PedigreeStore,
  sourceView: ActiveView,
  focalPersonId: PersonId,
): { view: ActiveView; personId: PersonId } {
  if (sourceView === 'self' || sourceView === 'spouse') {
    return { view: sourceView, personId: focalPersonId };
  }

  const selfPeople = store.views.self ?? {};
  const me = slotIdsForView('self');
  const lineage = slotIdsForView(sourceView);

  const staticMap: Record<string, PersonId> =
    sourceView === 'paternal'
      ? {
          [lineage.selfId]: me.father,
          [lineage.spouseId]: me.mother,
          [lineage.father]: me.gf,
          [lineage.mother]: me.gm,
          [lineage.gf]: me.ggf,
          [lineage.gm]: me.ggm,
          [lineage.mgf]: me.mgf,
          [lineage.mgm]: me.mgm,
        }
      : {
          [lineage.selfId]: me.mother,
          [lineage.spouseId]: me.father,
          [lineage.father]: me.mgf,
          [lineage.mother]: me.mgm,
        };

  const mapped = staticMap[focalPersonId];
  if (mapped && selfPeople[mapped]) {
    return { view: 'self', personId: mapped };
  }

  if (focalPersonId.endsWith('_sp')) {
    const bloodLineageId = focalPersonId.replace(/_sp$/, '');
    const selfBlood = staticMap[bloodLineageId];
    if (selfBlood && selfPeople[selfBlood]?.spouseId) {
      const sp = selfPeople[selfBlood].spouseId!;
      if (selfPeople[sp]) return { view: 'self', personId: sp };
    }
  }

  const childMatch = focalPersonId.match(/^(pat|mat)_c2_(\d+)(?:_sp)?$/);
  if (childMatch) {
    const father = selfPeople[me.father];
    const mother = selfPeople[me.mother];
    if (father && mother) {
      const sibs = sortIdsByBirth(
        collectCoupleChildren(selfPeople, father.id, mother.id),
        selfPeople,
      );
      const idx = Number(childMatch[2]);
      const bloodId = sibs[idx];
      if (bloodId && selfPeople[bloodId]) {
        if (focalPersonId.endsWith('_sp')) {
          const sp = selfPeople[bloodId].spouseId;
          if (sp && selfPeople[sp]) return { view: 'self', personId: sp };
        }
        return { view: 'self', personId: bloodId };
      }
    }
  }

  const sibMatch = focalPersonId.match(/^(pat|mat)_sib(\d+)(_sp)?$/);
  if (sibMatch && sourceView === 'paternal') {
    const gf = selfPeople[me.gf];
    const gm = selfPeople[me.gm];
    const father = selfPeople[me.father];
    if (gf && gm && father) {
      const uncles = sortIdsByBirth(
        collectCoupleChildren(selfPeople, gf.id, gm.id),
        selfPeople,
      );
      const fatherPos = uncles.indexOf(me.father);
      const slotIndex = Number(sibMatch[2]);
      let targetBlood: PersonId | undefined;
      if (fatherPos >= 0) {
        const delta = slotIndex - SELF_SLOT_INDEX;
        targetBlood = uncles[fatherPos + delta];
      }
      if (!targetBlood && uncles[slotIndex]) targetBlood = uncles[slotIndex];
      if (targetBlood && selfPeople[targetBlood]) {
        if (sibMatch[3]) {
          const sp = selfPeople[targetBlood].spouseId;
          if (sp && selfPeople[sp]) return { view: 'self', personId: sp };
        } else {
          return { view: 'self', personId: targetBlood };
        }
      }
    }
  }
  if (sibMatch && sourceView === 'maternal') {
    const mgf = selfPeople[me.mgf];
    const mgm = selfPeople[me.mgm];
    if (mgf && mgm) {
      const uncles = sortIdsByBirth(
        collectCoupleChildren(selfPeople, mgf.id, mgm.id),
        selfPeople,
      );
      const motherPos = uncles.indexOf(me.mother);
      const slotIndex = Number(sibMatch[2]);
      let targetBlood: PersonId | undefined;
      if (motherPos >= 0) {
        targetBlood = uncles[motherPos + (slotIndex - SELF_SLOT_INDEX)];
      }
      if (!targetBlood && uncles[slotIndex]) targetBlood = uncles[slotIndex];
      if (targetBlood && selfPeople[targetBlood]) {
        if (sibMatch[3]) {
          const sp = selfPeople[targetBlood].spouseId;
          if (sp && selfPeople[sp]) return { view: 'self', personId: sp };
        } else {
          return { view: 'self', personId: targetBlood };
        }
      }
    }
  }

  return { view: sourceView, personId: focalPersonId };
}

function siblingBloodId(prefix: ViewPrefix, slotIndex: number): PersonId {
  return siblingSlotBloodId(prefix, slotIndex);
}

function siblingSpouseId(bloodId: PersonId): PersonId {
  return `${bloodId}_sp`;
}

function childIdForParentSlot(
  prefix: ViewPrefix,
  parentSlotIndex: number,
  childIndex: number,
): PersonId {
  if (parentSlotIndex >= 0 && parentSlotIndex <= 4) {
    return `${prefix}_c${parentSlotIndex}_${childIndex}`;
  }
  return `${prefix}_c_extra_${parentSlotIndex}_${childIndex}`;
}

function ensurePerson(
  out: Record<PersonId, Person>,
  id: PersonId,
  source: Person,
  links: { fatherId?: PersonId; motherId?: PersonId; spouseId?: PersonId },
  createdAt: string,
  placed?: Map<PersonId, PersonId>,
): PersonId {
  const already = placed?.get(source.id);
  if (already && out[already]) {
    const cur = out[already];
    out[already] = {
      ...cur,
      fatherId:
        cur.fatherId && out[cur.fatherId] ? cur.fatherId : links.fatherId ?? cur.fatherId,
      motherId:
        cur.motherId && out[cur.motherId] ? cur.motherId : links.motherId ?? cur.motherId,
      spouseId:
        cur.spouseId && out[cur.spouseId] ? cur.spouseId : links.spouseId ?? cur.spouseId,
    };
    return already;
  }

  const base = userFieldsFrom(source, createdAt);
  const existing = out[id];
  out[id] = {
    ...(existing ?? base),
    ...base,
    id,
    fatherId: links.fatherId,
    motherId: links.motherId,
    spouseId: links.spouseId,
  };
  placed?.set(source.id, id);
  return id;
}

function placeIfSource(
  out: Record<PersonId, Person>,
  slotId: PersonId,
  source: Person | undefined,
  links: { fatherId?: PersonId; motherId?: PersonId; spouseId?: PersonId },
  createdAt: string,
  placed?: Map<PersonId, PersonId>,
): PersonId | undefined {
  if (!source) return undefined;
  return ensurePerson(out, slotId, source, links, createdAt, placed);
}

function placeNatalParentsOf(
  out: Record<PersonId, Person>,
  sourcePeople: Record<PersonId, Person>,
  childSrc: Person | undefined,
  childSlotId: PersonId,
  skipFatherSrcId: PersonId | undefined,
  skipMotherSrcId: PersonId | undefined,
  idPrefix: string,
  createdAt: string,
  placed?: Map<PersonId, PersonId>,
): void {
  if (!childSrc || !out[childSlotId]) return;
  const fOld = childSrc.fatherId;
  const mOld = childSrc.motherId;
  if ((fOld && fOld === skipFatherSrcId) || (mOld && mOld === skipMotherSrcId)) return;

  const fSrc = fOld && fOld !== skipFatherSrcId ? sourcePeople[fOld] : undefined;
  const mSrc = mOld && mOld !== skipMotherSrcId ? sourcePeople[mOld] : undefined;
  if (!fSrc && !mSrc) return;

  const existingF = fOld ? placed?.get(fOld) : undefined;
  const existingM = mOld ? placed?.get(mOld) : undefined;
  if (
    (!fSrc || (existingF && out[existingF])) &&
    (!mSrc || (existingM && out[existingM]))
  ) {
    out[childSlotId] = {
      ...out[childSlotId],
      fatherId: fSrc && existingF ? existingF : out[childSlotId].fatherId,
      motherId: mSrc && existingM ? existingM : out[childSlotId].motherId,
    };
    return;
  }

  const fId = (existingF && out[existingF] ? existingF : (`${idPrefix}_f` as PersonId));
  const mId = (existingM && out[existingM] ? existingM : (`${idPrefix}_m` as PersonId));
  const placedF = placeIfSource(
    out,
    fId,
    fSrc,
    { spouseId: mSrc ? mId : undefined },
    createdAt,
    placed,
  );
  const placedM = placeIfSource(
    out,
    mId,
    mSrc,
    { spouseId: fSrc ? fId : undefined },
    createdAt,
    placed,
  );
  out[childSlotId] = {
    ...out[childSlotId],
    fatherId: fSrc ? placedF ?? out[childSlotId].fatherId : out[childSlotId].fatherId,
    motherId: mSrc ? placedM ?? out[childSlotId].motherId : out[childSlotId].motherId,
  };
}

/** 이미 둔 조상 위에 한 세대가 더 있으면 칸을 올려 붙인다. */
function placeExtraGenerationAbove(
  out: Record<PersonId, Person>,
  sourcePeople: Record<PersonId, Person>,
  childSrc: Person | undefined,
  childSlotId: PersonId,
  idPrefix: string,
  createdAt: string,
  placed?: Map<PersonId, PersonId>,
): void {
  if (!childSrc || !out[childSlotId]) return;
  const alreadyF = out[childSlotId].fatherId;
  const alreadyM = out[childSlotId].motherId;
  const fSrc = childSrc.fatherId ? sourcePeople[childSrc.fatherId] : undefined;
  const mSrc = childSrc.motherId ? sourcePeople[childSrc.motherId] : undefined;
  const needF = !!fSrc && !(alreadyF && out[alreadyF]);
  const needM = !!mSrc && !(alreadyM && out[alreadyM]);
  if (!needF && !needM) return;

  const fId = (alreadyF && out[alreadyF] ? alreadyF : (`${idPrefix}_f` as PersonId));
  const mId = (alreadyM && out[alreadyM] ? alreadyM : (`${idPrefix}_m` as PersonId));
  let placedF = alreadyF && out[alreadyF] ? alreadyF : undefined;
  let placedM = alreadyM && out[alreadyM] ? alreadyM : undefined;
  if (needF) {
    placedF = placeIfSource(out, fId, fSrc, { spouseId: mSrc || alreadyM ? mId : undefined }, createdAt, placed);
  }
  if (needM) {
    placedM = placeIfSource(out, mId, mSrc, { spouseId: fSrc || alreadyF ? fId : undefined }, createdAt, placed);
  }
  out[childSlotId] = {
    ...out[childSlotId],
    fatherId: fSrc ? placedF ?? fId : out[childSlotId].fatherId,
    motherId: mSrc ? placedM ?? mId : out[childSlotId].motherId,
  };
}

function isPlaceholderSpouse(person: Person): boolean {
  if (isExportableRelative(person)) return false;
  const name = person.name?.trim() ?? '';
  if (!name || name === '배우자' || /^배우자\s/.test(name)) return true;
  return /^(형수|제수|매형|매부|매제|형부|제부|큰어머니|고모부|숙모|이모부|외숙모|오빠 부인|동서)$/.test(
    name,
  );
}

function spouseHasExportableNatal(
  people: Record<PersonId, Person>,
  spouse: Person,
): boolean {
  if (!hasNatalParent(people, spouse)) return false;
  const father = spouse.fatherId ? people[spouse.fatherId] : undefined;
  const mother = spouse.motherId ? people[spouse.motherId] : undefined;
  if ((father && isExportableRelative(father)) || (mother && isExportableRelative(mother))) {
    return true;
  }
  return collectCoupleChildren(people, spouse.fatherId, spouse.motherId).some(
    id => id !== spouse.id && isExportableRelative(people[id]),
  );
}

function keepableSpouse(
  sourcePeople: Record<PersonId, Person>,
  person: Person,
): Person | undefined {
  const spouseId = person.spouseId;
  if (!spouseId) return undefined;
  const spouse = sourcePeople[spouseId];
  if (!spouse) return undefined;
  if (!isUnusedTemplatePerson(spouse) && !isPlaceholderSpouse(spouse)) return spouse;
  if (spouseHasExportableNatal(sourcePeople, spouse)) return spouse;
  const kids = collectCoupleChildren(sourcePeople, person.id, spouseId);
  if (
    kids.some(id => {
      const kid = sourcePeople[id];
      if (!kid) return false;
      if (isExportableRelative(kid)) return true;
      const name = kid.name?.trim() ?? '';
      return /^(나의 아들|나의 딸)$/.test(name);
    })
  ) {
    return spouse;
  }
  return undefined;
}

/** 실데이터 배우자 본가가 있을 때만 배우자 집안 보기를 만든다. */
function shouldBuildSpouseView(
  people: Record<PersonId, Person>,
  focalId: PersonId,
): boolean {
  const focal = people[focalId];
  const spouse = focal?.spouseId ? people[focal.spouseId] : undefined;
  if (!spouse) return false;
  if (isExportableRelative(spouse)) return true;
  return spouseHasExportableNatal(people, spouse);
}

function placeDescendants(args: {
  out: Record<PersonId, Person>;
  sourcePeople: Record<PersonId, Person>;
  focalId: PersonId;
  oldBloodId: PersonId;
  oldSpouseId?: PersonId;
  newBloodId: PersonId;
  newSpouseId?: PersonId;
  childIdFor: (index: number) => PersonId;
  createdAt: string;
  depth: number;
  placed: Map<PersonId, PersonId>;
}): void {
  const {
    out,
    sourcePeople,
    focalId,
    oldBloodId,
    oldSpouseId,
    newBloodId,
    newSpouseId,
    childIdFor,
    createdAt,
    depth,
    placed,
  } = args;
  if (depth <= 0) return;

  const childIds = sortChildIdsForLayout(
    collectCoupleChildren(sourcePeople, oldBloodId, oldSpouseId),
    sourcePeople,
  ).filter(id => shouldKeepPerson(sourcePeople, sourcePeople[id], focalId));

  childIds.forEach((oldChildId, ci) => {
    const childSrc = sourcePeople[oldChildId];
    if (!childSrc) return;
    if (placed.has(oldChildId) && out[placed.get(oldChildId)!]) return;
    const newChildId = childIdFor(ci);
    const childSpouseSrc = keepableSpouse(sourcePeople, childSrc);
    const newChildSpouseId = childSpouseSrc ? (`${newChildId}_sp` as PersonId) : undefined;
    const fatherIsBlood =
      childSrc.fatherId === oldBloodId ||
      (!childSrc.fatherId && sourcePeople[oldBloodId]?.gender !== 'female');

    const placedChildId = ensurePerson(
      out,
      newChildId,
      childSrc,
      {
        fatherId: fatherIsBlood ? newBloodId : newSpouseId,
        motherId: fatherIsBlood ? newSpouseId : newBloodId,
        spouseId: newChildSpouseId,
      },
      createdAt,
      placed,
    );
    let placedSpouseId = newChildSpouseId;
    if (childSpouseSrc && newChildSpouseId) {
      placedSpouseId = ensurePerson(
        out,
        newChildSpouseId,
        childSpouseSrc,
        { spouseId: placedChildId },
        createdAt,
        placed,
      );
    }

    placeDescendants({
      out,
      sourcePeople,
      focalId,
      oldBloodId: oldChildId,
      oldSpouseId: childSrc.spouseId,
      newBloodId: placedChildId,
      newSpouseId: placedSpouseId,
      childIdFor: index => `${placedChildId}_d${index}` as PersonId,
      createdAt,
      depth: depth - 1,
      placed,
    });
  });
}

function filterSiblingPool(
  people: Record<PersonId, Person>,
  pool: PersonId[],
  focalId: PersonId,
): PersonId[] {
  return pool.filter(id => {
    if (id === focalId) return true;
    return shouldKeepPerson(people, people[id], focalId);
  });
}

/**
 * 초점 부모의 형제(새 족보에서 큰아버지·고모·이모·삼촌)와 그 배우자·자녀를 배치.
 */
function placeParentSiblings(
  out: Record<PersonId, Person>,
  sourcePeople: Record<PersonId, Person>,
  parentSrc: Person | undefined,
  newParentLinks: { fatherId?: PersonId; motherId?: PersonId },
  idPrefix: string,
  createdAt: string,
  focalId: PersonId,
  placed: Map<PersonId, PersonId>,
): void {
  if (!parentSrc) return;
  const gpFatherOld = parentSrc.fatherId;
  const gpMotherOld = parentSrc.motherId;
  if (!gpFatherOld && !gpMotherOld) return;

  const pool = collectCoupleChildren(sourcePeople, gpFatherOld, gpMotherOld).filter(id => {
    if (id === parentSrc.id) return false;
    return shouldKeepPerson(sourcePeople, sourcePeople[id], focalId);
  });
  if (!pool.length) return;

  const sorted = sortChildIdsForLayout(pool, sourcePeople);
  sorted.forEach((oldBloodId, i) => {
    const bloodSrc = sourcePeople[oldBloodId];
    if (!bloodSrc) return;
    if (placed.has(oldBloodId) && out[placed.get(oldBloodId)!]) return;
    const newBloodId = `${idPrefix}_${i}` as PersonId;
    const spSrc = keepableSpouse(sourcePeople, bloodSrc);
    const newSpouseId = spSrc ? (`${newBloodId}_sp` as PersonId) : undefined;

    const placedBloodId = ensurePerson(
      out,
      newBloodId,
      bloodSrc,
      {
        fatherId:
          newParentLinks.fatherId && out[newParentLinks.fatherId]
            ? newParentLinks.fatherId
            : undefined,
        motherId:
          newParentLinks.motherId && out[newParentLinks.motherId]
            ? newParentLinks.motherId
            : undefined,
        spouseId: newSpouseId,
      },
      createdAt,
      placed,
    );

    let placedSpouseId = newSpouseId;
    if (spSrc && newSpouseId) {
      placedSpouseId = ensurePerson(out, newSpouseId, spSrc, { spouseId: placedBloodId }, createdAt, placed);
    }

    placeDescendants({
      out,
      sourcePeople,
      focalId,
      oldBloodId,
      oldSpouseId: bloodSrc.spouseId,
      newBloodId: placedBloodId,
      newSpouseId: placedSpouseId,
      childIdFor: ci => `${placedBloodId}_c${ci}` as PersonId,
      createdAt,
      depth: DESCENDANT_DEPTH_COLLATERAL,
      placed,
    });
  });
}

function collapseDuplicatePeople(people: Record<PersonId, Person>): Record<PersonId, Person> {
  const keepByKey = new Map<string, PersonId>();
  const remap = new Map<PersonId, PersonId>();
  for (const person of Object.values(people)) {
    const name = person.name?.trim();
    if (!name) continue;
    if (DEFAULT_SLOT_NAME.test(name) && !person.birthDate && !person.photoUri) continue;
    const key = `${name}|${person.birthDate ?? ''}|${[person.fatherId, person.motherId]
      .filter(Boolean)
      .sort()
      .join(',')}`;
    const prev = keepByKey.get(key);
    if (!prev) {
      keepByKey.set(key, person.id);
      continue;
    }
    remap.set(person.id, prev);
  }
  if (!remap.size) return people;

  const out: Record<PersonId, Person> = {};
  for (const [id, person] of Object.entries(people)) {
    if (remap.has(id)) continue;
    out[id] = {
      ...person,
      fatherId: person.fatherId ? remap.get(person.fatherId) ?? person.fatherId : undefined,
      motherId: person.motherId ? remap.get(person.motherId) ?? person.motherId : undefined,
      spouseId: person.spouseId ? remap.get(person.spouseId) ?? person.spouseId : undefined,
    };
  }
  return out;
}

/**
 * 혈족 초점을 prefix(me/spo) 슬롯으로 재구성.
 * 템플릿 유령 노드를 넣지 않고, 소스에 있는 인물만 배치한다.
 */
function buildBloodCenteredView(
  sourcePeople: Record<PersonId, Person>,
  bloodFocalId: PersonId,
  prefix: ViewPrefix,
  _sourceView: ActiveView,
  createdAt: string,
  options?: {
    forceSpouseSource?: Person;
    forceSpouseIsFocal?: boolean;
    keepFocalId?: PersonId;
  },
): Record<PersonId, Person> {
  const focal = sourcePeople[bloodFocalId];
  if (!focal) return {};
  const keepFocalId = options?.keepFocalId ?? bloodFocalId;

  const slots = {
    ggf: `${prefix}_ggf` as PersonId,
    ggm: `${prefix}_ggm` as PersonId,
    mggf: `${prefix}_mggf` as PersonId,
    mggm: `${prefix}_mggm` as PersonId,
    gf: `${prefix}_gf` as PersonId,
    gm: `${prefix}_gm` as PersonId,
    mgf: `${prefix}_mgf` as PersonId,
    mgm: `${prefix}_mgm` as PersonId,
    father: `${prefix}_father` as PersonId,
    mother: `${prefix}_mother` as PersonId,
    selfId: `${prefix}_sib${SELF_SLOT_INDEX}` as PersonId,
    spouseId: `${prefix}_sib${SELF_SLOT_INDEX}_sp` as PersonId,
  };

  const out: Record<PersonId, Person> = {};
  const placed = new Map<PersonId, PersonId>();

  const fatherSrc = focal.fatherId ? sourcePeople[focal.fatherId] : undefined;
  const motherSrc = focal.motherId ? sourcePeople[focal.motherId] : undefined;
  const forcedSpouse =
    options?.forceSpouseSource && !isPlaceholderSpouse(options.forceSpouseSource)
      ? options.forceSpouseSource
      : undefined;
  const spouseSrc = forcedSpouse ?? keepableSpouse(sourcePeople, focal);

  const gfSrc = fatherSrc?.fatherId ? sourcePeople[fatherSrc.fatherId] : undefined;
  const gmSrc = fatherSrc?.motherId ? sourcePeople[fatherSrc.motherId] : undefined;
  const mgfSrc = motherSrc?.fatherId ? sourcePeople[motherSrc.fatherId] : undefined;
  const mgmSrc = motherSrc?.motherId ? sourcePeople[motherSrc.motherId] : undefined;
  const ggfSrc = gfSrc?.fatherId ? sourcePeople[gfSrc.fatherId] : undefined;
  const ggmSrc = gfSrc?.motherId ? sourcePeople[gfSrc.motherId] : undefined;
  const mggfSrc = mgfSrc?.fatherId ? sourcePeople[mgfSrc.fatherId] : undefined;
  const mggmSrc = mgfSrc?.motherId ? sourcePeople[mgfSrc.motherId] : undefined;

  const idOf = (src: Person | undefined, fallback?: PersonId): PersonId | undefined =>
    src ? placed.get(src.id) ?? fallback : undefined;

  placeIfSource(out, slots.ggf, ggfSrc, {}, createdAt, placed);
  placeIfSource(out, slots.ggm, ggmSrc, {}, createdAt, placed);
  placeIfSource(out, slots.mggf, mggfSrc, {}, createdAt, placed);
  placeIfSource(out, slots.mggm, mggmSrc, {}, createdAt, placed);

  placeIfSource(
    out,
    slots.gf,
    gfSrc,
    { fatherId: idOf(ggfSrc), motherId: idOf(ggmSrc) },
    createdAt,
    placed,
  );
  placeIfSource(out, slots.gm, gmSrc, {}, createdAt, placed);
  placeIfSource(
    out,
    slots.mgf,
    mgfSrc,
    { fatherId: idOf(mggfSrc), motherId: idOf(mggmSrc) },
    createdAt,
    placed,
  );
  placeIfSource(out, slots.mgm, mgmSrc, {}, createdAt, placed);

  const couple = (a?: Person, b?: Person) => {
    const aid = idOf(a);
    const bid = idOf(b);
    if (!aid || !bid || !out[aid] || !out[bid]) return;
    out[aid] = { ...out[aid], spouseId: bid };
    out[bid] = { ...out[bid], spouseId: aid };
  };
  couple(ggfSrc, ggmSrc);
  couple(mggfSrc, mggmSrc);
  couple(gfSrc, gmSrc);
  couple(mgfSrc, mgmSrc);

  placeNatalParentsOf(
    out,
    sourcePeople,
    gmSrc,
    idOf(gmSrc, slots.gm) ?? slots.gm,
    gfSrc?.fatherId,
    gfSrc?.motherId,
    `${prefix}_gm`,
    createdAt,
    placed,
  );
  placeNatalParentsOf(
    out,
    sourcePeople,
    mgmSrc,
    idOf(mgmSrc, slots.mgm) ?? slots.mgm,
    mgfSrc?.fatherId,
    mgfSrc?.motherId,
    `${prefix}_mgm`,
    createdAt,
    placed,
  );

  placeExtraGenerationAbove(out, sourcePeople, ggfSrc, idOf(ggfSrc, slots.ggf) ?? slots.ggf, `${prefix}_ggf`, createdAt, placed);
  placeExtraGenerationAbove(out, sourcePeople, ggmSrc, idOf(ggmSrc, slots.ggm) ?? slots.ggm, `${prefix}_ggm`, createdAt, placed);
  placeExtraGenerationAbove(out, sourcePeople, mggfSrc, idOf(mggfSrc, slots.mggf) ?? slots.mggf, `${prefix}_mggf`, createdAt, placed);
  placeExtraGenerationAbove(out, sourcePeople, mggmSrc, idOf(mggmSrc, slots.mggm) ?? slots.mggm, `${prefix}_mggm`, createdAt, placed);

  placeIfSource(
    out,
    slots.father,
    fatherSrc,
    {
      fatherId: idOf(gfSrc),
      motherId: idOf(gmSrc),
    },
    createdAt,
    placed,
  );
  placeIfSource(
    out,
    slots.mother,
    motherSrc,
    {
      fatherId: idOf(mgfSrc),
      motherId: idOf(mgmSrc),
    },
    createdAt,
    placed,
  );
  couple(fatherSrc, motherSrc);

  const collateral = (
    parent: Person | undefined,
    links: { fatherId?: PersonId; motherId?: PersonId },
    prefixKey: string,
  ) =>
    placeParentSiblings(out, sourcePeople, parent, links, prefixKey, createdAt, keepFocalId, placed);

  collateral(
    fatherSrc,
    { fatherId: idOf(gfSrc), motherId: idOf(gmSrc) },
    `${prefix}_psib`,
  );
  collateral(
    motherSrc,
    { fatherId: idOf(mgfSrc), motherId: idOf(mgmSrc) },
    `${prefix}_msib`,
  );

  let siblingPool =
    fatherSrc && motherSrc
      ? collectCoupleChildren(sourcePeople, fatherSrc.id, motherSrc.id)
      : fatherSrc || motherSrc
        ? collectCoupleChildren(sourcePeople, fatherSrc?.id, motherSrc?.id)
        : [bloodFocalId];

  if (!siblingPool.includes(bloodFocalId)) siblingPool.push(bloodFocalId);
  siblingPool = filterSiblingPool(sourcePeople, siblingPool, keepFocalId);
  if (!siblingPool.includes(bloodFocalId)) siblingPool.push(bloodFocalId);

  const templateOrder =
    prefix === 'me' ? defaultSiblingBloodOrder('self', slotIdsForView('self')) : undefined;
  const orderedSiblings = orderSiblingCouplesAroundFocal(
    siblingPool.map(id => ({ blood: id })),
    bloodFocalId,
    sourcePeople,
    templateOrder,
  ).couples.map(c => c.blood);
  const siblingsSorted = orderedSiblings.filter(id => siblingPool.includes(id));
  if (!siblingsSorted.includes(bloodFocalId)) siblingsSorted.push(bloodFocalId);
  const slotIndexByOldId = assignSiblingSlotIndices(siblingsSorted, bloodFocalId);

  for (const oldBloodId of siblingsSorted) {
    const bloodSrc = sourcePeople[oldBloodId];
    if (!bloodSrc) continue;
    const slotIndex = slotIndexByOldId.get(oldBloodId) ?? SELF_SLOT_INDEX;
    const newBloodId = siblingBloodId(prefix, slotIndex);

    const isFocalBlood = oldBloodId === bloodFocalId;
    const spSrc = isFocalBlood
      ? spouseSrc
      : keepableSpouse(sourcePeople, bloodSrc);
    const newSpouseId = spSrc ? siblingSpouseId(newBloodId) : undefined;

    const placedBloodId = ensurePerson(
      out,
      newBloodId,
      bloodSrc,
      {
        fatherId: idOf(fatherSrc),
        motherId: idOf(motherSrc),
        spouseId: newSpouseId,
      },
      createdAt,
      placed,
    );

    let placedSpouseId = newSpouseId;
    if (spSrc && newSpouseId) {
      placedSpouseId = ensurePerson(out, newSpouseId, spSrc, { spouseId: placedBloodId }, createdAt, placed);
    }

    placeDescendants({
      out,
      sourcePeople,
      focalId: keepFocalId,
      oldBloodId,
      oldSpouseId: bloodSrc.spouseId,
      newBloodId: placedBloodId,
      newSpouseId: placedSpouseId,
      childIdFor: ci => childIdForParentSlot(prefix, slotIndex, ci),
      createdAt,
      depth: DESCENDANT_DEPTH_SELF,
      placed,
    });
  }

  const meId = slots.selfId;
  if (out[meId] && focal.name?.trim()) {
    out[meId] = mergeUserFieldsFromSource(userFieldsFrom(focal, createdAt), {
      ...out[meId],
      id: meId,
    });
  }

  return collapseDuplicatePeople(out);
}

/**
 * 인척 초점: 나=인척, 배우자=혈족, 혈족의 형제·부모는 배우자 집안(spo)에 배치
 */
function buildInLawRebasedViews(
  sourcePeople: Record<PersonId, Person>,
  inlawId: PersonId,
  sourceView: ActiveView,
  createdAt: string,
): { self: Record<PersonId, Person>; spouse: Record<PersonId, Person> } {
  const inlaw = sourcePeople[inlawId];
  const bloodId = inlaw?.spouseId;
  const blood = bloodId ? sourcePeople[bloodId] : undefined;
  if (!inlaw || !bloodId || !blood) {
    return {
      self: buildBloodCenteredView(sourcePeople, inlawId, 'me', sourceView, createdAt),
      spouse: {},
    };
  }

  const meSlots = slotIdsForView('self');
  const self: Record<PersonId, Person> = {};

  const fatherSrc = inlaw.fatherId ? sourcePeople[inlaw.fatherId] : undefined;
  const motherSrc = inlaw.motherId ? sourcePeople[inlaw.motherId] : undefined;
  placeIfSource(
    self,
    meSlots.father,
    fatherSrc,
    { spouseId: motherSrc ? meSlots.mother : undefined },
    createdAt,
  );
  placeIfSource(
    self,
    meSlots.mother,
    motherSrc,
    { spouseId: fatherSrc ? meSlots.father : undefined },
    createdAt,
  );

  ensurePerson(
    self,
    meSlots.selfId,
    inlaw,
    {
      fatherId: fatherSrc ? meSlots.father : undefined,
      motherId: motherSrc ? meSlots.mother : undefined,
      spouseId: meSlots.spouseId,
    },
    createdAt,
  );
  ensurePerson(self, meSlots.spouseId, blood, { spouseId: meSlots.selfId }, createdAt);

  const childIds = sortChildIdsForLayout(
    collectCoupleChildren(sourcePeople, inlawId, bloodId),
    sourcePeople,
  ).filter(id => shouldKeepPerson(sourcePeople, sourcePeople[id], inlawId));
  childIds.forEach((oldChildId, ci) => {
    const childSrc = sourcePeople[oldChildId];
    if (!childSrc) return;
    const newChildId = `me_c${SELF_SLOT_INDEX}_${ci}` as PersonId;
    const fatherIsInlaw =
      childSrc.fatherId === inlawId ||
      (!childSrc.fatherId && inlaw.gender !== 'female');
    ensurePerson(
      self,
      newChildId,
      childSrc,
      {
        fatherId: fatherIsInlaw ? meSlots.selfId : meSlots.spouseId,
        motherId: fatherIsInlaw ? meSlots.spouseId : meSlots.selfId,
      },
      createdAt,
    );
  });

  const spouse = buildBloodCenteredView(sourcePeople, bloodId, 'spo', sourceView, createdAt, {
    forceSpouseSource: inlaw,
    keepFocalId: inlawId,
  });

  return { self, spouse };
}

function buildLineageViewsAround(
  sourcePeople: Record<PersonId, Person>,
  personId: PersonId,
  sourceView: ActiveView,
  createdAt: string,
  keepFocalId: PersonId,
  alreadyBuiltSpouse?: Record<PersonId, Person>,
): {
  paternal: Record<PersonId, Person>;
  maternal: Record<PersonId, Person>;
  spouse: Record<PersonId, Person>;
} {
  const person = sourcePeople[personId];
  const keep = { keepFocalId };
  const fatherId = person?.fatherId;
  const motherId = person?.motherId;
  const spouseId = person?.spouseId;
  return {
    paternal:
      fatherId && sourcePeople[fatherId]
        ? buildBloodCenteredView(sourcePeople, fatherId, 'pat', sourceView, createdAt, keep)
        : {},
    maternal:
      motherId && sourcePeople[motherId]
        ? buildBloodCenteredView(sourcePeople, motherId, 'mat', sourceView, createdAt, keep)
        : {},
    spouse:
      alreadyBuiltSpouse ??
      (shouldBuildSpouseView(sourcePeople, personId)
        ? buildBloodCenteredView(sourcePeople, spouseId!, 'spo', sourceView, createdAt, {
            ...keep,
            forceSpouseSource: person,
          })
        : {}),
  };
}

function shouldReplaceWithKinshipName(person: Person): boolean {
  const name = person.name?.trim() ?? '';
  if (!name || name === '친족') return true;
  if (name === '배우자' || /^배우자\s/.test(name)) return true;
  return false;
}

function applyKinshipTitlesToView(
  people: Record<PersonId, Person>,
  view: ActiveView,
  selfPeople?: Record<PersonId, Person>,
): Record<PersonId, Person> {
  if (!Object.keys(people).length) return people;
  const labels = buildViewKinshipLabels(view, people, selfPeople);
  if ((view === 'paternal' || view === 'maternal') && selfPeople) {
    const slots = slotIdsForView(view);
    const selfMe = selfPeople[slotIdsForView('self').selfId];
    const matched = selfMe
      ? Object.values(people).find(
          p =>
            p.name === selfMe.name && (p.birthDate ?? '') === (selfMe.birthDate ?? ''),
        )?.id
      : undefined;
    const userId = resolveUserBloodIdInView(view, selfPeople, people) ?? matched;
    if (userId && people[userId]) {
      const fromUser = buildKinshipLabels(people, userId);
      for (const id of [
        slots.father,
        slots.mother,
        slots.gf,
        slots.gm,
        slots.mgf,
        slots.mgm,
        slots.ggf,
        slots.ggm,
        slots.mggf,
        slots.mggm,
      ]) {
        if (fromUser[id]) labels[id] = fromUser[id];
      }
    }
  }
  const out = { ...people };
  for (const [id, person] of Object.entries(people)) {
    if (!shouldReplaceWithKinshipName(person)) continue;
    const label = labels[id];
    if (!label || label === '친족') continue;
    out[id] = { ...person, name: kinshipLabelToDisplayName(label, person) };
  }
  return out;
}

/**
 * sourceView의 focalPersonId를 기준으로 나/친가/외가/배우자 보기를 재구성한 PedigreeStore.
 */
export function rebaseStoreAroundPerson(
  store: PedigreeStore,
  focalPersonId: PersonId,
  sourceView: ActiveView = store.activeView,
): PedigreeStore {
  const { people: sourcePeople, resolveId } = flattenStoreToCanonical(store);
  const focalId = resolveId(sourceView, focalPersonId);
  const focal = sourcePeople[focalId];
  if (!focal) {
    throw new Error('선택한 사람을 찾을 수 없습니다.');
  }

  const createdAt = nowIso();
  const role = classifyFocal(sourcePeople, focalId);

  let selfPeople: Record<PersonId, Person>;
  let lineage: {
    paternal: Record<PersonId, Person>;
    maternal: Record<PersonId, Person>;
    spouse: Record<PersonId, Person>;
  };

  if (role === 'inlaw') {
    const built = buildInLawRebasedViews(sourcePeople, focalId, sourceView, createdAt);
    selfPeople = built.self;
    lineage = buildLineageViewsAround(
      sourcePeople,
      focalId,
      sourceView,
      createdAt,
      focalId,
      built.spouse,
    );
  } else {
    selfPeople = buildBloodCenteredView(sourcePeople, focalId, 'me', sourceView, createdAt, {
      keepFocalId: focalId,
    });
    lineage = buildLineageViewsAround(sourcePeople, focalId, sourceView, createdAt, focalId);
  }

  selfPeople = applyKinshipTitlesToView(selfPeople, 'self');
  const paternal = applyKinshipTitlesToView(lineage.paternal, 'paternal', selfPeople);
  const maternal = applyKinshipTitlesToView(lineage.maternal, 'maternal', selfPeople);
  const spouse = applyKinshipTitlesToView(lineage.spouse, 'spouse', selfPeople);

  return {
    version: 2,
    activeView: 'self',
    views: {
      self: selfPeople,
      paternal,
      maternal,
      spouse,
    },
  };
}
