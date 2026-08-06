/**
 * 뷰 간 동기화 — **나 시점(self)이 기준**.
 * self → 친가/외가/배우자 집안으로만 필드를 복사한다. self는 syncAllViews에서 절대 수정하지 않는다.
 */

import type { ActiveView, PedigreeStore } from '../types/lineage';
import type { Person, PersonId } from '../types/pedigree';
import { mergeUserFieldsFromSource } from './personPersist';
import {
  sortIdsByBirth,
  buildChildOrdinalLabels,
  collectCoupleChildIds,
  isChildOfCouple,
} from './birthOrder';
import { buildKinshipLabels, childSpouseLabelFromParent, isSiblingBlood } from './kinship';
import { buildSiblingKinshipLabels, siblingSpouseLabel } from './siblingKinship';
import { SELF_SLOT_INDEX, slotIdsForView } from './standardTemplate';
import { nowIso } from './date';

type LineageFocalView = 'paternal' | 'maternal';

/** 친가/외가 본인(부·모) 부부 아래 자녀 슬롯 id — pat_c2_0, mat_c2_1 … */
function focalChildTargetId(view: LineageFocalView, index: number): PersonId {
  const prefix = view === 'paternal' ? 'pat' : 'mat';
  return `${prefix}_c${SELF_SLOT_INDEX}_${index}`;
}

/** 나 시점 — 부모 공통 자녀(형제 줄 + 같은 부모 링크 인물) */
function getSelfSiblingBloodIds(selfPeople: Record<PersonId, Person>): PersonId[] {
  const me = slotIdsForView('self');
  const father = selfPeople[me.father];
  const mother = selfPeople[me.mother];
  if (!father || !mother) return [];

  return sortIdsByBirth(
    collectCoupleChildren(selfPeople, father.id, mother.id),
    selfPeople,
  );
}

function focalCoupleParentIds(
  view: LineageFocalView,
  slots: ReturnType<typeof slotIdsForView>,
): { fatherId: PersonId; motherId: PersonId } {
  if (view === 'paternal') {
    return { fatherId: slots.selfId, motherId: slots.spouseId };
  }
  return { fatherId: slots.spouseId, motherId: slots.selfId };
}

/**
 * 나 시점 형제(나 포함) → 친가/외가 본인 부부의 자녀 줄.
 * 슬롯이 부족하면 pat_c2_2, pat_c2_3 … 노드를 생성한다.
 */
function syncFocalChildrenFromSelf(
  selfPeople: Record<PersonId, Person>,
  targetPeople: Record<PersonId, Person>,
  view: LineageFocalView,
): void {
  const slots = slotIdsForView(view);
  const { fatherId, motherId } = focalCoupleParentIds(view, slots);
  const siblingIds = getSelfSiblingBloodIds(selfPeople);
  if (!siblingIds.length) return;

  const syncedTargetIds = new Set<PersonId>();

  siblingIds.forEach((selfBloodId, index) => {
    const source = selfPeople[selfBloodId];
    if (!source) return;

    const targetId = focalChildTargetId(view, index);
    syncedTargetIds.add(targetId);

    const existing = targetPeople[targetId];
    const base: Person = existing ?? {
      id: targetId,
      name: source.name || '친족',
      createdAt: source.createdAt || nowIso(),
      gender: source.gender ?? 'unknown',
      fatherId,
      motherId,
    };

    targetPeople[targetId] = applyFieldsFromSource(source, {
      ...base,
      fatherId,
      motherId,
    });
  });

  // 이전에 만들어 둔 초과 자녀 슬롯(+자손) 정리
  const focalChildIdRe = new RegExp(
    `^${view === 'paternal' ? 'pat' : 'mat'}_c${SELF_SLOT_INDEX}_\\d+$`,
  );
  for (const id of Object.keys(targetPeople)) {
    if (!focalChildIdRe.test(id) || syncedTargetIds.has(id)) continue;
    const p = targetPeople[id];
    if (!p || !isChildOfCouple(p, fatherId, motherId)) continue;
    deletePersonSubtree(targetPeople, id);
  }
}

/** 친가/외가 자녀 줄 편집 → 나 시점 형제 줄 */
function propagateFocalChildrenToSelfSiblings(
  selfPeople: Record<PersonId, Person>,
  editedPeople: Record<PersonId, Person>,
  view: LineageFocalView,
): void {
  const me = slotIdsForView('self');
  const slots = slotIdsForView(view);
  const { fatherId, motherId } = focalCoupleParentIds(view, slots);

  const lineageChildIds = sortIdsByBirth(
    collectCoupleChildren(editedPeople, fatherId, motherId),
    editedPeople,
  );
  const selfSiblingIds = getSelfSiblingBloodIds(selfPeople);
  const count = Math.min(lineageChildIds.length, selfSiblingIds.length);

  for (let i = 0; i < count; i += 1) {
    const lineageChild = editedPeople[lineageChildIds[i]];
    const selfId = selfSiblingIds[i];
    if (lineageChild && selfId && selfPeople[selfId]) {
      selfPeople[selfId] = mergeUserFieldsFromSource(lineageChild, selfPeople[selfId]);
    }
  }
}

/** @deprecated 내부 호환 — mergeUserFieldsFromSource 사용 */
function applyFieldsFromSource(source: Person, target: Person): Person {
  return mergeUserFieldsFromSource(source, target);
}

function copyMappedFields(
  selfPeople: Record<PersonId, Person>,
  targetPeople: Record<PersonId, Person>,
  pairs: Array<[PersonId, PersonId]>,
): void {
  for (const [selfId, targetId] of pairs) {
    const source = selfPeople[selfId];
    const target = targetPeople[targetId];
    if (!source || !target) continue;
    targetPeople[targetId] = applyFieldsFromSource(source, target);
  }
}

