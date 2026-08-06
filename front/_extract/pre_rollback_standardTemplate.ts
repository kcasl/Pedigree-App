/**
 * SDD 참고 4세대 고정 포맷 템플릿
 *
 *  1세대 조부모    [친조부모] [외조부모]
 *  2세대 부모      [아버지]──[어머니]
 *  3세대 형제자매  [형]─[형수] [나]─[배우자] ...
 *  4세대 자녀      각 부부 아래 자녀
 *  5세대 손자      (self 뷰 기본 템플릿)
 *
 * 친가·외가·배우자 집안은 같은 슬롯 구조, 인물 데이터만 독립.
 */

import type { ActiveView } from '../types/lineage';
import type { GenderType, Person, PersonId } from '../types/pedigree';
import { nowIso } from './date';
import { mergeLegacyPersonIntoSlot, mergePersonWithTemplate } from './personPersist';

export const SELF_SLOT_INDEX = 2;
export const DEFAULT_SIBLING_SLOTS = 5;
export const DEFAULT_CHILDREN_PER_COUPLE = 2;

export type ViewPrefix = 'me' | 'pat' | 'mat' | 'spo';

export const VIEW_PREFIX: Record<ActiveView, ViewPrefix> = {
  self: 'me',
  paternal: 'pat',
  maternal: 'mat',
  spouse: 'spo',
};

export type TemplateSlotIds = {
  ggf: PersonId;
  ggm: PersonId;
  gf: PersonId;
  gm: PersonId;
  mgf: PersonId;
  mgm: PersonId;
  father: PersonId;
  mother: PersonId;
  siblings: Array<{ blood: PersonId; spouse: PersonId }>;
  children: PersonId[][];
  selfId: PersonId;
  spouseId: PersonId;
};

export function slotIdsForView(view: ActiveView): TemplateSlotIds {
  const p = VIEW_PREFIX[view];
  const siblings = [0, 1, 2, 3, 4].map(i => ({
    blood: `${p}_sib${i}`,
    spouse: `${p}_sib${i}_sp`,
  }));
  return {
    ggf: `${p}_ggf`,
    ggm: `${p}_ggm`,
    gf: `${p}_gf`,
    gm: `${p}_gm`,
    mgf: `${p}_mgf`,
    mgm: `${p}_mgm`,
    father: `${p}_father`,
    mother: `${p}_mother`,
    siblings,
    children: siblings.map((_, si) =>
      [0, 1].map(ci => `${p}_c${si}_${ci}`),
    ),
    selfId: `${p}_sib${SELF_SLOT_INDEX}`,
    spouseId: `${p}_sib${SELF_SLOT_INDEX}_sp`,
  };
}

/** 현재 시점에서 가운데(본인) 슬롯 — 뷰마다 다른 인물(나/아버지/어머니/배우자) */
export function focalBloodId(_view: ActiveView, slots: TemplateSlotIds): PersonId {
  return slots.selfId;
}

type DefaultNames = {
  ggf: string;
  ggm: string;
  gf: string;
  gm: string;
  mgf: string;
  mgm: string;
  father: string;
  mother: string;
  siblings: Array<{ blood: string; spouse: string; bloodGender: GenderType; spouseGender: GenderType }>;
  children: string[][];
};

const SELF_NAMES: DefaultNames = {
  ggf: '증조할아버지',
  ggm: '증조할머니',
  gf: '친할아버지',
  gm: '친할머니',
  mgf: '증조할아버지',
  mgm: '증조할머니',
  father: '아버지',
  mother: '어머니',
  siblings: [
    { blood: '형', spouse: '형수', bloodGender: 'male', spouseGender: 'female' },
    { blood: '큰형', spouse: '형수', bloodGender: 'male', spouseGender: 'female' },
    { blood: '나', spouse: '배우자', bloodGender: 'unknown', spouseGender: 'unknown' },
    { blood: '누나', spouse: '매형', bloodGender: 'female', spouseGender: 'male' },
    { blood: '남동생', spouse: '제수', bloodGender: 'male', spouseGender: 'female' },
  ],
  children: [
    ['형의 아들', '형의 딸'],
    ['큰형의 아들', '큰형의 딸'],
    ['나의 아들', '나의 딸'],
    ['누나의 아들', '누나의 딸'],
    ['남동생의 아들', '남동생의 딸'],
  ],
};

