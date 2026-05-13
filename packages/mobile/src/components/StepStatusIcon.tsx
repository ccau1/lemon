import React from "react";
import { View, ActivityIndicator } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import type { WorkflowStep } from "@lemon/shared";

function stepIndex(step: WorkflowStep | "general" | "workflow") {
  return (["spec", "plan", "tasks"] as WorkflowStep[]).indexOf(step as WorkflowStep);
}

export function TaskProgressIcon({ tasks, active }: { tasks: any[]; active?: boolean }) {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "done" || t.done).length;
  const r = 10;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? completed / total : 0;
  const dashoffset = c * (1 - pct);
  const progressColor = active ? "#ffffff" : "#4f46e5";
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Circle
        cx={12}
        cy={12}
        r={r}
        fill="none"
        stroke={active ? "rgba(255,255,255,0.4)" : "#d1d5db"}
        strokeWidth={2}
        opacity={0.4}
      />
      <Circle
        cx={12}
        cy={12}
        r={r}
        fill="none"
        stroke={progressColor}
        strokeWidth={2}
        strokeDasharray={c}
        strokeDashoffset={dashoffset}
        strokeLinecap="round"
        transform="rotate(-90 12 12)"
      />
    </Svg>
  );
}

function TaskHalfCircleIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

function SpinnerIcon({ color = "#4f46e5" }: { color?: string }) {
  return (
    <View style={{ width: 16, height: 16, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="small" color={color} />
    </View>
  );
}

function CheckmarkIcon({ color = "#16a34a" }: { color?: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 13l4 4L19 7" />
    </Svg>
  );
}

function ErrorIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </Svg>
  );
}

function FilledCircleIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill={color}>
      <Circle cx={12} cy={12} r={10} />
    </Svg>
  );
}

function EmptyCircleIcon({ color = "#9ca3af" }: { color?: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Circle cx={12} cy={12} r={10} />
    </Svg>
  );
}

export interface StepStatusIconProps {
  status: string;
  step: WorkflowStep | "general" | "workflow";
  effectiveStep: WorkflowStep;
  isRunning?: boolean;
  tasks?: any[];
  outdated?: boolean;
  isActive?: boolean;
  chatPendingStep?: WorkflowStep | null;
}

export default function StepStatusIcon({
  status,
  step,
  effectiveStep,
  isRunning,
  tasks,
  outdated,
  isActive,
  chatPendingStep,
}: StepStatusIconProps) {
  const currentColor = isActive ? "#ffffff" : "#4f46e5";
  const pendingColor = isActive ? "#ffffff" : "#f59e0b";
  const grayColor = isActive ? "rgba(255,255,255,0.6)" : "#9ca3af";

  if (step === "general") {
    if (status === "error") return <ErrorIcon />;
    if (status === "done") return <CheckmarkIcon color={isActive ? "#ffffff" : "#16a34a"} />;
    if (status === "awaiting_review") return <FilledCircleIcon color={pendingColor} />;
    if (isRunning) return <SpinnerIcon color={currentColor} />;
    return <EmptyCircleIcon color={grayColor} />;
  }

  if (step === "workflow") {
    return (
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={grayColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <Path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </Svg>
    );
  }

  const idx = stepIndex(step);
  const effIdx = stepIndex(effectiveStep);
  const isError = status === "error" && step === effectiveStep;
  const isPendingReview = status === "awaiting_review" && step === effectiveStep;
  const isDone = idx < effIdx || status === "done";
  const isCurrent = idx === effIdx && !isDone;
  const isProcessing = (step === effectiveStep && isRunning) || step === chatPendingStep;

  if (outdated && !isRunning) {
    return <FilledCircleIcon color="#f59e0b" />;
  }

  const hasProcessingTasks = tasks && tasks.some((t) => t.status === "processing");

  if (step === "tasks" && tasks && tasks.length > 0) {
    if (isRunning && effectiveStep === "tasks" && !hasProcessingTasks) {
      return <SpinnerIcon color={currentColor} />;
    }
    if (isRunning) {
      return <TaskProgressIcon tasks={tasks} active={isActive} />;
    }
    if (isDone) {
      return <CheckmarkIcon color={isActive ? "#ffffff" : "#16a34a"} />;
    }
    if (isError) {
      return <ErrorIcon />;
    }
    if (isProcessing) {
      return <SpinnerIcon color={currentColor} />;
    }
    const completed = tasks.filter((t) => t.status === "done" || t.done).length;
    if (completed > 0) {
      return <TaskProgressIcon tasks={tasks} active={isActive} />;
    }
    return (
      <TaskHalfCircleIcon
        color={isPendingReview ? pendingColor : isCurrent ? currentColor : grayColor}
      />
    );
  }

  if (isProcessing) {
    return <SpinnerIcon color={currentColor} />;
  }
  if (isError) {
    return <ErrorIcon />;
  }
  if (isDone) {
    return <CheckmarkIcon color={isActive ? "#ffffff" : "#16a34a"} />;
  }
  if (isPendingReview) {
    return <FilledCircleIcon color={pendingColor} />;
  }
  if (isCurrent) {
    return <FilledCircleIcon color={currentColor} />;
  }
  return <EmptyCircleIcon color={grayColor} />;
}