/** source가 있으면 target 슬롯을 만들고(또는 갱신하고) 필드를 복사 */
function copyMappedFieldsCreate(
  sourcePeople: Record<PersonId, Person>,
  targetPeople: Record<PersonId, Person>,
  pairs: Array<[PersonId, PersonId]>,
  link?: { childId: PersonId; as: 'father' | 'mother' },
): void {
  for (const [sourceId, targetId] of pairs) {
    const source = sourcePeople[sourceId];
    if (!source) continue;
    const existing = targetPeople[targetId];
    const base: Person = existing ?? {
      id: targetId,
      name: source.name?.trim() ? source.name : '친족',
      createdAt: source.createdAt || nowIso(),
      gender: source.gender ?? 'unknown',
    };
    targetPeople[targetId] = {
      ...applyFieldsFromSource(source, base),
      id: targetId,
    };
    if (link && targetPeople[link.childId]) {
      const child = targetPeople[link.childId];
      targetPeople[link.childId] = {
        ...child,
        ...(link.as === 'father' ? { fatherId: targetId } : { motherId: targetId }),
      };
    }
  }
}

/** self ↔ 외가 — 외할머니(mgm) 옆 가지(형제·자손) id 대응 */
function buildSelfMaternalIdMap(): Map<PersonId, PersonId> {
  const me = slotIdsForView('self');
  const mat = slotIdsForView('maternal');
  const map = new Map<PersonId, PersonId>([
    [me.mother, mat.selfId],
    [me.father, mat.spouseId],
    [me.mgf, mat.father],
    [me.mgm, mat.mother],
    [mat.selfId, me.mother],
    [mat.spouseId, me.father],
    [mat.father, me.mgf],
    [mat.mother, me.mgm],
  ]);
  return map;
}

function mirrorPersonIdAcrossViews(
  id: PersonId,
  direction: 'selfToMaternal' | 'maternalToSelf',
  map: Map<PersonId, PersonId>,
): PersonId {
  const mapped = map.get(id);
  if (mapped) return mapped;
  if (direction === 'selfToMaternal') {
    if (id.startsWith('me_')) return id.replace(/^me_/, 'mat_');
    return `mat_x_${id}`;
  }
  if (id.startsWith('mat_')) return id.replace(/^mat_/, 'me_');
  return `me_x_${id}`;
}

/** 부모·혈연 id — me.mgm(인물) ↔ mat.mother, me.mgm(부모칸) ↔ mat.mgm */
function remapStructuralId(
  id: PersonId,
  direction: 'selfToMaternal' | 'maternalToSelf',
): PersonId {
  const me = slotIdsForView('self');
  const mat = slotIdsForView('maternal');
  if (direction === 'selfToMaternal') {
    if (id === me.mgf) return mat.mgf;
    if (id === me.mgm) return mat.mgm;
    if (id === me.mother) return mat.selfId;
    if (id === me.father) return mat.spouseId;
    return mirrorPersonIdAcrossViews(id, direction, buildSelfMaternalIdMap());
  }
  if (id === mat.mgf) return me.mgf;
  if (id === mat.mgm) return me.mgm;
  if (id === mat.mother) return me.mgm;
  if (id === mat.father) return me.mgf;
  if (id === mat.selfId) return me.mother;
  if (id === mat.spouseId) return me.father;
  return mirrorPersonIdAcrossViews(id, direction, buildSelfMaternalIdMap());
}

/** 부모 커플의 자녀(앵커 제외) + 자손 — 외할머니 형제·사촌 줄 동기화 */
function syncCoupleBranchTree(
  sourcePeople: Record<PersonId, Person>,
  targetPeople: Record<PersonId, Person>,
  sourceFatherId: PersonId,
  sourceMotherId: PersonId,
  excludeSourceIds: Set<PersonId>,
  direction: 'selfToMaternal' | 'maternalToSelf',
  templateSlotIds: Set<PersonId>,
): void {
  const idMap = buildSelfMaternalIdMap();
  const toCopy = new Set<PersonId>();
  const queue = collectCoupleChildren(sourcePeople, sourceFatherId, sourceMotherId).filter(
    id => !excludeSourceIds.has(id) && !templateSlotIds.has(id),
  );
  queue.forEach(id => toCopy.add(id));

  for (let i = 0; i < queue.length; i += 1) {
    const pid = queue[i];
    for (const p of Object.values(sourcePeople)) {
      if (templateSlotIds.has(p.id) || toCopy.has(p.id)) continue;
      if (p.fatherId === pid || p.motherId === pid) {
        toCopy.add(p.id);
        queue.push(p.id);
      }
    }
  }

  for (const srcId of toCopy) {
    const src = sourcePeople[srcId];
    if (!src) continue;
    const tgtId = mirrorPersonIdAcrossViews(srcId, direction, idMap);
    const existing = targetPeople[tgtId];
    const fatherId = src.fatherId ? remapStructuralId(src.fatherId, direction) : undefined;
    const motherId = src.motherId ? remapStructuralId(src.motherId, direction) : undefined;
    const spouseId =
      src.spouseId && sourcePeople[src.spouseId]
        ? mirrorPersonIdAcrossViews(src.spouseId, direction, idMap)
        : undefined;

    const base: Person = existing ?? {
      id: tgtId,
      name: src.name,
      gender: src.gender,
      createdAt: src.createdAt || nowIso(),
    };

    targetPeople[tgtId] = {
      ...base,
      ...mergeUserFieldsFromSource(src, base),
      id: tgtId,
      fatherId,
      motherId,
      spouseId: spouseId && targetPeople[spouseId] ? spouseId : base.spouseId,
    };
  }
}

function templateSlotIdSet(view: ActiveView): Set<PersonId> {
  const slots = slotIdsForView(view);
  const ids = new Set<PersonId>([
    slots.ggf,
    slots.ggm,
    slots.mggf,
    slots.mggm,
    slots.gf,
    slots.gm,
    slots.mgf,
    slots.mgm,
    slots.father,
    slots.mother,
    slots.selfId,
    slots.spouseId,
    ...slots.siblings.flatMap(s => [s.blood, s.spouse]),
    ...slots.children.flat(),
  ]);
  return ids;
}

