import React, { useEffect } from "react";
import {
  Platform,
  View,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import type { FlatListProps } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { FlatList as RNFlatList } from "react-native";
import { FlatList as RNGHFlatList } from "react-native-gesture-handler";

const REFRESH_TRIGGER = 64;
const SPRING_CONFIG = { stiffness: 300, overshootClamping: true };

const AnimatedFlatList = Animated.createAnimatedComponent(
  RNGHFlatList
) as React.ComponentType<any>;

type BounceFlatListProps<T> = FlatListProps<T> & {
  refreshing?: boolean;
  onRefresh?: () => void;
};

function AndroidBounceFlatList<T>({
  refreshing,
  onRefresh,
  refreshControl,
  onScroll,
  inverted,
  style,
  ...rest
}: BounceFlatListProps<T>) {
  const scrollY = useSharedValue(0);
  const contentHeight = useSharedValue(0);
  const layoutHeight = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isRefreshing = useSharedValue(false);
  const isInverted = inverted ?? false;

  useEffect(() => {
    isRefreshing.value = refreshing ?? false;
    if (refreshing) {
      translateY.value = withSpring(REFRESH_TRIGGER, SPRING_CONFIG);
    } else if (translateY.value > 0) {
      translateY.value = withSpring(0, SPRING_CONFIG);
    }
  }, [refreshing]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
      contentHeight.value = e.contentSize.height;
      layoutHeight.value = e.layoutMeasurement.height;
      if (onScroll) {
        runOnJS(onScroll)({ nativeEvent: e } as any);
      }
    },
  });

  const panGesture = Gesture.Pan()
    .minDistance(5)
    .onChange((e) => {
      "worklet";
      const maxScrollY = Math.max(0, contentHeight.value - layoutHeight.value);
      const atTop = isInverted
        ? scrollY.value >= maxScrollY
        : scrollY.value <= 0;
      if (atTop || translateY.value > 0) {
        const resistance = 0.5;
        translateY.value = Math.max(
          0,
          translateY.value + e.changeY * resistance
        );
      }
    })
    .onEnd(() => {
      "worklet";
      if (isRefreshing.value) return;
      if (translateY.value > REFRESH_TRIGGER) {
        if (onRefresh) {
          runOnJS(onRefresh)();
        }
      } else {
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
    });

  const nativeGesture = Gesture.Native();

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const indicatorOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, REFRESH_TRIGGER],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.indicator, indicatorOpacity]} pointerEvents="none">
        <ActivityIndicator
          color="#4f46e5"
          animating={refreshing ?? false}
        />
      </Animated.View>
      <GestureDetector gesture={Gesture.Simultaneous(nativeGesture, panGesture)}>
        <AnimatedFlatList
          {...rest}
          inverted={isInverted}
          style={[style, styles.container, containerStyle]}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          overScrollMode="never"
          bounces={false}
        />
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  container: { flex: 1 },
  indicator: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: REFRESH_TRIGGER,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
});

export default function BounceFlatList<T>(props: BounceFlatListProps<T>) {
  if (Platform.OS === "android" && props.onRefresh) {
    return <AndroidBounceFlatList {...props} />;
  }
  return <RNFlatList {...props} />;
}
