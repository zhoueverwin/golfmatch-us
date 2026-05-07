import { useEffect, useState } from "react";

let NetInfo: any;
try {
  NetInfo = require("@react-native-community/netinfo").default;
} catch {
  NetInfo = {
    addEventListener: (cb: (state: any) => void) => {
      cb({ isConnected: true, isInternetReachable: true });
      return () => {};
    },
    fetch: async () => ({ isConnected: true, isInternetReachable: true }),
  };
}

export const useNetworkStatus = () => {
  const [isConnected, setIsConnected] = useState<boolean | null>(true);
  const [isInternetReachable, setIsInternetReachable] = useState<
    boolean | null
  >(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: any) => {
      setIsConnected(state.isConnected);
      setIsInternetReachable(state.isInternetReachable);
    });

    NetInfo.fetch().then((state: any) => {
      setIsConnected(state.isConnected);
      setIsInternetReachable(state.isInternetReachable);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    isConnected,
    isInternetReachable,
    isOffline: !isConnected || !isInternetReachable,
  };
};

export default useNetworkStatus;