/** 나 시점 — 외할머니(mgm) 옆 가지 → 외가보기 외할머니(mat.mother) 옆 가지 */
function syncMaternalSideBranchFromSelf(
  selfPeople: Record<PersonId, Person>,
  matPeople: Record<PersonId, Person>,
): void {
  const me = slotIdsForView('self');
  const mat = slotIdsForView('maternal');
  if (!selfPeople[me.mgf] || !selfPeople[me.mgm]) return;

  // self: (mgf, mgm) 자녀 중 어머니 제외 = 이모 줄 → mat: 외할머니(mat.mother) 형제 줄
  syncCoupleBranchTree(
    selfPeople,
    matPeople,
    me.mgf,
    me.mgm,
    new Set([me.mother, me.mgm]),
    'selfToMaternal',
    templateSlotIdSet('maternal'),
  );

  // mgm 본인 친형제(조부모 줄)도 동기화
  const mgm = selfPeople[me.mgm];
  if (mgm?.fatherId && mgm?.motherId) {
    syncCoupleBranchTree(
      selfPeople,
      matPeople,
      mgm.fatherId,
      mgm.motherId,
      new Set([me.mgm]),
      'selfToMaternal',
      templateSlotIdSet('maternal'),
    );
  }
}

function syncSelfSideBranchFromMaternal(
  selfPeople: Record<PersonId, Person>,
  matPeople: Record<PersonId, Person>,
): void {
  const mat = slotIdsForView('maternal');
  const matMother = matPeople[mat.mother];
  if (!matMother?.fatherId || !matMother?.motherId) return;

  syncCoupleBranchTree(
    matPeople,
    selfPeople,
    matMother.fatherId,
    matMother.motherId,
    new Set([mat.mother]),
    'maternalToSelf',
    templateSlotIdSet('self'),
  );

  const matMgm = matPeople[mat.mgm];
  if (matMgm?.fatherId && matMgm?.motherId) {
    syncCoupleBranchTree(
      matPeople,
      selfPeople,
      matMgm.fatherId,
      matMgm.motherId,
      new Set([mat.mgm]),
      'maternalToSelf',
      templateSlotIdSet('self'),
    );
  }
}

function collectCoupleChildren(
  people: Record<PersonId, Person>,
  bloodId: PersonId,
  spouseId?: PersonId,
): PersonId[] {
  return collectCoupleChildIds(people, bloodId, spouseId);
}

function coupleParentRoles(
  people: Record<PersonId, Person>,
  bloodId: PersonId,
  spouseId?: PersonId,
): { fatherId?: PersonId; motherId?: PersonId } {
  const blood = people[bloodId];
  const spouse = spouseId ? people[spouseId] : undefined;
  if (blood?.gender === 'female') {
    return { fatherId: spouseId, motherId: bloodId };
  }
  if (blood?.gender === 'male') {
    return { fatherId: bloodId, motherId: spouseId };
  }
  if (spouse?.gender === 'male') {
    return { fatherId: spouseId, motherId: bloodId };
  }
  if (spouse?.gender === 'female') {
    return { fatherId: bloodId, motherId: spouseId };
  }
  return { fatherId: bloodId, motherId: spouseId };
}

function deletePersonSubtree(people: Record<PersonId, Person>, rootId: PersonId): void {
  const queue = [rootId];
  const toDelete = new Set<PersonId>();
  while (queue.length) {
    const id = queue.shift()!;
    if (toDelete.has(id)) continue;
    toDelete.add(id);
    const p = people[id];
    if (p?.spouseId) toDelete.add(p.spouseId);
    for (const child of Object.values(people)) {
      if (child.fatherId === id || child.motherId === id) queue.push(child.id);
    }
  }
  for (const id of toDelete) delete people[id];
}

/**
 * source 부모 부부 아래 자손을 target 부모 부부 아래로 인덱스 매핑 복사.
 * 자녀 id: `${targetParentId}_c${i}`, 배우자: `${childId}_sp`
 */
function syncMappedDescendantTree(
  sourcePeople: Record<PersonId, Person>,
  targetPeople: Record<PersonId, Person>,
  sourceParentId: PersonId,
  sourceSpouseId: PersonId | undefined,
  targetParentId: PersonId,
  targetSpouseId: PersonId | undefined,
): void {
  if (!sourcePeople[sourceParentId] || !targetPeople[targetParentId]) return;

  const kids = sortIdsByBirth(
    collectCoupleChildren(sourcePeople, sourceParentId, sourceSpouseId),
    sourcePeople,
  );
  const syncedKidIds = new Set<PersonId>();
  const { fatherId, motherId } = coupleParentRoles(targetPeople, targetParentId, targetSpouseId);

  kids.forEach((srcKidId, ki) => {
    const srcKid = sourcePeople[srcKidId];
    if (!srcKid) return;
    const tgtKidId = `${targetParentId}_c${ki}`;
    syncedKidIds.add(tgtKidId);

    const srcKidSpouseId =
      srcKid.spouseId && sourcePeople[srcKid.spouseId] ? srcKid.spouseId : undefined;
    let tgtKidSpouseId: PersonId | undefined;
    if (srcKidSpouseId) {
      tgtKidSpouseId = `${tgtKidId}_sp`;
      const srcSp = sourcePeople[srcKidSpouseId];
      const existingSp = targetPeople[tgtKidSpouseId];
      const spBase: Person = existingSp ?? {
        id: tgtKidSpouseId,
        name: srcSp.name?.trim() ? srcSp.name : '배우자',
        createdAt: srcSp.createdAt || nowIso(),
        gender: srcSp.gender ?? 'unknown',
        spouseId: tgtKidId,
      };
      targetPeople[tgtKidSpouseId] = {
        ...mergeUserFieldsFromSource(srcSp, spBase),
        id: tgtKidSpouseId,
        spouseId: tgtKidId,
      };
    }

    const existing = targetPeople[tgtKidId];
    const base: Person = existing ?? {
      id: tgtKidId,
      name: srcKid.name?.trim() ? srcKid.name : '친족',
      createdAt: srcKid.createdAt || nowIso(),
      gender: srcKid.gender ?? 'unknown',
    };
    targetPeople[tgtKidId] = {
      ...mergeUserFieldsFromSource(srcKid, base),
      id: tgtKidId,
      fatherId: fatherId && targetPeople[fatherId] ? fatherId : base.fatherId,
      motherId: motherId && targetPeople[motherId] ? motherId : base.motherId,
      spouseId: tgtKidSpouseId,
    };

    syncMappedDescendantTree(
      sourcePeople,
      targetPeople,
      srcKidId,
      srcKidSpouseId,
      tgtKidId,
      tgtKidSpouseId,
    );
  });

  const childPrefix = `${targetParentId}_c`;
  for (const id of Object.keys(targetPeople)) {
    if (!id.startsWith(childPrefix)) continue;
    const suffix = id.slice(targetParentId.length);
    if (!/^_c\d+$/.test(suffix)) continue;
    if (!syncedKidIds.has(id)) deletePersonSubtree(targetPeople, id);
  }
}

