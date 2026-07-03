/**
 * 족보 자동 배치 — 참고 가계도(reference chart) 방식
 *
 *   [친조부]──[친조모]          [외조부]──[외조모]
 *                 \                 /
 *               [아버지]──[어머니]
 *                      |
 *                  [나]──[배우자]
 *                      |
 *                    [자녀…]
 *
 * 규칙:
 * - 아래(자손) 폭을 먼저 계산 → 위 세대는 자식 무리 중앙에 배치
 * - 혈연 왼쪽 + 배우자 오른쪽
 * - 친조부모는 아버지 위, 외조부모는 어머니 위 (별도 커플, 한 줄로 이어 붙이지 않음)
 * - 형제는 같은 세대에 좌우로 확장 (남→여 순)
 * - 인물 추가 시 peopleById 변경만으로 전체 재배치
 */

import type { Person, PersonId } from '../types/pedigree';

export type Side = 'left' | 'right' | 'center';
export type FamilySlot = 0 | 1 | 2 | 3 | 4;
export type LayoutRole = 'blood' | 'spouse' | 'single';

export type PositionedNode = {
  id: PersonId;
  x: number;
  y: number;
  width: number;
  height: number;
  generation: number;
  side: Side;
  slot: FamilySlot;
  layoutRole: LayoutRole;
  partnerId?: PersonId;
};

export type Edge = {
  parentId: PersonId;
  childId: PersonId;
};

export type LayoutResult = {
  canvasWidth: number;
  canvasHeight: number;
  nodes: PositionedNode[];
  edges: Edge[];
  nodeById: Record<PersonId, PositionedNode>;
};

export type BuildLayoutOptions = {
  selfId: PersonId;
  maxAncestorDepth: number;
  maxDescendantDepth: number;
  cardWidth: number;
  cardHeight: number;
  colGap: number;
  rowGap: number;
  padding: number;
  autoTune?: boolean;
  minCardWidth?: number;
  minColGap?: number;
  spouseGap?: number;
};

export const SLOT = {
  MALE_FATHER: 1 as const,
  MALE_MOTHER: 2 as const,
  FEMALE_FATHER: 3 as const,
  FEMALE_MOTHER: 4 as const,
};
export const FAMILY_SLOT = SLOT;

type LayoutCtx = {
  people: Record<PersonId, Person>;
  included: Set<PersonId>;
  generations: Map<PersonId, number>;
  opts: BuildLayoutOptions;
  cardW: number;
  siblingGap: number;
  spouseGap: number;
  nodes: PositionedNode[];
  nodeById: Record<PersonId, PositionedNode>;
  placed: Set<PersonId>;
};

type SubtreeLayout = {
  width: number;
  centerX: number;
};

// ── helpers ─────────────────────────────────────────────────────────

function isFemale(p: Person): boolean {
  return p.gender === 'female';
}

function isMale(p: Person): boolean {
  return p.gender === 'male';
}

function compareSiblingOrder(
  people: Record<PersonId, Person>,
  a: PersonId,
  b: PersonId,
): number {
  const pa = people[a];
  const pb = people[b];
  if (!pa || !pb) return 0;
  const ga = isMale(pa) ? 0 : isFemale(pa) ? 2 : 1;
  const gb = isMale(pb) ? 0 : isFemale(pb) ? 2 : 1;
  if (ga !== gb) return ga - gb;
  return (
    (Date.parse(pa.createdAt ?? '') || 0) - (Date.parse(pb.createdAt ?? '') || 0)
  );
}

function childBelongsToCouple(
  p: Person,
  anchorId: PersonId,
  spouseId?: PersonId,
): boolean {
  if (spouseId) {
    const f = p.fatherId;
    const m = p.motherId;
    if (f && m) {
      return (
        (f === anchorId && m === spouseId) || (f === spouseId && m === anchorId)
      );
    }
    if (f && !m) return f === anchorId || f === spouseId;
    if (m && !f) return m === anchorId || m === spouseId;
    return false;
  }
  return p.fatherId === anchorId || p.motherId === anchorId;
}

