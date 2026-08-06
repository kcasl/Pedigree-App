/**
 * 족보 연결선 — 일반 가계도(pedigree chart) 방식
 *
 *   [조모]──[조부]     [외조모]──[외조부]
 *            \              /
 *         [모]────[부]
 *               │
 *              [나]
 *
 * - 부부: 카드 하단 가로선 (슬롯 1↔2, 3↔4 자동 인식)
 * - 부모→자식: 부부 중앙에서 세로 → 형제 rail → 각 자식 세로
 * - 부모가 좌우 다른 가지(1번·2번)여도 자식 연결은 T 형태 유지
 *
 * 튜닝: EDGE_DRAW_CONFIG
 */

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { ui } from '../theme/ui';
import type { Edge, PositionedNode } from '../utils/pedigreeLayout';

export const EDGE_DRAW_CONFIG = {
  enabled: true,
  /** 카드 하단 → 부부 가로선 (0이면 카드 밑변에 붙음) */
  spouseLineOffset: 0,
  /** 부부선~자녀 rail 추가 하강 */
  railDrop: 0,
  trunkGap: 18,
  childGap: 14,
  strokeWidth: 2.5,
  color: ui.color.line,
} as const;

type Props = {
  edges: Edge[];
  nodeById: Record<string, PositionedNode>;
  spousePairs?: Array<{ aId: string; bId: string }>;
  strokeWidth?: number;
  color?: string;
};

type CoupleGroup = {
  kind: 'couple';
  leftId: string;
  rightId: string;
  childIds: string[];
};

type SingleGroup = {
  kind: 'single';
  parentId: string;
  childIds: string[];
};

type ParentGroup = CoupleGroup | SingleGroup;

function bar(
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  stroke: number,
) {
  if (![x, y, w, h, stroke].every(Number.isFinite)) {
    return {
      position: 'absolute' as const,
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      backgroundColor: 'transparent',
    };
  }
  return {
    position: 'absolute' as const,
    left: Math.round(x),
    top: Math.round(y),
    width: Math.max(stroke, Math.round(w)),
    height: Math.max(stroke, Math.round(h)),
    backgroundColor: color,
    borderRadius: stroke / 2,
  };
}

function cx(n: PositionedNode): number {
  return n.x + n.width / 2;
}

function bottom(n: PositionedNode): number {
  return n.y + n.height;
}