function ensureMappedSpouse(
  sourcePeople: Record<PersonId, Person>,
  targetPeople: Record<PersonId, Person>,
  sourceBloodId: PersonId,
  targetBloodId: PersonId,
): PersonId | undefined {
  const source = sourcePeople[sourceBloodId];
  const target = targetPeople[targetBloodId];
  if (!source || !target) return undefined;

  const srcSpouseId =
    source.spouseId && sourcePeople[source.spouseId] ? source.spouseId : undefined;
  if (!srcSpouseId) return target.spouseId && targetPeople[target.spouseId] ? target.spouseId : undefined;

  const srcSp = sourcePeople[srcSpouseId];
  let tgtSpouseId =
    target.spouseId && targetPeople[target.spouseId] ? target.spouseId : `${targetBloodId}_sp`;

  const existing = targetPeople[tgtSpouseId];
  const base: Person = existing ?? {
    id: tgtSpouseId,
    name: srcSp.name?.trim() ? srcSp.name : '배우자',
    createdAt: srcSp.createdAt || nowIso(),
    gender: srcSp.gender ?? 'unknown',
    spouseId: targetBloodId,
  };
  targetPeople[tgtSpouseId] = {
    ...mergeUserFieldsFromSource(srcSp, base),
    id: tgtSpouseId,
    spouseId: targetBloodId,
  };
  targetPeople[targetBloodId] = { ...targetPeople[targetBloodId], spouseId: tgtSpouseId };
  return tgtSpouseId;
}

/** 나 시점 형제(나 포함)의 배우자·자녀·손자… → 친가/외가 본인 부부 자녀 아래로 복사 */
function syncFocalDescendantsFromSelf(
  selfPeople: Record<PersonId, Person>,
  targetPeople: Record<PersonId, Person>,
  view: LineageFocalView,
): void {
  const siblingIds = getSelfSiblingBloodIds(selfPeople);
  siblingIds.forEach((selfBloodId, index) => {
    const targetId = focalChildTargetId(view, index);
    if (!selfPeople[selfBloodId] || !targetPeople[targetId]) return;

    const srcSpouseId =
      selfPeople[selfBloodId].spouseId && selfPeople[selfPeople[selfBloodId].spouseId!]
        ? selfPeople[selfBloodId].spouseId
        : undefined;
    const tgtSpouseId = ensureMappedSpouse(selfPeople, targetPeople, selfBloodId, targetId);

    syncMappedDescendantTree(
      selfPeople,
      targetPeople,
      selfBloodId,
      srcSpouseId,
      targetId,
      tgtSpouseId,
    );
  });
}

/**
 * lineage → self: 기존 자녀 슬롯을 출생순으로 매칭해 필드만 병합.
 * 없는 자녀만 `${selfParentId}_c${i}` 로 생성하며, self 쪽 초과 자녀는 삭제하지 않는다.
 */
function mergeDescendantTreeIntoSelf(
  lineagePeople: Record<PersonId, Person>,
  selfPeople: Record<PersonId, Person>,
  lineageParentId: PersonId,
  lineageSpouseId: PersonId | undefined,
  selfParentId: PersonId,
  selfSpouseId: PersonId | undefined,
): void {
  if (!lineagePeople[lineageParentId] || !selfPeople[selfParentId]) return;

  const srcKids = sortIdsByBirth(
    collectCoupleChildren(lineagePeople, lineageParentId, lineageSpouseId),
    lineagePeople,
  );
  const tgtKids = sortIdsByBirth(
    collectCoupleChildren(selfPeople, selfParentId, selfSpouseId),
    selfPeople,
  );
  const { fatherId, motherId } = coupleParentRoles(selfPeople, selfParentId, selfSpouseId);

  srcKids.forEach((srcKidId, ki) => {
    const srcKid = lineagePeople[srcKidId];
    if (!srcKid) return;

    let tgtKidId = tgtKids[ki];
    if (!tgtKidId || !selfPeople[tgtKidId]) {
      tgtKidId = `${selfParentId}_c${ki}`;
      if (
        selfPeople[tgtKidId] &&
        !isChildOfCouple(selfPeople[tgtKidId], selfParentId, selfSpouseId)
      ) {
        tgtKidId = `${selfParentId}_xc${ki}_${srcKidId}`;
      }
    }

    const srcKidSpouseId =
      srcKid.spouseId && lineagePeople[srcKid.spouseId] ? srcKid.spouseId : undefined;
    let tgtKidSpouseId =
      selfPeople[tgtKidId]?.spouseId && selfPeople[selfPeople[tgtKidId].spouseId!]
        ? selfPeople[tgtKidId].spouseId
        : undefined;
    if (srcKidSpouseId) {
      if (!tgtKidSpouseId) tgtKidSpouseId = `${tgtKidId}_sp`;
      const srcSp = lineagePeople[srcKidSpouseId];
      const existingSp = selfPeople[tgtKidSpouseId];
      const spBase: Person = existingSp ?? {
        id: tgtKidSpouseId,
        name: srcSp.name?.trim() ? srcSp.name : '배우자',
        createdAt: srcSp.createdAt || nowIso(),
        gender: srcSp.gender ?? 'unknown',
        spouseId: tgtKidId,
      };
      selfPeople[tgtKidSpouseId] = {
        ...mergeUserFieldsFromSource(srcSp, spBase),
        id: tgtKidSpouseId,
        spouseId: tgtKidId,
      };
    }

    const existing = selfPeople[tgtKidId];
    const base: Person = existing ?? {
      id: tgtKidId,
      name: srcKid.name?.trim() ? srcKid.name : '친족',
      createdAt: srcKid.createdAt || nowIso(),
      gender: srcKid.gender ?? 'unknown',
    };
    selfPeople[tgtKidId] = {
      ...mergeUserFieldsFromSource(srcKid, base),
      id: tgtKidId,
      fatherId: fatherId && selfPeople[fatherId] ? fatherId : base.fatherId,
      motherId: motherId && selfPeople[motherId] ? motherId : base.motherId,
      spouseId: tgtKidSpouseId ?? base.spouseId,
    };

    mergeDescendantTreeIntoSelf(
      lineagePeople,
      selfPeople,
      srcKidId,
      srcKidSpouseId,
      tgtKidId,
      tgtKidSpouseId,
    );
  });
}

