/**
 * 족보 노드 래퍼. 카드 렌더만 담당하고, 드래그 오프셋은 PedigreeScreen이 적용한다.
 */

import React from 'react';
import { View, ViewStyle } from 'react-native';
import { PersonNodeCard } from './PersonNodeCard';
import type { ActiveView } from '../types/lineage';
import type { Person } from '../types/pedigree';

type Props = {
  person: Person;
  label: string;
  ordinalLabel?: string;
  width: number;
  height: number;
  onPress: () => void;
  style?: ViewStyle;
  highlighted?: boolean;
  generation?: number;
  minGeneration?: number;
  referenceDate?: Date;
  activeView?: ActiveView;
};

export function DraggablePersonNode({
  person,
  label,
  ordinalLabel,
  width,
  height,
  onPress,
  style,
  highlighted,
  generation,
  minGeneration,
  referenceDate,
  activeView,
}: Props) {
  return (
    <View style={[{ width, height }, style]}>
      <PersonNodeCard
        label={label}
        ordinalLabel={ordinalLabel}
        person={person}
        onPress={onPress}
        highlighted={highlighted}
        generation={generation}
        minGeneration={minGeneration}
        width={width}
        height={height}
        referenceDate={referenceDate}
        activeView={activeView}
        style={{ width, maxWidth: width, minWidth: width }}
      />
    </View>
  );
}
