import React from 'react';
import { View, ViewStyle } from 'react-native';
import { PersonNodeCard } from './PersonNodeCard';
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
}: Props) {
  return (
    <View style={style}>
      <PersonNodeCard
        label={label}
        ordinalLabel={ordinalLabel}
        person={person}
        onPress={onPress}
        highlighted={highlighted}
        generation={generation}
        width={width}
        height={height}
      />
    </View>
  );
}