function childrenOfCouple(
  ctx: LayoutCtx,
  anchorId: PersonId,
  spouseId: PersonId | undefined,
  gen: number,
): PersonId[] {
  const ids: PersonId[] = [];
  for (const id of ctx.included) {
    if (ctx.placed.has(id)) continue;
    const p = ctx.people[id];
    if (!p || ctx.generations.get(id) !== gen) continue;
    if (childBelongsToCouple(p, anchorId, spouseId)) ids.push(id);
  }
  return ids.sort((a, b) => compareSiblingOrder(ctx.people, a, b));
}

function siblingsOf(
  ctx: LayoutCtx,
  personId: PersonId,
  gen: number,
): PersonId[] {
  const p = ctx.people[personId];
  if (!p) return [];
  if (!p.fatherId && !p.motherId) return [];
  return [...ctx.included]
    .filter(id => {
      if (id === personId || ctx.placed.has(id)) return false;
      if (ctx.generations.get(id) !== gen) return false;
      const o = ctx.people[id];
      if (!o) return false;
      if (!o.fatherId && !o.motherId) return false;
      return o.fatherId === p.fatherId && o.motherId === p.motherId;
    })
    .sort((a, b) => compareSiblingOrder(ctx.people, a, b));
}

function resolveSpouse(
  ctx: LayoutCtx,
  anchorId: PersonId,
): PersonId | undefined {
  const p = ctx.people[anchorId];
  const sid = p?.spouseId;
  if (sid && ctx.included.has(sid) && !ctx.placed.has(sid)) {
    if (ctx.generations.get(sid) === ctx.generations.get(anchorId)) return sid;
  }
  const gen = ctx.generations.get(anchorId);
  for (const id of ctx.included) {
    const child = ctx.people[id];
    if (!child || ctx.generations.get(id) !== (gen ?? 0) + 1) continue;
    if (child.fatherId === anchorId && child.motherId) {
      const mid = child.motherId;
      if (ctx.included.has(mid) && !ctx.placed.has(mid)) return mid;
    }
    if (child.motherId === anchorId && child.fatherId) {
      const fid = child.fatherId;
      if (ctx.included.has(fid) && !ctx.placed.has(fid)) return fid;
    }
  }
  return undefined;
}

function unitWidth(ctx: LayoutCtx, spouseId?: PersonId): number {
  return spouseId ? ctx.cardW * 2 + ctx.spouseGap : ctx.cardW;
}

function yOf(ctx: LayoutCtx, gen: number): number {
  const baseY = ctx.opts.padding + ctx.opts.rowGap * ctx.opts.maxAncestorDepth;
  return baseY + gen * ctx.opts.rowGap;
}

function coupleCenter(x: number, unitW: number): number {
  return x + unitW / 2;
}

/** 배치된 노드(배우자 포함)의 가로 범위 */
function unitBounds(
  ctx: LayoutCtx,
  nodeId: PersonId,
): { left: number; right: number } | null {
  const n = ctx.nodeById[nodeId];
  if (!n) return null;
  let left = n.x;
  let right = n.x + n.width;
  const partnerId = n.partnerId;
  if (partnerId) {
    const partner = ctx.nodeById[partnerId];
    if (partner && partner.generation === n.generation) {
      left = Math.min(left, partner.x);
      right = Math.max(right, partner.x + partner.width);
    }
  }
  return { left, right };
}

function bloodCenterX(ctx: LayoutCtx, personId: PersonId): number | null {
  const n = ctx.nodeById[personId];
  if (!n) return null;
  return n.x + n.width / 2;
}

function computeEdges(people: Record<PersonId, Person>, ids: Set<PersonId>): Edge[] {
  const edges: Edge[] = [];
  for (const p of Object.values(people)) {
    if (!ids.has(p.id)) continue;
    if (p.fatherId && ids.has(p.fatherId)) edges.push({ parentId: p.fatherId, childId: p.id });
    if (p.motherId && ids.has(p.motherId)) edges.push({ parentId: p.motherId, childId: p.id });
  }
  return edges;
}

// ── 세대 ────────────────────────────────────────────────────────────

