/**
 * 선택한 인물을 "나"(me_sib2)로 두고 족보를 호적 구조로 재구성한다.
 * - 혈족: 부모·형제·자녀 중심
 * - 인척(매형·형수·배우자 등): 본인=나, 혈족 배우자=배우자, 원 형제는 배우자 집안으로
 * - 친가/외가 슬롯은 가능하면 self 인물로 해석한 뒤 재구성
 */

import type { ActiveView, PedigreeStore } from '../types/lineage';
import type { Person, PersonId } from '../types/pedigree';
import { collectCoupleChildIds, sortIdsByBirth } from './birthOrder';
import { nowIso } from './date';
import { mergeUserFieldsFromSource } from './personPersist';
import { SELF_SLOT_INDEX, slotIdsForView } from './standardTemplate';
import { syncAllViews } from './viewSync';

type ViewPrefix = 'me' | 'pat' | 'mat' | 'spo';

type FocalRole = 'blood' | 'inlaw';

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
    /^(큰아버지|큰어머니|고모|고모부|삼촌|숙모|이모|이모부)$/.test(name) ||
    /^(형의 아들|형의 딸|큰형의 아들|큰형의 딸|누나의 아들|누나의 딸|남동생의 아들|남동생의 딸)$/.test(
      name,
    ) ||
    /^(큰아버지의 아들|큰아버지의 딸|고모의 아들|고모의 딸|삼촌의 아들|삼촌의 딸|이모의 아들|이모의 딸)$/.test(
      name,
    ) ||
    /^(나의 아들|나의 딸)$/.test(name)
  );
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

  // 배우자 슬롯 → self 쪽 배우자
  if (focalPersonId.endsWith('_sp')) {
    const bloodLineageId = focalPersonId.replace(/_sp$/, '');
    const selfBlood = staticMap[bloodLineageId];
    if (selfBlood && selfPeople[selfBlood]?.spouseId) {
      const sp = selfPeople[selfBlood].spouseId!;
      if (selfPeople[sp]) return { view: 'self', personId: sp };
    }
    // 형제 줄 배우자: pat_sib1_sp 등 — 출생순 매핑은 아래에서 자녀로 처리
  }

  const childMatch = focalPersonId.match(
    /^(pat|mat)_c2_(\d+)(?:_sp)?$/,
  );
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

  // 형제 슬롯 pat_sibN / mat_sibN → self 부모의 형제(조부모 자녀)
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
      // 아버지 중심으로 슬롯 배치와 동일하진 않을 수 있어, 이름·id로 아버지 매칭 후 좌우
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

function assignSiblingSlotIndices(
  siblingIdsSorted: PersonId[],
  focalId: PersonId,
): Map<PersonId, number> {
  const focalPos = siblingIdsSorted.indexOf(focalId);
  const map = new Map<PersonId, number>();
  if (focalPos < 0) {
    map.set(focalId, SELF_SLOT_INDEX);
    return map;
  }

  map.set(focalId, SELF_SLOT_INDEX);
  const older = siblingIdsSorted.slice(0, focalPos).reverse();
  const younger = siblingIdsSorted.slice(focalPos + 1);

  older.forEach((id, i) => {
    map.set(id, i === 0 ? 1 : i === 1 ? 0 : -(i - 1));
  });
  younger.forEach((id, i) => {
    map.set(id, i === 0 ? 3 : i === 1 ? 4 : 5 + (i - 2));
  });

  return map;
}

function siblingBloodId(prefix: ViewPrefix, slotIndex: number): PersonId {
  if (slotIndex >= 0 && slotIndex <= 4) return `${prefix}_sib${slotIndex}`;
  if (slotIndex < 0) return `${prefix}_sib_extra_L${Math.abs(slotIndex)}`;
  return `${prefix}_sib_extra_R${slotIndex}`;
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
): void {
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
}

function placeIfSource(
  out: Record<PersonId, Person>,
  slotId: PersonId,
  source: Person | undefined,
  links: { fatherId?: PersonId; motherId?: PersonId; spouseId?: PersonId },
  createdAt: string,
): void {
  if (!source) return;
  ensurePerson(out, slotId, source, links, createdAt);
}

function filterSiblingPool(
  people: Record<PersonId, Person>,
  pool: PersonId[],
  focalId: PersonId,
  sourceView: ActiveView,
): PersonId[] {
  return pool.filter(id => {
    if (id === focalId) return true;
    const p = people[id];
    if (!p) return false;
    if (sourceView === 'self' || sourceView === 'spouse') return true;
    return !isUnusedTemplatePerson(p);
  });
}

/**
 * 혈족 초점을 prefix(me/spo) 슬롯으로 재구성.
 * 템플릿 유령 노드를 넣지 않고, 소스에 있는 인물만 배치한다.
 */
