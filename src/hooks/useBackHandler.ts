import { useEffect } from "react";
import { BackHandler, Platform } from "react-native";

export const useBackHandler = (onBackPress: () => boolean) => {
  useEffect(() => {
    if (Platform.OS !== "android") return;

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      onBackPress,
    );

    return () => backHandler.remove();
  }, [onBackPress]);
};