function assignGenerations(
  people: Record<PersonId, Person>,
  selfId: PersonId,
  maxUp: number,
  maxDown: number,
): Map<PersonId, number> {
  const gen = new Map<PersonId, number>();
  const queue: PersonId[] = [];
  let head = 0;

  const sibs = (p: Person) => {
    if (!p.fatherId && !p.motherId) return [];
    return Object.values(people).filter(
      o =>
        o.id !== p.id &&
        !!o.fatherId &&
        !!o.motherId &&
        o.fatherId === p.fatherId &&
        o.motherId === p.motherId,
    );
  };

  const kids = (id: PersonId) =>
    Object.values(people).filter(p => p.fatherId === id || p.motherId === id);

  const visit = (id: PersonId | undefined, g: number) => {
    if (!id || !people[id] || gen.has(id)) return;
    if (g < -maxUp || g > maxDown) return;
    gen.set(id, g);
    queue.push(id);
  };

  visit(selfId, 0);
  while (head < queue.length) {
    const id = queue[head++];
    const p = people[id];
    if (!p) continue;
    const g = gen.get(id)!;
    visit(p.fatherId, g - 1);
    visit(p.motherId, g - 1);
    visit(p.spouseId, g);
    for (const s of sibs(p)) visit(s.id, g);
    for (const c of kids(id)) visit(c.id, g + 1);
  }
  return gen;
}

/** 실제 연결된 세대 깊이 (잘림 방지) */
function computeDepthBounds(
  people: Record<PersonId, Person>,
  selfId: PersonId,
): { maxUp: number; maxDown: number } {
  const gen = assignGenerations(people, selfId, 99, 99);
  let maxUp = 0;
  let maxDown = 0;
  for (const g of gen.values()) {
    if (g < 0) maxUp = Math.max(maxUp, -g);
    if (g > 0) maxDown = Math.max(maxDown, g);
  }
  return { maxUp, maxDown };
}

// ── 배치 ────────────────────────────────────────────────────────────

function placeCouple(
  ctx: LayoutCtx,
  anchorId: PersonId,
  spouseId: PersonId | undefined,
  x: number,
  y: number,
): { unitW: number; centerX: number } {
  const gen = ctx.generations.get(anchorId)!;
  const unitW = unitWidth(ctx, spouseId);
  const resolvedX = resolveRowOverlap(ctx, gen, x, unitW);

  const push = (id: PersonId, nx: number, role: LayoutRole, partner?: PersonId) => {
    if (ctx.placed.has(id)) return;
    const node: PositionedNode = {
      id,
      x: nx,
      y,
      width: ctx.cardW,
      height: ctx.opts.cardHeight,
      generation: gen,
      side: 'center',
      slot: 0,
      layoutRole: role,
      partnerId: partner,
    };
    ctx.nodes.push(node);
    ctx.nodeById[id] = node;
    ctx.placed.add(id);
  };

  push(anchorId, resolvedX, spouseId ? 'blood' : 'single', spouseId);
  if (spouseId) push(spouseId, resolvedX + ctx.cardW + ctx.spouseGap, 'spouse', anchorId);

  return { unitW, centerX: coupleCenter(resolvedX, unitW) };
}

/** 한 사람(+배우자)과 그 자손 서브트리 — 형제는 포함하지 않음 */
function layoutSingleBranch(
  ctx: LayoutCtx,
  bloodId: PersonId,
  leftX: number,
  placeAncestors = true,
): SubtreeLayout {
  if (!ctx.included.has(bloodId)) {
    return { width: 0, centerX: leftX };
  }

  const gen = ctx.generations.get(bloodId);
  if (gen == null) return { width: 0, centerX: leftX };

  const spouseId = resolveSpouse(ctx, bloodId);
  const y = yOf(ctx, gen);
  const childGen = gen + 1;
  const children = childrenOfCouple(ctx, bloodId, spouseId, childGen);

  if (children.length > 0) {
    const desc = layoutDescendantsOfCouple(ctx, bloodId, spouseId, leftX);
    const ux = desc.centerX - unitWidth(ctx, spouseId) / 2;
    const placed = placeCouple(ctx, bloodId, spouseId, ux, y);
    const rightEdge = Math.max(leftX + desc.width, ux + placed.unitW);
    if (placeAncestors) layoutAncestorsAbove(ctx, bloodId, placed.centerX);
    return { width: rightEdge - leftX, centerX: placed.centerX };
  }

  const uw = unitWidth(ctx, spouseId);
  const placed = placeCouple(ctx, bloodId, spouseId, leftX, y);
  if (placeAncestors) layoutAncestorsAbove(ctx, bloodId, placed.centerX);
  return { width: uw, centerX: placed.centerX };
}

