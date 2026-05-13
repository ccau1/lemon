import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import TicketsScreen from "../screens/TicketsScreen";
import ConnectionsScreen from "../screens/ConnectionsScreen";
import AddConnectionScreen from "../screens/AddConnectionScreen";
import ScanQrScreen from "../screens/ScanQrScreen";
import TicketDetailScreen from "../screens/TicketDetailScreen";
import SettingsScreen from "../screens/SettingsScreen";
import CreateWorkspaceScreen from "../screens/CreateWorkspaceScreen";

export type RootStackParamList = {
  Tickets: undefined;
  Connections: undefined;
  AddConnection: { qrName?: string; qrUrl?: string; qrMachineId?: string } | undefined;
  ScanQr: { mode?: "save" | "prefill" } | undefined;
  TicketDetail: { workspaceId: string; ticketId: string; connectionId: string };
  Settings: undefined;
  CreateWorkspace: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      <Stack.Screen name="Tickets" component={TicketsScreen} options={{ title: "Tickets" }} />
      <Stack.Screen name="Connections" component={ConnectionsScreen} options={{ title: "Connections" }} />
      <Stack.Screen name="AddConnection" component={AddConnectionScreen} options={{ title: "Add Connection" }} />
      <Stack.Screen name="ScanQr" component={ScanQrScreen} options={{ title: "Scan QR Code" }} />
      <Stack.Screen name="TicketDetail" component={TicketDetailScreen} options={{ title: "Ticket" }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
      <Stack.Screen name="CreateWorkspace" component={CreateWorkspaceScreen} options={{ title: "Create Workspace" }} />
    </Stack.Navigator>
  );
}