function buildBloodCenteredView(
  sourcePeople: Record<PersonId, Person>,
  bloodFocalId: PersonId,
  prefix: ViewPrefix,
  sourceView: ActiveView,
  createdAt: string,
  options?: {
    /** 초점의 배우자를 이 소스로 강제(인척 재배치 시 배우자 뷰용) */
    forceSpouseSource?: Person;
    forceSpouseIsFocal?: boolean;
  },
): Record<PersonId, Person> {
  const focal = sourcePeople[bloodFocalId];
  if (!focal) return {};

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

  const fatherSrc = focal.fatherId ? sourcePeople[focal.fatherId] : undefined;
  const motherSrc = focal.motherId ? sourcePeople[focal.motherId] : undefined;
  const spouseSrc =
    options?.forceSpouseSource ??
    (focal.spouseId && sourcePeople[focal.spouseId]
      ? sourcePeople[focal.spouseId]
      : undefined);

  const gfSrc = fatherSrc?.fatherId ? sourcePeople[fatherSrc.fatherId] : undefined;
  const gmSrc = fatherSrc?.motherId ? sourcePeople[fatherSrc.motherId] : undefined;
  const mgfSrc = motherSrc?.fatherId ? sourcePeople[motherSrc.fatherId] : undefined;
  const mgmSrc = motherSrc?.motherId ? sourcePeople[motherSrc.motherId] : undefined;
  const ggfSrc = gfSrc?.fatherId ? sourcePeople[gfSrc.fatherId] : undefined;
  const ggmSrc = gfSrc?.motherId ? sourcePeople[gfSrc.motherId] : undefined;
  const mggfSrc = mgfSrc?.fatherId ? sourcePeople[mgfSrc.fatherId] : undefined;
  const mggmSrc = mgfSrc?.motherId ? sourcePeople[mgfSrc.motherId] : undefined;

  placeIfSource(out, slots.ggf, ggfSrc, { spouseId: ggmSrc ? slots.ggm : undefined }, createdAt);
  placeIfSource(out, slots.ggm, ggmSrc, { spouseId: ggfSrc ? slots.ggf : undefined }, createdAt);
  placeIfSource(out, slots.mggf, mggfSrc, { spouseId: mggmSrc ? slots.mggm : undefined }, createdAt);
  placeIfSource(out, slots.mggm, mggmSrc, { spouseId: mggfSrc ? slots.mggf : undefined }, createdAt);

  placeIfSource(
    out,
    slots.gf,
    gfSrc,
    {
      spouseId: gmSrc ? slots.gm : undefined,
      fatherId: ggfSrc ? slots.ggf : undefined,
      motherId: ggmSrc ? slots.ggm : undefined,
    },
    createdAt,
  );
  placeIfSource(out, slots.gm, gmSrc, { spouseId: gfSrc ? slots.gf : undefined }, createdAt);
  placeIfSource(
    out,
    slots.mgf,
    mgfSrc,
    {
      spouseId: mgmSrc ? slots.mgm : undefined,
      fatherId: mggfSrc ? slots.mggf : undefined,
      motherId: mggmSrc ? slots.mggm : undefined,
    },
    createdAt,
  );
  placeIfSource(out, slots.mgm, mgmSrc, { spouseId: mgfSrc ? slots.mgf : undefined }, createdAt);

  placeIfSource(
    out,
    slots.father,
    fatherSrc,
    {
      spouseId: motherSrc ? slots.mother : undefined,
      fatherId: gfSrc ? slots.gf : undefined,
      motherId: gmSrc ? slots.gm : undefined,
    },
    createdAt,
  );
  placeIfSource(
    out,
    slots.mother,
    motherSrc,
    {
      spouseId: fatherSrc ? slots.father : undefined,
      fatherId: mgfSrc ? slots.mgf : undefined,
      motherId: mgmSrc ? slots.mgm : undefined,
    },
    createdAt,
  );

  let siblingPool =
    fatherSrc && motherSrc
      ? collectCoupleChildren(sourcePeople, fatherSrc.id, motherSrc.id)
      : fatherSrc || motherSrc
        ? collectCoupleChildren(sourcePeople, fatherSrc?.id, motherSrc?.id)
        : [bloodFocalId];

  if (!siblingPool.includes(bloodFocalId)) siblingPool.push(bloodFocalId);
  siblingPool = filterSiblingPool(sourcePeople, siblingPool, bloodFocalId, sourceView);
  if (!siblingPool.includes(bloodFocalId)) siblingPool.push(bloodFocalId);

  const siblingsSorted = sortIdsByBirth(siblingPool, sourcePeople);
  const slotIndexByOldId = assignSiblingSlotIndices(siblingsSorted, bloodFocalId);

  for (const oldBloodId of siblingsSorted) {
    const bloodSrc = sourcePeople[oldBloodId];
    if (!bloodSrc) continue;
    const slotIndex = slotIndexByOldId.get(oldBloodId) ?? SELF_SLOT_INDEX;
    const newBloodId = siblingBloodId(prefix, slotIndex);

    const isFocalBlood = oldBloodId === bloodFocalId;
    const spSrc = isFocalBlood
      ? spouseSrc
      : bloodSrc.spouseId && sourcePeople[bloodSrc.spouseId]
        ? sourcePeople[bloodSrc.spouseId]
        : undefined;
    const newSpouseId = spSrc ? siblingSpouseId(newBloodId) : undefined;

    ensurePerson(
      out,
      newBloodId,
      bloodSrc,
      {
        fatherId: fatherSrc ? slots.father : undefined,
        motherId: motherSrc ? slots.mother : undefined,
        spouseId: newSpouseId,
      },
      createdAt,
    );

    if (spSrc && newSpouseId) {
      ensurePerson(out, newSpouseId, spSrc, { spouseId: newBloodId }, createdAt);
    }

    const childIds = sortIdsByBirth(
      collectCoupleChildren(sourcePeople, bloodSrc.id, bloodSrc.spouseId),
      sourcePeople,
    );
    childIds.forEach((oldChildId, ci) => {
      const childSrc = sourcePeople[oldChildId];
      if (!childSrc) return;
      const newChildId = childIdForParentSlot(prefix, slotIndex, ci);
      const childSpouseSrc =
        childSrc.spouseId && sourcePeople[childSrc.spouseId]
          ? sourcePeople[childSrc.spouseId]
          : undefined;
      const newChildSpouseId = childSpouseSrc ? `${newChildId}_sp` : undefined;
      const fatherIsBlood =
        childSrc.fatherId === bloodSrc.id ||
        (!childSrc.fatherId && bloodSrc.gender !== 'female');

      ensurePerson(
        out,
        newChildId,
        childSrc,
        {
          fatherId: fatherIsBlood ? newBloodId : newSpouseId,
          motherId: fatherIsBlood ? newSpouseId : newBloodId,
          spouseId: newChildSpouseId,
        },
        createdAt,
      );

      if (childSpouseSrc && newChildSpouseId) {
        ensurePerson(out, newChildSpouseId, childSpouseSrc, { spouseId: newChildId }, createdAt);
      }

      const gcIds = sortIdsByBirth(
        collectCoupleChildren(sourcePeople, childSrc.id, childSrc.spouseId),
        sourcePeople,
      );
      gcIds.forEach((oldGcId, gi) => {
        const gcSrc = sourcePeople[oldGcId];
        if (!gcSrc) return;
        const newGcId = `${prefix}_gc_${slotIndex}_${ci}_${gi}`;
        const gcFatherIsChild =
          gcSrc.fatherId === childSrc.id ||
          (!gcSrc.fatherId && childSrc.gender !== 'female');
        ensurePerson(
          out,
          newGcId,
          gcSrc,
          {
            fatherId: gcFatherIsChild ? newChildId : newChildSpouseId,
            motherId: gcFatherIsChild ? newChildSpouseId : newChildId,
          },
          createdAt,
        );
      });
    });
  }

  // 인척 초점으로 이 뷰를 만들 때: 초점 본인이 배우자 슬롯이어야 하는 경우
  if (options?.forceSpouseIsFocal && spouseSrc) {
    // blood focal is center; spouse already set — no swap here
  }

  const meId = slots.selfId;
  if (out[meId] && focal.name?.trim()) {
    out[meId] = mergeUserFieldsFromSource(userFieldsFrom(focal, createdAt), {
      ...out[meId],
      id: meId,
    });
  }

  return out;
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

  // 인척 본인의 부모(있으면)만 self 쪽 부모로
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

  // 부부 자녀 → 나의 자녀
  const childIds = sortIdsByBirth(
    collectCoupleChildren(sourcePeople, inlawId, bloodId),
    sourcePeople,
  );
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

  // 혈족(누나 등) 중심 트리를 배우자 집안으로
  const spouse = buildBloodCenteredView(sourcePeople, bloodId, 'spo', sourceView, createdAt, {
    forceSpouseSource: inlaw,
  });

  return { self, spouse };
}