/** 한 사람(+배우자)과 그 자손·형제 서브트리 */
function layoutBloodLine(
  ctx: LayoutCtx,
  bloodId: PersonId,
  leftX: number,
  placeAncestors = true,
): SubtreeLayout {
  if (!ctx.included.has(bloodId)) {
    return { width: 0, centerX: leftX };
  }

  const gen = ctx.generations.get(bloodId);
  if (gen == null) return { width: 0, centerX: leftX };

  const spouseId = resolveSpouse(ctx, bloodId);
  const y = yOf(ctx, gen);

  // 형제(같은 부모) — 먼저 왼쪽에 배치
  const sibs = siblingsOf(ctx, bloodId, gen);
  let cursor = leftX;
  const centers: number[] = [];

  for (const sibId of sibs) {
    const sibSpouse = resolveSpouse(ctx, sibId);
    const sibKids = childrenOfCouple(ctx, sibId, sibSpouse, gen + 1);
    if (sibKids.length > 0) {
      const sub = layoutDescendantsOfCouple(ctx, sibId, sibSpouse, cursor);
      const sx = sub.centerX - unitWidth(ctx, sibSpouse) / 2;
      placeCouple(ctx, sibId, sibSpouse, sx, y);
      centers.push(sub.centerX);
      cursor += sub.width + ctx.siblingGap;
    } else {
      const uw = unitWidth(ctx, sibSpouse);
      const placed = placeCouple(ctx, sibId, sibSpouse, cursor, y);
      centers.push(placed.centerX);
      cursor += uw + ctx.siblingGap;
    }
  }

  // 본인 자손 서브트리
  const childGen = gen + 1;
  const children = childrenOfCouple(ctx, bloodId, spouseId, childGen);
  let selfCenter: number;

  if (children.length > 0) {
    const desc = layoutDescendantsOfCouple(ctx, bloodId, spouseId, cursor);
    const ux = desc.centerX - unitWidth(ctx, spouseId) / 2;
    const placed = placeCouple(ctx, bloodId, spouseId, ux, y);
    selfCenter = placed.centerX;
    centers.push(selfCenter);
    const rightEdge = Math.max(cursor + desc.width, ux + placed.unitW);
    const width = rightEdge - leftX;

    if (placeAncestors) layoutAncestorsAbove(ctx, bloodId, selfCenter);

    return {
      width,
      centerX: centers.length > 1 ? (centers[0] + centers[centers.length - 1]) / 2 : selfCenter,
    };
  }

  const uw = unitWidth(ctx, spouseId);
  const placed = placeCouple(ctx, bloodId, spouseId, cursor, y);
  selfCenter = placed.centerX;
  centers.push(selfCenter);
  const width = cursor + uw - leftX;

  if (placeAncestors) layoutAncestorsAbove(ctx, bloodId, selfCenter);

  return {
    width,
    centerX: centers.length ? (centers[0] + centers[centers.length - 1]) / 2 : selfCenter,
  };
}

/** 부부의 자손 세대(아래) 재귀 배치 — 폭·중심 반환 */
function layoutDescendantsOfCouple(
  ctx: LayoutCtx,
  anchorId: PersonId,
  spouseId: PersonId | undefined,
  leftX: number,
): SubtreeLayout {
  const childGen = (ctx.generations.get(anchorId) ?? 0) + 1;
  const children = childrenOfCouple(ctx, anchorId, spouseId, childGen);
  if (!children.length) {
    const uw = unitWidth(ctx, spouseId);
    return { width: uw, centerX: leftX + uw / 2 };
  }

  let cursor = leftX;
  const centers: number[] = [];

  for (let i = 0; i < children.length; i++) {
    const childId = children[i];
    const sub = layoutBloodLine(ctx, childId, cursor, false);
    centers.push(sub.centerX);
    cursor += sub.width + (i < children.length - 1 ? ctx.siblingGap : 0);
  }

  const width = cursor - leftX;
  const centerX = (centers[0] + centers[centers.length - 1]) / 2;
  return { width, centerX };
}

