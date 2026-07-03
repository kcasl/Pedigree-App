import React, { useEffect } from 'react';
import { ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { PersonNodeCard } from './PersonNodeCard';
import type { Person } from '../types/pedigree';

type Props = {
  person: Person;
  label: string;
  width: number;
  savedOffsetX: number;
  canvasScale: SharedValue<number>;
  onPress: () => void;
  onOffsetChange: (offsetX: number) => void;
  onDragActiveChange: (active: boolean) => void;
  style?: ViewStyle;
  highlighted?: boolean;
  generation?: number;
};

export function DraggablePersonNode({
  person,
  label,
  width,
  savedOffsetX,
  canvasScale,
  onPress,
  onOffsetChange,
  onDragActiveChange,
  style,
  highlighted,
  generation,
}: Props) {
  const offsetX = useSharedValue(savedOffsetX);
  const dragStart = useSharedValue(savedOffsetX);
  const isDragging = useSharedValue(false);

  useEffect(() => {
    offsetX.value = savedOffsetX;
    dragStart.value = savedOffsetX;
  }, [savedOffsetX, dragStart, offsetX]);

  const pan = Gesture.Pan()
    .activateAfterLongPress(420)
    .activeOffsetX([-6, 6])
    .failOffsetY([-14, 14])
    .onStart(() => {
      isDragging.value = true;
      dragStart.value = offsetX.value;
      runOnJS(onDragActiveChange)(true);
    })
    .onUpdate(e => {
      offsetX.value = dragStart.value + e.translationX / canvasScale.value;
    })
    .onEnd(() => {
      isDragging.value = false;
      runOnJS(onDragActiveChange)(false);
      runOnJS(onOffsetChange)(offsetX.value);
    })
    .onFinalize(() => {
      isDragging.value = false;
      runOnJS(onDragActiveChange)(false);
    });

  const tap = Gesture.Tap().maxDuration(280).onEnd(() => {
    runOnJS(onPress)();
  });

  const gesture = Gesture.Exclusive(pan, tap);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value }],
    zIndex: isDragging.value ? 200 : 1,
    elevation: isDragging.value ? 12 : 0,
    opacity: isDragging.value ? 0.94 : 1,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[animStyle, style]}>
        <PersonNodeCard
          label={label}
          person={person}
          onPress={() => {}}
          highlighted={highlighted}
          generation={generation}
          style={{ width, maxWidth: width, minWidth: width }}
        />
      </Animated.View>
    </GestureDetector>
  );
}