const PATERNAL_NAMES: DefaultNames = {
  ggf: '증조할아버지',
  ggm: '증조할머니',
  gf: '증조할아버지',
  gm: '증조할머니',
  mgf: '증조할아버지',
  mgm: '증조할머니',
  father: '친할아버지',
  mother: '친할머니',
  siblings: [
    { blood: '', spouse: '', bloodGender: 'unknown', spouseGender: 'unknown' },
    { blood: '큰아버지', spouse: '큰어머니', bloodGender: 'male', spouseGender: 'female' },
    { blood: '아버지', spouse: '어머니', bloodGender: 'male', spouseGender: 'female' },
    { blood: '고모', spouse: '고모부', bloodGender: 'female', spouseGender: 'male' },
    { blood: '', spouse: '', bloodGender: 'unknown', spouseGender: 'unknown' },
  ],
  children: [
    ['', ''],
    ['큰아버지의 아들', '큰아버지의 딸'],
    ['나의 아들', '나의 딸'],
    ['고모의 아들', '고모의 딸'],
    ['', ''],
  ],
};

const MATERNAL_NAMES: DefaultNames = {
  ggf: '증조할아버지',
  ggm: '증조할머니',
  gf: '증조할아버지',
  gm: '증조할머니',
  mgf: '외할아버지',
  mgm: '외할머니',
  father: '외할아버지',
  mother: '외할머니',
  siblings: [
    { blood: '', spouse: '', bloodGender: 'unknown', spouseGender: 'unknown' },
    { blood: '삼촌', spouse: '숙모', bloodGender: 'male', spouseGender: 'female' },
    { blood: '어머니', spouse: '아버지', bloodGender: 'female', spouseGender: 'male' },
    { blood: '이모', spouse: '이모부', bloodGender: 'female', spouseGender: 'male' },
    { blood: '', spouse: '', bloodGender: 'unknown', spouseGender: 'unknown' },
  ],
  children: [
    ['', ''],
    ['삼촌의 아들', '삼촌의 딸'],
    ['나의 아들', '나의 딸'],
    ['이모의 아들', '이모의 딸'],
    ['', ''],
  ],
};

const SPOUSE_NAMES: DefaultNames = {
  ggf: '배우자 증조할아버지',
  ggm: '배우자 증조할머니',
  gf: '배우자 할아버지',
  gm: '배우자 할머니',
  mgf: '배우자 외할아버지',
  mgm: '배우자 외할머니',
  father: '배우자 아버지',
  mother: '배우자 어머니',
  siblings: [
    { blood: '배우자 형', spouse: '형수', bloodGender: 'male', spouseGender: 'female' },
    { blood: '배우자 오빠', spouse: '오빠 부인', bloodGender: 'male', spouseGender: 'female' },
    { blood: '배우자', spouse: '나', bloodGender: 'unknown', spouseGender: 'unknown' },
    { blood: '배우자 누나', spouse: '매형', bloodGender: 'female', spouseGender: 'male' },
    { blood: '배우자 남동생', spouse: '제수', bloodGender: 'male', spouseGender: 'female' },
  ],
  children: [
    ['형의 아들', '형의 딸'],
    ['오빠의 아들', '오빠의 딸'],
    ['나의 아들', '나의 딸'],
    ['누나의 아들', '누나의 딸'],
    ['남동생의 아들', '남동생의 딸'],
  ],
};

const NAMES_BY_VIEW: Record<ActiveView, DefaultNames> = {
  self: SELF_NAMES,
  paternal: PATERNAL_NAMES,
  maternal: MATERNAL_NAMES,
  spouse: SPOUSE_NAMES,
};

/** 친가·외가 보기 등에 남아 있는 구 표기(외증조·고조)를 증조로 통일 */
export function normalizeGreatAncestorDisplayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return name;
  if (/^(?:외)?(?:고조|증조)할아버지$/.test(trimmed)) return '증조할아버지';
  if (/^(?:외)?(?:고조|증조)할머니$/.test(trimmed)) return '증조할머니';
  if (trimmed === '외증조할아버지') return '증조할아버지';
  if (trimmed === '외증조할머니') return '증조할머니';
  return name;
}

/** 증조할아버지·할머니 줄 노드 — 파스텔 회색 배경 대상 */
export function isGreatGrandparentNode(
  person?: Pick<Person, 'id' | 'name'>,
  view?: ActiveView,
): boolean {
  if (!person) return false;

  if (view === 'paternal') {
    const slots = slotIdsForView('paternal');
    if (
      person.id === slots.ggf ||
      person.id === slots.ggm ||
      person.id === slots.gf ||
      person.id === slots.gm ||
      person.id === slots.mgf ||
      person.id === slots.mgm
    ) {
      return true;
    }
  }

  if (/_ggf$/.test(person.id) || /_ggm$/.test(person.id)) return true;
  const normalized = normalizeGreatAncestorDisplayName(person.name);
  return normalized === '증조할아버지' || normalized === '증조할머니';
}