/** 배치 없이 서브트리 폭·중심만 계산 (형제 제외) */
function measureSingleBranch(ctx: LayoutCtx, bloodId: PersonId): SubtreeLayout {
  if (!ctx.included.has(bloodId)) return { width: 0, centerX: 0 };

  const gen = ctx.generations.get(bloodId);
  if (gen == null) return { width: 0, centerX: 0 };

  const spouseId = resolveSpouse(ctx, bloodId);
  const children = childrenOfCouple(ctx, bloodId, spouseId, gen + 1);

  if (children.length > 0) {
    const desc = measureDescendantsOfCouple(ctx, bloodId, spouseId);
    const uw = unitWidth(ctx, spouseId);
    return { width: Math.max(desc.width, uw), centerX: desc.centerX };
  }

  const uw = unitWidth(ctx, spouseId);
  return { width: uw, centerX: uw / 2 };
}

/** 배치 없이 서브트리 폭·중심만 계산 */
function measureBloodLine(ctx: LayoutCtx, bloodId: PersonId): SubtreeLayout {
  if (!ctx.included.has(bloodId)) return { width: 0, centerX: 0 };

  const gen = ctx.generations.get(bloodId);
  if (gen == null) return { width: 0, centerX: 0 };

  const spouseId = resolveSpouse(ctx, bloodId);
  const sibs = siblingsOf(ctx, bloodId, gen);
  let cursor = 0;
  const centers: number[] = [];

  for (const sibId of sibs) {
    const sibSpouse = resolveSpouse(ctx, sibId);
    const sibKids = childrenOfCouple(ctx, sibId, sibSpouse, gen + 1);
    if (sibKids.length > 0) {
      const sub = measureDescendantsOfCouple(ctx, sibId, sibSpouse);
      const uw = unitWidth(ctx, sibSpouse);
      centers.push(cursor + sub.centerX);
      cursor += sub.width + ctx.siblingGap;
    } else {
      const uw = unitWidth(ctx, sibSpouse);
      centers.push(cursor + uw / 2);
      cursor += uw + ctx.siblingGap;
    }
  }

  const children = childrenOfCouple(ctx, bloodId, spouseId, gen + 1);
  if (children.length > 0) {
    const desc = measureDescendantsOfCouple(ctx, bloodId, spouseId);
    const uw = unitWidth(ctx, spouseId);
    const ux = desc.centerX - uw / 2;
    centers.push(ux + uw / 2);
    const rightEdge = Math.max(cursor + desc.width, ux + uw);
    return {
      width: rightEdge,
      centerX: centers.length > 1 ? (centers[0] + centers[centers.length - 1]) / 2 : centers[0],
    };
  }

  const uw = unitWidth(ctx, spouseId);
  centers.push(cursor + uw / 2);
  return {
    width: cursor + uw,
    centerX: centers.length > 1 ? (centers[0] + centers[centers.length - 1]) / 2 : centers[0],
  };
}

function measureDescendantsOfCouple(
  ctx: LayoutCtx,
  anchorId: PersonId,
  spouseId: PersonId | undefined,
): SubtreeLayout {
  const childGen = (ctx.generations.get(anchorId) ?? 0) + 1;
  const children = childrenOfCouple(ctx, anchorId, spouseId, childGen);
  if (!children.length) {
    const uw = unitWidth(ctx, spouseId);
    return { width: uw, centerX: uw / 2 };
  }

  let cursor = 0;
  const centers: number[] = [];
  for (let i = 0; i < children.length; i++) {
    const sub = measureBloodLine(ctx, children[i]);
    centers.push(cursor + sub.centerX);
    cursor += sub.width + (i < children.length - 1 ? ctx.siblingGap : 0);
  }
  return {
    width: cursor,
    centerX: (centers[0] + centers[centers.length - 1]) / 2,
  };
}