/** 친가/외가 자녀 줄의 자손 편집 → 나 시점 형제 자손으로 반영 */
function propagateFocalDescendantsToSelf(
  selfPeople: Record<PersonId, Person>,
  editedPeople: Record<PersonId, Person>,
  view: LineageFocalView,
): void {
  const siblingIds = getSelfSiblingBloodIds(selfPeople);
  siblingIds.forEach((selfBloodId, index) => {
    const lineageId = focalChildTargetId(view, index);
    if (!selfPeople[selfBloodId] || !editedPeople[lineageId]) return;

    const lineageSpouseId =
      editedPeople[lineageId].spouseId && editedPeople[editedPeople[lineageId].spouseId!]
        ? editedPeople[lineageId].spouseId
        : undefined;
    const selfSpouseId =
      selfPeople[selfBloodId].spouseId && selfPeople[selfPeople[selfBloodId].spouseId!]
        ? selfPeople[selfBloodId].spouseId
        : ensureMappedSpouse(editedPeople, selfPeople, lineageId, selfBloodId);

    if (lineageSpouseId && selfSpouseId && editedPeople[lineageSpouseId] && selfPeople[selfSpouseId]) {
      selfPeople[selfSpouseId] = mergeUserFieldsFromSource(
        editedPeople[lineageSpouseId],
        selfPeople[selfSpouseId],
      );
    }

    mergeDescendantTreeIntoSelf(
      editedPeople,
      selfPeople,
      lineageId,
      lineageSpouseId,
      selfBloodId,
      selfSpouseId,
    );
  });
}

/** 친가보기 — 아버지가 "나" 자리. 나 시점 아버지·친가 쪽 조상 정보를 복사 */
function syncPaternalFromSelf(
  selfPeople: Record<PersonId, Person>,
  patPeople: Record<PersonId, Person>,
): void {
  const me = slotIdsForView('self');
  const pat = slotIdsForView('paternal');

  // 빈 뷰에서도 소스 있는 슬롯만 생성(재배치 후 템플릿 유령 방지)
  copyMappedFieldsCreate(selfPeople, patPeople, [
    [me.father, pat.selfId],
    [me.mother, pat.spouseId],
    [me.gf, pat.father],
    [me.gm, pat.mother],
    [me.mgf, pat.mgf],
    [me.mgm, pat.mgm],
    [me.ggf, pat.gf],
    [me.ggm, pat.gm],
  ]);
  if (patPeople[pat.selfId] && patPeople[pat.spouseId]) {
    patPeople[pat.selfId] = { ...patPeople[pat.selfId], spouseId: pat.spouseId };
    patPeople[pat.spouseId] = { ...patPeople[pat.spouseId], spouseId: pat.selfId };
  }

  syncFocalChildrenFromSelf(selfPeople, patPeople, 'paternal');
  syncFocalDescendantsFromSelf(selfPeople, patPeople, 'paternal');
}

/** 외가보기 — 어머니가 "나" 자리 */
function syncMaternalFromSelf(
  selfPeople: Record<PersonId, Person>,
  matPeople: Record<PersonId, Person>,
): void {
  const me = slotIdsForView('self');
  const mat = slotIdsForView('maternal');

  copyMappedFieldsCreate(selfPeople, matPeople, [
    [me.mother, mat.selfId],
    [me.father, mat.spouseId],
    [me.mgf, mat.father],
    [me.mgm, mat.mother],
    [me.mggf, mat.gf],
    [me.mggm, mat.gm],
  ]);
  if (matPeople[mat.selfId] && matPeople[mat.spouseId]) {
    matPeople[mat.selfId] = { ...matPeople[mat.selfId], spouseId: mat.spouseId };
    matPeople[mat.spouseId] = { ...matPeople[mat.spouseId], spouseId: mat.selfId };
  }

  syncFocalChildrenFromSelf(selfPeople, matPeople, 'maternal');
  syncFocalDescendantsFromSelf(selfPeople, matPeople, 'maternal');
  syncMaternalSideBranchFromSelf(selfPeople, matPeople);
}