/** 뷰·슬롯에 맞는 카드 표시 이름 (동기화된 구 이름 보정) */
export function resolveNodeDisplayName(
  view: ActiveView | undefined,
  personId: PersonId,
  name: string,
): string {
  if (view === 'paternal') {
    const slots = slotIdsForView('paternal');
    if (personId === slots.mgf) return '증조할아버지';
    if (personId === slots.mgm) return '증조할머니';
  }
  return normalizeGreatAncestorDisplayName(name);
}

function person(
  id: PersonId,
  name: string,
  createdAt: string,
  gender: GenderType,
  extra: Partial<Person> = {},
): Person {
  return { id, name, createdAt, gender, ...extra };
}

export function createViewTemplate(
  view: ActiveView,
  createdAt: string = nowIso(),
): Record<PersonId, Person> {
  const slots = slotIdsForView(view);
  const names = NAMES_BY_VIEW[view];
  const out: Record<PersonId, Person> = {};

  // 증조는 기본 템플릿에 노드를 만들지 않음. 친할아버지에만 링크를 달아 추가 가능하게 함.
  out[slots.gf] = person(slots.gf, names.gf, createdAt, 'male', {
    spouseId: slots.gm,
    fatherId: slots.ggf,
    motherId: slots.ggm,
  });
  out[slots.gm] = person(slots.gm, names.gm, createdAt, 'female', {
    spouseId: slots.gf,
  });
  out[slots.mgf] = person(slots.mgf, names.mgf, createdAt, 'male', {
    spouseId: slots.mgm,
  });
  out[slots.mgm] = person(slots.mgm, names.mgm, createdAt, 'female', {
    spouseId: slots.mgf,
  });

  out[slots.father] = person(slots.father, names.father, createdAt, 'male', {
    spouseId: slots.mother,
    fatherId: slots.gf,
    motherId: slots.gm,
  });
  out[slots.mother] = person(slots.mother, names.mother, createdAt, 'female', {
    spouseId: slots.father,
    fatherId: slots.mgf,
    motherId: slots.mgm,
  });

  slots.siblings.forEach((pair, i) => {
    if ((view === 'paternal' || view === 'maternal') && (i === 0 || i === 4)) return;
    const sn = names.siblings[i];
    if (!sn?.blood) return;
    out[pair.blood] = person(pair.blood, sn.blood, createdAt, sn.bloodGender, {
      spouseId: pair.spouse,
      fatherId: slots.father,
      motherId: slots.mother,
    });
    out[pair.spouse] = person(pair.spouse, sn.spouse, createdAt, sn.spouseGender, {
      spouseId: pair.blood,
    });
  });

  slots.children.forEach((childIds, si) => {
    const blood = slots.siblings[si].blood;
    const sp = slots.siblings[si].spouse;
    if (!out[blood] || !out[sp]) return;
    const childNames = names.children[si];
    childIds.forEach((cid, ci) => {
      const childName = childNames[ci];
      if (!childName) return;
      const isMale = ci === 0;
      out[cid] = person(cid, childName, createdAt, isMale ? 'male' : 'female', {
        fatherId: blood,
        motherId: sp,
      });
    });
  });

  if (view === 'self') {
    // 5열 기본 손자 템플릿: 각 섹션(형제 라인)마다 1명씩
    slots.children.forEach((childIds, si) => {
      const parentChildId = childIds[0];
      if (!out[parentChildId]) return;
      const gcId = `${VIEW_PREFIX[view]}_gc${si}_0`;
      const gcName =
        si === SELF_SLOT_INDEX ? '나의 손자' : `${names.siblings[si].blood}의 손자`;
      const parentLink =
        out[parentChildId].gender === 'female'
          ? { motherId: parentChildId }
          : { fatherId: parentChildId };
      out[gcId] = person(gcId, gcName, createdAt, 'male', parentLink);
    });
  }

  return out;
}

/**
 * 저장된 뷰 데이터의 부모·형제 관계를 템플릿 구조에 맞게 복구한다.
 * 이름·사진 등 사용자 입력은 유지한다.
 */