function pairUnitKey(a: PersonId, b?: PersonId): string {
  if (!b) return a;
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

function resolveRowOverlap(
  ctx: LayoutCtx,
  gen: number,
  x: number,
  unitW: number,
): number {
  const margin = 16;
  let nextX = x;
  let guard = 0;
  while (guard++ < 48) {
    let hit = false;
    const seen = new Set<string>();
    for (const n of ctx.nodes) {
      if (ctx.generations.get(n.id) !== gen) continue;
      const key = pairUnitKey(n.id, n.partnerId);
      if (seen.has(key)) continue;
      seen.add(key);
      const bounds = unitBounds(ctx, n.id);
      if (!bounds) continue;
      const { left, right } = bounds;
      if (nextX < right + margin && nextX + unitW > left - margin) {
        nextX = right + margin;
        hit = true;
        break;
      }
    }
    if (!hit) break;
  }
  return nextX;
}

/** 같은 세대 혈족(형제)을 기준 인물 왼쪽/오른쪽에 배치 */
function layoutPeersBeside(
  ctx: LayoutCtx,
  personId: PersonId,
  gen: number,
  side: 'left' | 'right',
  anchorEdgeX: number,
): void {
  const peers = siblingsOf(ctx, personId, gen);
  if (!peers.length) return;

  if (side === 'left') {
    let rightEdge = anchorEdgeX - ctx.siblingGap;
    for (let i = peers.length - 1; i >= 0; i--) {
      const peerId = peers[i];
      if (ctx.placed.has(peerId)) continue;
      const measure = measureSingleBranch(ctx, peerId);
      const leftX = rightEdge - measure.width;
      layoutSingleBranch(ctx, peerId, leftX, true);
      rightEdge = leftX - ctx.siblingGap;
    }
    return;
  }

  let leftEdge = anchorEdgeX + ctx.siblingGap;
  for (const peerId of peers) {
    if (ctx.placed.has(peerId)) continue;
    const measure = measureSingleBranch(ctx, peerId);
    layoutSingleBranch(ctx, peerId, leftEdge, true);
    leftEdge += measure.width + ctx.siblingGap;
  }
}

/** 부모 세대를 자식 중심 위에 배치 — 친가(왼쪽)·외가(오른쪽) 확장 포함, 위로 재귀 */
function layoutAncestorsAbove(
  ctx: LayoutCtx,
  personId: PersonId,
  centerX: number,
): void {
  const p = ctx.people[personId];
  if (!p) return;

  const fatherId =
    p.fatherId && ctx.included.has(p.fatherId) ? p.fatherId : undefined;
  const motherId =
    p.motherId && ctx.included.has(p.motherId) ? p.motherId : undefined;
  if (!fatherId && !motherId) return;

  const anchorId = fatherId ?? motherId!;
  const gen = ctx.generations.get(anchorId);
  if (gen == null) return;

  const spouseId =
    fatherId && motherId
      ? anchorId === fatherId
        ? motherId
        : fatherId
      : undefined;

  // 이미 배치된 부모 커플 — 더 윗세대만 이어서 배치
  if (ctx.placed.has(anchorId)) {
    const fc = fatherId ? bloodCenterX(ctx, fatherId) : null;
    const mc = motherId ? bloodCenterX(ctx, motherId) : null;
    if (fatherId && fc != null) layoutAncestorsAbove(ctx, fatherId, fc);
    if (motherId && mc != null) layoutAncestorsAbove(ctx, motherId, mc);
    return;
  }

  const uw = unitWidth(ctx, spouseId);
  let coupleX = centerX - uw / 2;

  // 친가 혈족(아버지 형제) — 부모 커플 왼쪽
  if (fatherId) layoutPeersBeside(ctx, fatherId, gen, 'left', coupleX);

  coupleX = resolveRowOverlap(ctx, gen, coupleX, uw);
  placeCouple(ctx, anchorId, spouseId, coupleX, yOf(ctx, gen));

  const coupleRight = coupleX + uw;
  // 외가 혈족(어머니 형제) — 부모 커플 오른쪽
  if (motherId) layoutPeersBeside(ctx, motherId, gen, 'right', coupleRight);

  const fatherCenter = fatherId
    ? bloodCenterX(ctx, fatherId) ?? coupleX + ctx.cardW / 2
    : centerX;
  const motherCenter = motherId
    ? bloodCenterX(ctx, motherId) ?? coupleX + ctx.cardW + ctx.spouseGap + ctx.cardW / 2
    : centerX;

  if (fatherId) layoutAncestorsAbove(ctx, fatherId, fatherCenter);
  if (motherId) layoutAncestorsAbove(ctx, motherId, motherCenter);
}

function layoutFromSelf(ctx: LayoutCtx): void {
  const selfId = ctx.opts.selfId;
  layoutBloodLine(ctx, selfId, 0);

  // 아직 안 붙은 인물 — 가장 가까운 배치된 혈연 옆에 연결
  for (const id of [...ctx.included].sort((a, b) => compareSiblingOrder(ctx.people, a, b))) {
    if (ctx.placed.has(id)) continue;
    const p = ctx.people[id];
    const gen = ctx.generations.get(id);
    if (gen == null) continue;

    const anchorId = p.fatherId && ctx.placed.has(p.fatherId)
      ? p.fatherId
      : p.motherId && ctx.placed.has(p.motherId)
        ? p.motherId
        : p.spouseId && ctx.placed.has(p.spouseId)
          ? p.spouseId
          : undefined;

    if (anchorId) {
      const anchorBounds = unitBounds(ctx, anchorId);
      const hint = p.lineageSideHint;
      const leftX =
        hint === 'right' && anchorBounds
          ? anchorBounds.right + ctx.siblingGap
          : hint === 'left' && anchorBounds
            ? anchorBounds.left - measureBloodLine(ctx, id).width - ctx.siblingGap
            : anchorBounds
              ? anchorBounds.right + ctx.siblingGap
              : 0;
      layoutBloodLine(ctx, id, Math.max(0, leftX), true);
      continue;
    }

    const rightMost = ctx.nodes.reduce((m, n) => Math.max(m, n.x + n.width), 0);
    layoutBloodLine(ctx, id, rightMost + ctx.siblingGap, true);
  }
}

function normalizeCanvas(
  nodes: PositionedNode[],
  nodeById: Record<PersonId, PositionedNode>,
  padding: number,
): { canvasWidth: number; canvasHeight: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x + n.width);
    minY = Math.min(minY, n.y);
    maxY = Math.max(maxY, n.y + n.height);
  }

  if (!Number.isFinite(minX)) {
    return { canvasWidth: 800, canvasHeight: 600 };
  }

  const offsetX = padding - minX;
  const offsetY = padding - minY;

  for (const n of nodes) {
    n.x += offsetX;
    n.y += offsetY;
    nodeById[n.id] = n;
  }

  return {
    canvasWidth: Math.max(1200, maxX - minX + padding * 2),
    canvasHeight: Math.max(800, maxY - minY + padding * 2),
  };
}