/** 배우자 집안 — 배우자가 "나" 자리, 나는 배우자 옆 */
function syncSpouseFromSelf(
  selfPeople: Record<PersonId, Person>,
  spoPeople: Record<PersonId, Person>,
): void {
  const me = slotIdsForView('self');
  const spo = slotIdsForView('spouse');

  copyMappedFieldsCreate(selfPeople, spoPeople, [
    [me.spouseId, spo.selfId],
    [me.selfId, spo.spouseId],
  ]);
  if (spoPeople[spo.selfId] && spoPeople[spo.spouseId]) {
    spoPeople[spo.selfId] = { ...spoPeople[spo.selfId], spouseId: spo.spouseId };
    spoPeople[spo.spouseId] = { ...spoPeople[spo.spouseId], spouseId: spo.selfId };
  }

  const focal = selfPeople[me.selfId];
  if (!focal) return;

  const spouseId = focal.spouseId && selfPeople[focal.spouseId] ? focal.spouseId : undefined;
  const selfChildIds = sortIdsByBirth(
    collectCoupleChildren(selfPeople, me.selfId, spouseId),
    selfPeople,
  );
  const spoChildSlots = spo.children[SELF_SLOT_INDEX] ?? [];
  for (let i = 0; i < selfChildIds.length; i += 1) {
    const sourceId = selfChildIds[i];
    const source = selfPeople[sourceId];
    const targetId = spoChildSlots[i];
    const target = targetId ? spoPeople[targetId] : undefined;
    if (!source || !target || !targetId) continue;
    spoPeople[targetId] = applyFieldsFromSource(source, target);

    const srcSpouseId =
      source.spouseId && selfPeople[source.spouseId] ? source.spouseId : undefined;
    const tgtSpouseId = ensureMappedSpouse(selfPeople, spoPeople, sourceId, targetId);
    syncMappedDescendantTree(
      selfPeople,
      spoPeople,
      sourceId,
      srcSpouseId,
      targetId,
      tgtSpouseId,
    );
  }
}

/** self 기준 → 다른 뷰만 갱신. self는 변경하지 않음 */
export function syncAllViews(store: PedigreeStore): PedigreeStore {
  const selfPeople = { ...store.views.self };
  const paternal = { ...store.views.paternal };
  const maternal = { ...store.views.maternal };
  const spouse = { ...store.views.spouse };

  syncPaternalFromSelf(selfPeople, paternal);
  syncMaternalFromSelf(selfPeople, maternal);
  syncSpouseFromSelf(selfPeople, spouse);

  return {
    ...store,
    views: {
      self: selfPeople,
      paternal,
      maternal,
      spouse,
    },
  };
}

/** 친가/외가/배우자에서 편집 시 → 대응 self 슬롯에 반영 */
const LINEAGE_TO_SELF: Partial<Record<ActiveView, Array<[PersonId, PersonId]>>> = (() => {
  const me = slotIdsForView('self');
  const pat = slotIdsForView('paternal');
  const mat = slotIdsForView('maternal');
  const spo = slotIdsForView('spouse');

  return {
    paternal: [
      [pat.selfId, me.father],
      [pat.spouseId, me.mother],
      [pat.father, me.gf],
      [pat.mother, me.gm],
      [pat.gf, me.ggf],
      [pat.gm, me.ggm],
      [pat.mgf, me.mgf],
      [pat.mgm, me.mgm],
    ],
    maternal: [
      [mat.selfId, me.mother],
      [mat.spouseId, me.father],
      [mat.father, me.mgf],
      [mat.mother, me.mgm],
      [mat.gf, me.mggf],
      [mat.gm, me.mggm],
    ],
    spouse: [
      [spo.selfId, me.spouseId],
      [spo.spouseId, me.selfId],
    ],
  };
})();

function propagateLineageEditToSelf(
  views: Record<ActiveView, Record<PersonId, Person>>,
  editedView: ActiveView,
): void {
  const me = slotIdsForView('self');
  const selfPeople = views.self;
  const editedPeople = views[editedView];

  const staticPairs = LINEAGE_TO_SELF[editedView] ?? [];

  for (const [lineageId, selfId] of staticPairs) {
    const edited = editedPeople[lineageId];
    if (!edited) continue;
    const selfTarget = selfPeople[selfId];
    if (selfTarget) {
      selfPeople[selfId] = applyFieldsFromSource(edited, selfTarget);
      continue;
    }
    // 증조 슬롯은 템플릿에 노드가 없을 수 있음 → 친가/외가 편집 시 self에 생성
    if (
      selfId === me.ggf ||
      selfId === me.ggm ||
      selfId === me.mggf ||
      selfId === me.mggm
    ) {
      selfPeople[selfId] = {
        ...applyFieldsFromSource(edited, {
          id: selfId,
          name: edited.name?.trim() ? edited.name : '친족',
          createdAt: edited.createdAt || nowIso(),
          gender: edited.gender ?? 'unknown',
        }),
        id: selfId,
      };
      const bloodChildId =
        selfId === me.ggf || selfId === me.ggm ? me.gf : me.mgf;
      const bloodChild = selfPeople[bloodChildId];
      if (bloodChild) {
        const asFather = selfId === me.ggf || selfId === me.mggf;
        selfPeople[bloodChildId] = {
          ...bloodChild,
          ...(asFather ? { fatherId: selfId } : { motherId: selfId }),
        };
      }
    }
  }

  if (editedView === 'paternal') {
    propagateFocalChildrenToSelfSiblings(selfPeople, editedPeople, 'paternal');
    propagateFocalDescendantsToSelf(selfPeople, editedPeople, 'paternal');
  }
  if (editedView === 'maternal') {
    propagateFocalChildrenToSelfSiblings(selfPeople, editedPeople, 'maternal');
    propagateFocalDescendantsToSelf(selfPeople, editedPeople, 'maternal');
    syncSelfSideBranchFromMaternal(selfPeople, editedPeople);
  }

  if (editedView === 'spouse') {
    const spo = slotIdsForView('spouse');
    const focal = selfPeople[me.selfId];
    if (!focal) return;
    const spouseId = focal.spouseId && selfPeople[focal.spouseId] ? focal.spouseId : undefined;
    const selfChildIds = sortIdsByBirth(
      collectCoupleChildren(selfPeople, me.selfId, spouseId),
      selfPeople,
    );
    const spoChildSlots = spo.children[SELF_SLOT_INDEX] ?? [];
    for (let i = 0; i < spoChildSlots.length; i += 1) {
      const spoChildId = spoChildSlots[i];
      const spoChild = editedPeople[spoChildId];
      const selfChildId = selfChildIds[i];
      if (spoChild && selfChildId && selfPeople[selfChildId]) {
        selfPeople[selfChildId] = applyFieldsFromSource(spoChild, selfPeople[selfChildId]);
        const spoSpouseId =
          spoChild.spouseId && editedPeople[spoChild.spouseId] ? spoChild.spouseId : undefined;
        const selfChildSpouseId =
          selfPeople[selfChildId].spouseId && selfPeople[selfPeople[selfChildId].spouseId!]
            ? selfPeople[selfChildId].spouseId
            : ensureMappedSpouse(editedPeople, selfPeople, spoChildId, selfChildId);
        mergeDescendantTreeIntoSelf(
          editedPeople,
          selfPeople,
          spoChildId,
          spoSpouseId,
          selfChildId,
          selfChildSpouseId,
        );
      }
    }
  }
}

