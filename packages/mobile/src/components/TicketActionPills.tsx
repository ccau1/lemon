import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { WorkflowStep } from "@lemon/shared";
import type { DetailStep } from "./TicketStepPills";

interface Props {
  activeStep: DetailStep;
  ticketState: string;
  effectiveStep: WorkflowStep;
  isRunning?: boolean;
  autoApprove?: Partial<Record<WorkflowStep, boolean>>;
  isArchived?: boolean;
  planOutdated?: boolean;
  tasksOutdated?: boolean;
  pendingStep?: WorkflowStep | null;
  isStuck?: boolean;
  onComment: () => void;
  onApprove: () => void;
  onToggleAutoApprove: (value: boolean) => void;
  onQueue: () => void;
  onRegenerate: () => void;
  onStartImplement: () => void;
  onStopImplement: () => void;
  onRecover?: () => void;
}

export default function TicketActionPills({
  activeStep,
  ticketState,
  effectiveStep,
  isRunning,
  autoApprove,
  isArchived,
  planOutdated,
  tasksOutdated,
  pendingStep,
  isStuck,
  onComment,
  onApprove,
  onToggleAutoApprove,
  onQueue,
  onRegenerate,
  onStartImplement,
  onStopImplement,
  onRecover,
}: Props) {
  const isCurrentStep = activeStep === effectiveStep;
  const isPending = (activeStep !== "general" && pendingStep === activeStep) || (isRunning && activeStep !== effectiveStep && activeStep !== "general");

  const pills: React.ReactNode[] = [];

  if (activeStep === "spec" || activeStep === "plan") {
    const outdated = activeStep === "plan" ? planOutdated : false;
    const showApprove = ticketState === "awaiting_review" && isCurrentStep && !outdated && !isArchived && !isPending;

    if (!isArchived && !showApprove && !isPending) {
      const step = activeStep as WorkflowStep;
      const isOn = autoApprove?.[step] ?? false;
      pills.push(
        <TogglePill key="auto" label="Auto" value={isOn} onChange={onToggleAutoApprove} />
      );
    }
    if (!isArchived && !isPending) {
      pills.push(
        <ActionPill key="comment" icon="chatbubble-ellipses-outline" label="Chat" onPress={onComment} disabled={isRunning || outdated} />
      );
    }
    if (showApprove) {
      pills.push(
        <ActionPill key="approve" icon="checkmark-circle-outline" label="Approve" onPress={onApprove} color="#16a34a" />
      );
    }
    if (!isArchived && !isRunning && isCurrentStep && !outdated && !isPending) {
      pills.push(
        <ActionPill key="regen" icon="refresh-outline" label="Regen" onPress={onRegenerate} color="#6b7280" />
      );
    }
    if (isCurrentStep && isRunning && !isPending) {
      pills.push(
        <ActionPill key="stop" icon="stop-circle-outline" label="Stop" onPress={onStopImplement} color="#dc2626" />
      );
    }
    if (isStuck && onRecover) {
      pills.push(
        <ActionPill key="retry" icon="reload-outline" label="Retry" onPress={onRecover} color="#f59e0b" />
      );
    }
  }

  if (activeStep === "tasks") {
    const outdated = tasksOutdated;
    const showApprove = ticketState === "awaiting_review" && isCurrentStep && !outdated && !isArchived && !isPending;

    if (!isArchived && !showApprove && !isPending) {
      const step = activeStep as WorkflowStep;
      const isOn = autoApprove?.[step] ?? false;
      pills.push(
        <TogglePill key="auto" label="Auto" value={isOn} onChange={onToggleAutoApprove} />
      );
    }
    if (!isArchived && !isPending) {
      pills.push(
        <ActionPill key="comment" icon="chatbubble-ellipses-outline" label="Chat" onPress={onComment} disabled={isRunning || outdated} />
      );
    }
    if (showApprove) {
      pills.push(
        <ActionPill key="approve" icon="checkmark-circle-outline" label="Approve" onPress={onApprove} color="#16a34a" />
      );
    }
    if (isCurrentStep && isRunning && !isPending) {
      pills.push(
        <ActionPill key="stop" icon="stop-circle-outline" label="Stop" onPress={onStopImplement} color="#dc2626" />
      );
    }
    if (isStuck && onRecover) {
      pills.push(
        <ActionPill key="retry" icon="reload-outline" label="Retry" onPress={onRecover} color="#f59e0b" />
      );
    }
    if (isCurrentStep && !isRunning && ticketState !== "awaiting_review" && !isArchived && !outdated && !isPending) {
      pills.push(
        <ActionPill key="start" icon="play-circle-outline" label="Start" onPress={onStartImplement} color="#4f46e5" />
      );
    }
  }

  if (pills.length === 0) return null;

  return (
    <View style={styles.pill}>{pills}</View>
  );
}

function ActionPill({
  icon,
  label,
  onPress,
  color,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
}) {
  const activeColor = disabled ? "#d1d5db" : (color || "#4f46e5");
  return (
    <TouchableOpacity style={[styles.item, disabled && styles.itemDisabled]} onPress={onPress} activeOpacity={disabled ? 1 : 0.7} disabled={disabled}>
      <View style={[styles.iconCircle, { borderColor: activeColor }]}>
        <Ionicons name={icon} size={16} color={activeColor} />
      </View>
      <Text style={[styles.label, { color: activeColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function TogglePill({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <TouchableOpacity
      style={styles.item}
      onPress={() => onChange(!value)}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.iconCircle,
          value && { backgroundColor: "#4f46e5", borderColor: "#4f46e5" },
        ]}
      >
        <Ionicons
          name={value ? "checkmark" : "remove"}
          size={14}
          color={value ? "#ffffff" : "#9ca3af"}
        />
      </View>
      <Text style={[styles.label, value && { color: "#4f46e5", fontWeight: "700" }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 5,
    gap: 4,
  },
  item: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 48,
    paddingHorizontal: 4,
  },
  itemDisabled: {
    opacity: 0.6,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  label: {
    fontSize: 10,
    fontWeight: "600",
    color: "#6b7280",
    marginTop: 2,
  },
});