export function reconcileViewTemplate(
  view: ActiveView,
  people: Record<PersonId, Person>,
): Record<PersonId, Person> {
  const fresh = createViewTemplate(view);
  const slots = slotIdsForView(view);
  const out: Record<PersonId, Person> = { ...people };
  const legacySelfRename: Record<PersonId, { from: string; to: string }> =
    view === 'self'
      ? {
          [slots.siblings[1].blood]: { from: '큰아버지', to: '큰형' },
          [slots.children[1][0]]: { from: '큰아버지의 아들', to: '큰형의 아들' },
          [slots.children[1][1]]: { from: '큰아버지의 딸', to: '큰형의 딸' },
        }
      : {};
  const forcedSiblingNames: Record<PersonId, string> =
    view === 'paternal'
      ? {
          [slots.siblings[1].blood]: '큰아버지',
          [slots.siblings[1].spouse]: '큰어머니',
          [slots.siblings[3].blood]: '고모',
          [slots.siblings[3].spouse]: '고모부',
        }
      : view === 'maternal'
        ? {
            [slots.siblings[1].blood]: '삼촌',
            [slots.siblings[1].spouse]: '숙모',
            [slots.siblings[3].blood]: '이모',
            [slots.siblings[3].spouse]: '이모부',
          }
        : {};

  for (const [id, template] of Object.entries(fresh)) {
    const existing = out[id];
    if (!existing) {
      out[id] = template;
      continue;
    }
    out[id] = mergePersonWithTemplate(template, existing, {
      id,
      fatherId: template.fatherId,
      motherId: template.motherId,
      spouseId: existing.spouseId ?? template.spouseId,
    }, {
      renameFrom: legacySelfRename[id]?.from,
      renameTo: legacySelfRename[id]?.to,
      kinshipName: forcedSiblingNames[id],
    });
  }

  if (view === 'paternal' || view === 'maternal') {
    const edgeIdx = [0, 4] as const;
    edgeIdx.forEach(i => {
      const pair = slots.siblings[i];
      if (out[pair.blood]) return;
      delete out[pair.blood];
      delete out[pair.spouse];
      const kids = slots.children[i] ?? [];
      kids.forEach(cid => delete out[cid]);
    });
  }

  for (const pair of slots.siblings) {
    const blood = out[pair.blood];
    if (!blood) continue;
    out[pair.blood] = {
      ...blood,
      fatherId: slots.father,
      motherId: slots.mother,
    };
  }

  for (const childIds of slots.children) {
    for (const cid of childIds) {
      const child = out[cid];
      if (!child) continue;
      const templateChild = fresh[cid];
      if (!templateChild) continue;
      out[cid] = {
        ...child,
        fatherId: templateChild.fatherId,
        motherId: templateChild.motherId,
      };
    }
  }

  return out;
}

export function reconcileStore(store: import('../types/lineage').PedigreeStore): import('../types/lineage').PedigreeStore {
  const views = { ...store.views };
  for (const view of ['self', 'paternal', 'maternal', 'spouse'] as ActiveView[]) {
    if (views[view]) {
      views[view] = reconcileViewTemplate(view, views[view]);
    }
  }
  return { ...store, views };
}

export function createDefaultStore(createdAt: string = nowIso()): import('../types/lineage').PedigreeStore {
  return {
    version: 2,
    activeView: 'self',
    views: {
      self: createViewTemplate('self', createdAt),
      paternal: createViewTemplate('paternal', createdAt),
      maternal: createViewTemplate('maternal', createdAt),
      spouse: createViewTemplate('spouse', createdAt),
    },
  };
}

/** v1 단일 족보 → 친가 뷰로 이관 (이름·사진 유지) */
export function migrateLegacyToStore(
  legacy: Record<PersonId, Person>,
): import('../types/lineage').PedigreeStore {
  const store = createDefaultStore();
  const selfData = { ...store.views.self };
  const slots = slotIdsForView('self');

  const map: Array<[PersonId, PersonId]> = [
    ['p_grandfather', slots.gf],
    ['p_grandmother', slots.gm],
    ['father', slots.father],
    ['mother', slots.mother],
    ['self', slots.selfId],
    ['spouse', slots.spouseId],
    ['child1', slots.children[SELF_SLOT_INDEX][0]],
  ];

  for (const [oldId, newId] of map) {
    const src = legacy[oldId];
    if (src && selfData[newId]) {
      selfData[newId] = mergeLegacyPersonIntoSlot(selfData[newId], src, newId);
    }
  }

  for (const [id, legacyPerson] of Object.entries(legacy)) {
    if (!map.some(([o]) => o === id) && id !== 'self') {
      selfData[id] = legacyPerson;
    }
  }

  return { ...store, views: { ...store.views, self: selfData } };
}

export function isLegacyFlatPedigree(
  data: unknown,
): data is Record<PersonId, Person> {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return !!d.self && !('version' in d) && !('views' in d);
}