// ── entry ───────────────────────────────────────────────────────────

export function buildPedigreeLayout(
  people: Record<PersonId, Person>,
  opts: BuildLayoutOptions,
): LayoutResult {
  const self = people[opts.selfId];
  if (!self) {
    return { canvasWidth: 0, canvasHeight: 0, nodes: [], edges: [], nodeById: {} };
  }

  const minW = opts.minCardWidth ?? 140;
  const minG = opts.minColGap ?? 18;
  const cardW = opts.autoTune ? Math.max(minW, opts.cardWidth) : opts.cardWidth;
  const siblingGap = opts.autoTune ? Math.max(minG, opts.colGap) : opts.colGap;
  const spouseGap = opts.spouseGap ?? 18;

  const depthBounds = computeDepthBounds(people, opts.selfId);
  const maxUp = Math.max(opts.maxAncestorDepth, depthBounds.maxUp + 1);
  const maxDown = Math.max(opts.maxDescendantDepth, depthBounds.maxDown + 1);

  const generations = assignGenerations(people, opts.selfId, maxUp, maxDown);

  const included = new Set(generations.keys());
  const layoutOpts = { ...opts, maxAncestorDepth: maxUp, maxDescendantDepth: maxDown };
  const ctx: LayoutCtx = {
    people,
    included,
    generations,
    opts: layoutOpts,
    cardW,
    siblingGap,
    spouseGap,
    nodes: [],
    nodeById: {},
    placed: new Set(),
  };

  layoutFromSelf(ctx);

  const { canvasWidth, canvasHeight } = normalizeCanvas(
    ctx.nodes,
    ctx.nodeById,
    opts.padding,
  );

  return {
    canvasWidth,
    canvasHeight,
    nodes: ctx.nodes,
    edges: computeEdges(people, included),
    nodeById: ctx.nodeById,
  };
}