/**
 * sourceView의 focalPersonId를 기준으로 self(+필요 시 spouse) 뷰를 재구성한 PedigreeStore.
 */
export function rebaseStoreAroundPerson(
  store: PedigreeStore,
  focalPersonId: PersonId,
  sourceView: ActiveView = store.activeView,
): PedigreeStore {
  const resolved = resolveFocalToSelfView(store, sourceView, focalPersonId);
  const sourcePeople = store.views[resolved.view] ?? {};
  const focal = sourcePeople[resolved.personId];
  if (!focal) {
    throw new Error('선택한 사람을 찾을 수 없습니다.');
  }

  const createdAt = nowIso();
  const role = classifyFocal(sourcePeople, resolved.personId);

  let selfPeople: Record<PersonId, Person>;
  let spousePeople: Record<PersonId, Person> = {};

  if (role === 'inlaw') {
    const built = buildInLawRebasedViews(
      sourcePeople,
      resolved.personId,
      resolved.view,
      createdAt,
    );
    selfPeople = built.self;
    spousePeople = built.spouse;
  } else {
    selfPeople = buildBloodCenteredView(
      sourcePeople,
      resolved.personId,
      'me',
      resolved.view,
      createdAt,
    );
  }

  const next: PedigreeStore = {
    version: 2,
    activeView: 'self',
    views: {
      self: selfPeople,
      // 빈 뷰에서 sync가 실제 데이터만 채움(템플릿 유령 형제 방지)
      paternal: {},
      maternal: {},
      spouse: spousePeople,
    },
  };

  return syncAllViews(next);
}