export function syncStoreAfterEdit(
  store: PedigreeStore,
  editedView: ActiveView,
  nextViewPeople: Record<PersonId, Person>,
): PedigreeStore {
  const views: Record<ActiveView, Record<PersonId, Person>> = {
    ...store.views,
    [editedView]: nextViewPeople,
  };

  if (editedView !== 'self') {
    propagateLineageEditToSelf(views, editedView);
  }

  return syncAllViews({ ...store, views });
}

/** 친가/외가·배우자 집안에서 실제 "나"(self 뷰 본인)에 해당하는 blood id */
export function resolveUserBloodIdInView(
  view: ActiveView,
  selfPeople: Record<PersonId, Person>,
  viewPeople: Record<PersonId, Person>,
): PersonId | null {
  const me = slotIdsForView('self');
  if (view === 'self') return me.selfId;

  if (view === 'spouse') {
    const spo = slotIdsForView('spouse');
    return viewPeople[spo.spouseId] ? spo.spouseId : null;
  }

  if (view === 'paternal' || view === 'maternal') {
    const siblingIds = getSelfSiblingBloodIds(selfPeople);
    const userIndex = siblingIds.indexOf(me.selfId);
    if (userIndex < 0) return null;
    const targetId = focalChildTargetId(view, userIndex);
    return viewPeople[targetId] ? targetId : null;
  }

  return null;
}

export type SiblingAddTarget = 'blood' | 'couple_child';

export type SiblingAddResolution = {
  fatherId?: PersonId;
  motherId?: PersonId;
  /** couple_child → 부모 부부의 자녀(형제 줄), blood → 선택 인물과 같은 부모 */
  target: SiblingAddTarget;
};

/** 친가/외가 — 형제 추가 허용 노드 (조부모·부모 줄만, 형제 줄은 제외) */
export function canAddSiblingFromNode(view: ActiveView, ofId: PersonId): boolean {
  if (view === 'self' || view === 'spouse') return true;
  if (view !== 'paternal' && view !== 'maternal') return true;
  const slots = slotIdsForView(view);
  const allowed = new Set<PersonId>([
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
  ]);
  return allowed.has(ofId);
}

export type ParentAddResolution =
  | {
      status: 'ok';
      /** 생성·갱신할 부모 id (증조 슬롯 또는 신규 id) */
      parentId: PersonId;
      /** fatherId/motherId를 걸 자녀 (조부모 부부면 혈연 조부) */
      linkChildId: PersonId;
      /** 반대쪽 부모 슬롯/id (배우자 연결용, 노드가 있을 때만 연결) */
      otherParentId?: PersonId;
      /** true면 parentId를 모달 id 대신 슬롯 id로 씀 */
      useSlotId: boolean;
    }
  | { status: 'exists'; parentId: PersonId };

/**
 * 부모 추가 시 슬롯·링크 대상 결정.
 * 친/외 조부모 카드 → 증조(ggf/ggm·mggf/mggm) 슬롯을 채운다.
 */
export function resolveParentAdd(
  view: ActiveView,
  people: Record<PersonId, Person>,
  childId: PersonId,
  parentType: 'father' | 'mother',
  newPersonId: PersonId,
): ParentAddResolution | null {
  const slots = slotIdsForView(view);
  if (!people[childId]) return null;

  let linkChildId = childId;
  let slotFather: PersonId | undefined;
  let slotMother: PersonId | undefined;

  if (childId === slots.gf || childId === slots.gm) {
    linkChildId = slots.gf;
    slotFather = slots.ggf;
    slotMother = slots.ggm;
  } else if (childId === slots.mgf || childId === slots.mgm) {
    linkChildId = slots.mgf;
    slotFather = slots.mggf;
    slotMother = slots.mggm;
  }

  const linkChild = people[linkChildId];
  if (!linkChild) return null;

  const existingId = parentType === 'father' ? linkChild.fatherId : linkChild.motherId;
  if (existingId && people[existingId]) {
    return { status: 'exists', parentId: existingId };
  }

  if (slotFather && slotMother) {
    const parentId = parentType === 'father' ? slotFather : slotMother;
    const otherParentId = parentType === 'father' ? slotMother : slotFather;
    return {
      status: 'ok',
      parentId: existingId && (existingId === slotFather || existingId === slotMother)
        ? existingId
        : parentId,
      linkChildId,
      otherParentId,
      useSlotId: true,
    };
  }

  // 이미 템플릿 링크된 부모 슬롯(예: 아버지→친할아버지)이 비어 있으면 그 슬롯 사용
  if (existingId && !people[existingId]) {
    const otherParentId =
      parentType === 'father' ? linkChild.motherId : linkChild.fatherId;
    return {
      status: 'ok',
      parentId: existingId,
      linkChildId,
      otherParentId,
      useSlotId: true,
    };
  }

  return {
    status: 'ok',
    parentId: newPersonId,
    linkChildId,
    otherParentId: parentType === 'father' ? linkChild.motherId : linkChild.fatherId,
    useSlotId: false,
  };
}

/**
 * 형제 추가 시 부모·대상 줄 결정.
 * - 부모 줄 칭할아버지·칭할머니: 각각 친형제 → 왼/오른쪽
 * - 조부모·외조부모: 각 카드의 친형제 → 해당 조부모 옆(좌/우)
 */