function top(n: PositionedNode): number {
  return n.y;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

function isLayoutCouple(a: PositionedNode, b: PositionedNode): boolean {
  if (a.generation !== b.generation) return false;
  return a.partnerId === b.id || b.partnerId === a.id;
}

function pickCouple(
  parentIds: string[],
  spouseKeys: Set<string>,
  nodeById: Record<string, PositionedNode>,
): { couple: [string, string] | null; rest: string[] } {
  if (parentIds.length < 2) return { couple: null, rest: parentIds };

  // 한 자식의 부·모(엣지 2개)는 거리와 무관하게 항상 부부로 연결
  if (parentIds.length === 2) {
    const a = nodeById[parentIds[0]];
    const b = nodeById[parentIds[1]];
    if (a && b) {
      const left = cx(a) <= cx(b) ? parentIds[0] : parentIds[1];
      const right = left === parentIds[0] ? parentIds[1] : parentIds[0];
      return { couple: [left, right], rest: [] };
    }
  }

  for (let i = 0; i < parentIds.length; i++) {
    for (let j = i + 1; j < parentIds.length; j++) {
      const a = nodeById[parentIds[i]];
      const b = nodeById[parentIds[j]];
      if (!a || !b) continue;
      const key = pairKey(parentIds[i], parentIds[j]);
      if (spouseKeys.has(key) || isLayoutCouple(a, b)) {
        const left = cx(a) <= cx(b) ? parentIds[i] : parentIds[j];
        const right = left === parentIds[i] ? parentIds[j] : parentIds[i];
        const rest = parentIds.filter(id => id !== left && id !== right);
        return { couple: [left, right], rest };
      }
    }
  }
  return { couple: null, rest: parentIds };
}

function buildGroups(
  edges: Edge[],
  spousePairs: Array<{ aId: string; bId: string }>,
  nodeById: Record<string, PositionedNode>,
): { groups: ParentGroup[]; drawnCouples: Set<string> } {
  const byChild = new Map<string, Set<string>>();
  for (const { parentId, childId } of edges) {
    const set = byChild.get(childId) ?? new Set();
    set.add(parentId);
    byChild.set(childId, set);
  }

  const spouseKeys = new Set(spousePairs.map(p => pairKey(p.aId, p.bId)));
  const groupMap = new Map<string, ParentGroup>();
  const drawnCouples = new Set<string>();

  const addSingle = (parentId: string, childId: string) => {
    const k = `s:${parentId}`;
    const g = groupMap.get(k);
    if (g?.kind === 'single') g.childIds.push(childId);
    else groupMap.set(k, { kind: 'single', parentId, childIds: [childId] });
  };

  for (const [childId, parentSet] of byChild) {
    let remaining = Array.from(parentSet);
    const { couple, rest } = pickCouple(remaining, spouseKeys, nodeById);

    if (couple) {
      const [leftId, rightId] = couple;
      const k = `c:${pairKey(leftId, rightId)}`;
      drawnCouples.add(pairKey(leftId, rightId));
      const g = groupMap.get(k);
      if (g?.kind === 'couple') g.childIds.push(childId);
      else groupMap.set(k, { kind: 'couple', leftId, rightId, childIds: [childId] });
      remaining = rest;
    }

    for (const pid of remaining) addSingle(pid, childId);
  }

  return { groups: Array.from(groupMap.values()), drawnCouples };
}

/** 부부 가로선(baseY)과 자녀 top 사이 rail — 부모 쪽에 가깝게 */
function coupleRailY(
  baseY: number,
  minChildTop: number,
  cfg: typeof EDGE_DRAW_CONFIG,
): number {
  const span = Math.max(0, minChildTop - baseY);
  return Math.round(baseY + span * 0.28 + cfg.railDrop);
}

/** 카드 밑변에 붙는 부부 가로선 Y (선 두께 중심) */
function coupleBarY(left: PositionedNode, right: PositionedNode, stroke: number): number {
  const parentBottom = Math.max(bottom(left), bottom(right));
  return parentBottom + EDGE_DRAW_CONFIG.spouseLineOffset + stroke / 2;
}

/** 각 배우자 카드 하단 중앙 → 부부 가로선 (떨어져 보이지 않게 카드 안으로 살짝 겹침) */
function drawCoupleDropStubs(
  out: React.ReactNode[],
  key: string,
  left: PositionedNode,
  right: PositionedNode,
  barY: number,
  color: string,
  stroke: number,
): void {
  const join = stroke / 2;
  const leftX = cx(left);
  const rightX = cx(right);
  const leftTop = bottom(left) - join;
  const rightTop = bottom(right) - join;
  out.push(
    <View
      key={`c_stub_l_${key}`}
      style={bar(leftX - stroke / 2, leftTop, stroke, Math.max(stroke, barY - leftTop + join), color, stroke)}
    />,
  );
  out.push(
    <View
      key={`c_stub_r_${key}`}
      style={bar(rightX - stroke / 2, rightTop, stroke, Math.max(stroke, barY - rightTop + join), color, stroke)}
    />,
  );
}

function lineColor(fallbackColor: string | undefined): string {
  return fallbackColor ?? EDGE_DRAW_CONFIG.color;
}

type Ctx = {
  out: React.ReactNode[];
  nodeById: Record<string, PositionedNode>;
  stroke: number;
  fallbackColor?: string;
  cfg: typeof EDGE_DRAW_CONFIG;
};

function drawCouple(group: CoupleGroup, ctx: Ctx): void {
  const { out, nodeById, stroke, fallbackColor, cfg } = ctx;
  const left = nodeById[group.leftId];
  const right = nodeById[group.rightId];
  if (!left || !right) return;

  const children = group.childIds
    .map(id => nodeById[id])
    .filter(Boolean)
    .sort((a, b) => cx(a) - cx(b)) as PositionedNode[];
  if (!children.length) return;

  const barY = coupleBarY(left, right, stroke);
  const midX = (cx(left) + cx(right)) / 2;
  const minChildTop = Math.min(...children.map(top));
  const parentColor = lineColor(fallbackColor);
  const childColor = lineColor(fallbackColor);
  const key = pairKey(group.leftId, group.rightId);
  const join = stroke / 2;

  // 카드 하단 → 부부선 세로 stub (카드에 붙임)
  drawCoupleDropStubs(out, key, left, right, barY, parentColor, stroke);

  // 부부 가로선: 두 stub 사이를 이음
  const stubLeft = Math.min(cx(left), cx(right));
  const stubRight = Math.max(cx(left), cx(right));
  out.push(
    <View
      key={`c_h_${key}`}
      style={bar(stubLeft, barY - stroke / 2, stubRight - stubLeft, stroke, parentColor, stroke)}
    />,
  );

  const ry = coupleRailY(barY, minChildTop, cfg);
  out.push(
    <View
      key={`c_v_${key}`}
      style={bar(
        midX - stroke / 2,
        barY - join,
        stroke,
        Math.max(stroke, ry - barY + join * 2),
        parentColor,
        stroke,
      )}
    />,
  );

  const childXs = children.map(cx);
  const railLeft = Math.min(midX, ...childXs);
  const railW = Math.max(midX, ...childXs) - railLeft;
  out.push(
    <View key={`c_r_${key}`} style={bar(railLeft, ry - stroke / 2, railW, stroke, childColor, stroke)} />,
  );

  for (const ch of children) {
    const x = cx(ch);
    // 자녀 카드 top에 살짝 겹치게
    const dropH = Math.max(stroke, top(ch) - ry + join + 2);
    out.push(
      <View
        key={`c_ch_${key}_${ch.id}`}
        style={bar(x - stroke / 2, ry - join, stroke, dropH, childColor, stroke)}
      />,
    );
  }
}

function drawSingle(group: SingleGroup, ctx: Ctx): void {
  const { out, nodeById, stroke, fallbackColor, cfg } = ctx;
  const parent = nodeById[group.parentId];
  if (!parent) return;

  const children = group.childIds
    .map(id => nodeById[id])
    .filter(Boolean)
    .sort((a, b) => cx(a) - cx(b)) as PositionedNode[];
  if (!children.length) return;

  const px = cx(parent);
  const join = stroke / 2;
  const trunkStart = bottom(parent) - join;
  const childXs = children.map(cx);
  const minChildTop = Math.min(...children.map(top));
  const ry = coupleRailY(bottom(parent) + cfg.spouseLineOffset + stroke / 2, minChildTop, cfg);
  const pid = group.parentId;
  const parentColor = lineColor(fallbackColor);
  const childColor = lineColor(fallbackColor);

  out.push(
    <View
      key={`s_v_${pid}`}
      style={bar(
        px - stroke / 2,
        trunkStart,
        stroke,
        Math.max(stroke, ry - trunkStart + join),
        parentColor,
        stroke,
      )}
    />,
  );

  const railLeft = Math.min(px, ...childXs);
  const railW = Math.max(px, ...childXs) - railLeft;
  out.push(
    <View key={`s_r_${pid}`} style={bar(railLeft, ry - stroke / 2, railW, stroke, childColor, stroke)} />,
  );

  for (const ch of children) {
    const x = cx(ch);
    const dropH = Math.max(stroke, top(ch) - ry + join + 2);
    out.push(
      <View
        key={`s_ch_${pid}_${ch.id}`}
        style={bar(x - stroke / 2, ry - join, stroke, dropH, childColor, stroke)}
      />,
    );
  }
}

function drawSpouseOnly(
  pairs: Array<{ aId: string; bId: string }>,
  drawn: Set<string>,
  nodeById: Record<string, PositionedNode>,
  ctx: Ctx,
): void {
  const { out, stroke, fallbackColor, cfg } = ctx;

  pairs.forEach((pair, idx) => {
    const key = pairKey(pair.aId, pair.bId);
    if (drawn.has(key)) return;

    const a = nodeById[pair.aId];
    const b = nodeById[pair.bId];
    if (!a || !b) return;
    if (a.generation !== b.generation) return;

    const left = cx(a) <= cx(b) ? a : b;
    const right = cx(a) <= cx(b) ? b : a;
    const barY = coupleBarY(left, right, stroke);
    const spouseColor = lineColor(fallbackColor);

    drawCoupleDropStubs(out, `sp_${idx}_${key}`, left, right, barY, spouseColor, stroke);
    const stubLeft = Math.min(cx(left), cx(right));
    const stubRight = Math.max(cx(left), cx(right));
    out.push(
      <View
        key={`sp_${idx}_${key}`}
        style={bar(stubLeft, barY - stroke / 2, stubRight - stubLeft, stroke, spouseColor, stroke)}
      />,
    );
  });
}

export function EdgeLines({
  edges,
  nodeById,
  spousePairs = [],
  strokeWidth = EDGE_DRAW_CONFIG.strokeWidth,
  color = '#000000',
}: Props) {
  const content = useMemo(() => {
    if (!EDGE_DRAW_CONFIG.enabled) return null;

    const cfg = EDGE_DRAW_CONFIG;
    const { groups, drawnCouples } = buildGroups(edges, spousePairs, nodeById);
    const out: React.ReactNode[] = [];
    const ctx: Ctx = { out, nodeById, stroke: strokeWidth, fallbackColor: color, cfg };

    for (const g of groups) {
      if (g.kind === 'couple') drawCouple(g, ctx);
      else drawSingle(g, ctx);
    }

    drawSpouseOnly(spousePairs, drawnCouples, nodeById, ctx);

    return out;
  }, [
    edges,
    nodeById,
    spousePairs,
    strokeWidth,
    color,
    EDGE_DRAW_CONFIG.spouseLineOffset,
    EDGE_DRAW_CONFIG.railDrop,
  ]);

  if (!content?.length) return null;

  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>{content}</View>;
}
