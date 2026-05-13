import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";

import RootNavigator from "./src/navigation/RootNavigator";
import { start as startWs, stop as stopWs } from "./src/services/wsManager";

const queryClient = new QueryClient();

export default function App() {
  useEffect(() => {
    startWs();
    return () => stopWs();
  }, []);

  return (
    <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <NavigationContainer>
            <RootNavigator />
            <StatusBar style="dark" />
          </NavigationContainer>
        </QueryClientProvider>
    </SafeAreaProvider>
  );
}
