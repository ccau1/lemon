import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import StepStatusIcon from "./StepStatusIcon";
import type { WorkflowStep } from "@lemon/shared";

export type DetailStep = "general" | WorkflowStep;

interface Props {
  activeStep: DetailStep;
  onSelectStep: (step: DetailStep) => void;
  ticketState: string;
  effectiveStep: WorkflowStep;
  isRunning?: boolean;
  tasks?: any[];
  planOutdated?: boolean;
  tasksOutdated?: boolean;
  pendingStep?: WorkflowStep | null;
}

const STEPS: { key: DetailStep; label: string; fallbackIcon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "general", label: "General", fallbackIcon: "information-circle-outline" },
  { key: "spec", label: "Spec", fallbackIcon: "document-text-outline" },
  { key: "plan", label: "Plan", fallbackIcon: "list-outline" },
  { key: "tasks", label: "Tasks", fallbackIcon: "checkbox-outline" },
];

export default function TicketStepPills({
  activeStep,
  onSelectStep,
  ticketState,
  effectiveStep,
  isRunning,
  tasks,
  planOutdated,
  tasksOutdated,
  pendingStep,
}: Props) {
  return (
    <View style={styles.pill}>
      {STEPS.map((s) => {
        const isActive = activeStep === s.key;
        const outdated = s.key === "plan" ? planOutdated : s.key === "tasks" ? tasksOutdated : false;
        return (
          <TouchableOpacity
            key={s.key}
            style={[styles.item, isActive && styles.itemActive]}
            onPress={() => onSelectStep(s.key)}
            activeOpacity={0.8}
          >
            <View style={styles.iconWrap}>
              {s.key === "general" ? (
                <Ionicons
                  name={s.fallbackIcon}
                  size={14}
                  color={isActive ? "#ffffff" : "#6b7280"}
                />
              ) : (
                <StepStatusIcon
                  status={ticketState}
                  step={s.key}
                  effectiveStep={effectiveStep}
                  isRunning={isRunning}
                  tasks={s.key === "tasks" ? tasks : undefined}
                  outdated={outdated}
                  isActive={isActive}
                  chatPendingStep={pendingStep}
                />
              )}
            </View>
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  itemActive: {
    backgroundColor: "#4f46e5",
  },
  iconWrap: {
    width: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },
  labelActive: {
    color: "#ffffff",
  },
});