export function resolveSiblingAdd(
  view: ActiveView,
  people: Record<PersonId, Person>,
  ofId: PersonId,
): SiblingAddResolution | null {
  const slots = slotIdsForView(view);
  const person = people[ofId];
  if (!person) return null;

  if (view === 'paternal' || view === 'maternal') {
    if (ofId === slots.father || ofId === slots.mother) {
      if (!person.fatherId || !person.motherId) return null;
      return {
        fatherId: person.fatherId,
        motherId: person.motherId,
        target: 'blood',
      };
    }
    if (
      ofId === slots.gf ||
      ofId === slots.gm ||
      ofId === slots.mgf ||
      ofId === slots.mgm ||
      ofId === slots.ggf ||
      ofId === slots.ggm ||
      ofId === slots.mggf ||
      ofId === slots.mggm
    ) {
      if (!person.fatherId || !person.motherId) return null;
      return {
        fatherId: person.fatherId,
        motherId: person.motherId,
        target: 'blood',
      };
    }
    return null;
  }

  return {
    fatherId: person.fatherId,
    motherId: person.motherId,
    target: 'blood',
  };
}

/** @deprecated resolveSiblingAdd 사용 */
export function resolveSiblingParentIds(
  view: ActiveView,
  people: Record<PersonId, Person>,
  ofId: PersonId,
): { fatherId?: PersonId; motherId?: PersonId } {
  const resolved = resolveSiblingAdd(view, people, ofId);
  if (!resolved) return {};
  return { fatherId: resolved.fatherId, motherId: resolved.motherId };
}

/** 아버지·어머니(형제 줄) 자녀일 때만 템플릿 형제 슬롯 사용 */
export function nextEmptySiblingSlotId(
  view: ActiveView,
  people: Record<PersonId, Person>,
  resolution: SiblingAddResolution | { fatherId?: PersonId; motherId?: PersonId },
): PersonId | null {
  const slots = slotIdsForView(view);
  if ('target' in resolution && resolution.target !== 'couple_child') {
    return null;
  }
  const parents = resolution;
  if (parents.fatherId !== slots.father || parents.motherId !== slots.mother) {
    return null;
  }
  const focalSlot = SELF_SLOT_INDEX;
  const order =
    view === 'paternal' || view === 'maternal'
      ? [0, 1, 3, 4, focalSlot]
      : [0, 1, 2, 3, 4];

  for (const i of order) {
    const id = slots.siblings[i]?.blood;
    if (id && !people[id]) return id;
  }
  return null;
}

function getFocalChildBloodIds(
  view: LineageFocalView,
  peopleById: Record<PersonId, Person>,
): PersonId[] {
  const slots = slotIdsForView(view);
  const { fatherId, motherId } = focalCoupleParentIds(view, slots);
  return sortIdsByBirth(
    collectCoupleChildren(peopleById, fatherId, motherId),
    peopleById,
  );
}

/** 친가·외가 — 시점 인물(아버지/어머니) 기준 호적명 */
function applyLineageFocalKinshipLabels(
  view: LineageFocalView,
  peopleById: Record<PersonId, Person>,
  focalId: PersonId,
  slots: ReturnType<typeof slotIdsForView>,
  labels: Record<PersonId, string>,
  selfPeopleById?: Record<PersonId, Person>,
): void {
  const focal = peopleById[focalId];
  if (!focal) return;

  labels[focalId] = '본인';

  if (focal.spouseId && peopleById[focal.spouseId]) {
    labels[focal.spouseId] = '배우자';
  }

  const siblingBloodIds = slots.siblings
    .map(s => s.blood)
    .filter(id => id && id !== focalId && peopleById[id]);
  Object.assign(labels, buildSiblingKinshipLabels(peopleById, focalId, siblingBloodIds));

  for (const sib of slots.siblings) {
    if (sib.blood === focalId) continue;
    const blood = peopleById[sib.blood];
    if (!blood?.spouseId || !peopleById[blood.spouseId]) continue;
    if (isSiblingBlood(focal, blood)) {
      labels[blood.spouseId] = siblingSpouseLabel(focal, blood);
    }
  }

  const userBloodId = selfPeopleById
    ? resolveUserBloodIdInView(view, selfPeopleById, peopleById)
    : null;
  const focalChildren = getFocalChildBloodIds(view, peopleById);
  for (const childId of focalChildren) {
    labels[childId] = childId === userBloodId ? '본인' : '자식';
    const child = peopleById[childId];
    if (child?.spouseId && peopleById[child.spouseId]) {
      labels[child.spouseId] = childSpouseLabelFromParent(child);
    }
  }
}

export function buildViewKinshipLabels(
  view: ActiveView,
  peopleById: Record<PersonId, Person>,
  selfPeopleById?: Record<PersonId, Person>,
): Record<PersonId, string> {
  const slots = slotIdsForView(view);
  const focalId = slots.selfId;
  const selfRef = selfPeopleById ?? (view === 'self' ? peopleById : undefined);

  const labels = buildKinshipLabels(peopleById, focalId);

  if (view === 'paternal' || view === 'maternal') {
    applyLineageFocalKinshipLabels(view, peopleById, focalId, slots, labels, selfRef);
  } else {
    const siblingBloodIds = slots.siblings.map(s => s.blood).filter(id => peopleById[id]);
    Object.assign(labels, buildSiblingKinshipLabels(peopleById, focalId, siblingBloodIds));
  }

  if (view === 'spouse') {
    const meId = slots.spouseId;
    if (meId && peopleById[meId]) labels[meId] = '본인';
    if (focalId && peopleById[focalId]) labels[focalId] = '배우자';
  }

  return labels;
}

export function buildViewOrdinalLabels(
  view: ActiveView,
  peopleById: Record<PersonId, Person>,
): Record<PersonId, string> {
  const slots = slotIdsForView(view);
  const parentPairs: Array<{ bloodId: PersonId; spouseId?: PersonId }> = [];
  for (const sib of slots.siblings) {
    const blood = peopleById[sib.blood];
    if (!blood) continue;
    parentPairs.push({
      bloodId: sib.blood,
      spouseId: blood.spouseId && peopleById[blood.spouseId] ? blood.spouseId : undefined,
    });
  }
  return buildChildOrdinalLabels(peopleById, parentPairs);
}
