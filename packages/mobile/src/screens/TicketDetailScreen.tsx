import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useRoute, type RouteProp, useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RootStackParamList } from "../navigation/RootNavigator";
import type { WorkflowStep } from "@lemon/shared";
import { getConnections } from "../stores/connectionsStore";
import { useApiClient } from "../hooks/useApiClient";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@lemon/shared-ui";
import SimpleMarkdown from "../components/SimpleMarkdown";
import TicketStepPills, { type DetailStep } from "../components/TicketStepPills";
import StepStatusIcon, { TaskProgressIcon } from "../components/StepStatusIcon";
import TicketActionPills from "../components/TicketActionPills";
import CommentModal from "../components/CommentModal";

type TicketDetailRoute = RouteProp<RootStackParamList, "TicketDetail">;

function TaskStatusIcon({ status, done }: { status?: string; done?: boolean }) {
  if (done || status === "done") {
    return <Ionicons name="checkmark-circle" size={16} color="#16a34a" />;
  }
  if (status === "processing") {
    return (
      <View style={{ width: 16, height: 16, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="small" color="#4f46e5" />
      </View>
    );
  }
  if (status === "error") {
    return <Ionicons name="close-circle" size={16} color="#dc2626" />;
  }
  if (status === "cancelled") {
    return <Ionicons name="remove-circle" size={16} color="#9ca3af" />;
  }
  if (status === "queued") {
    return <Ionicons name="ellipse-outline" size={16} color="#d1d5db" />;
  }
  return <Ionicons name="ellipse-outline" size={16} color="#9ca3af" />;
}

export default function TicketDetailScreen() {
  const route = useRoute<TicketDetailRoute>();
  const { workspaceId, ticketId, connectionId } = route.params;
  const [loading, setLoading] = useState(true);
  const [ticket, setTicket] = useState<any>(null);
  const [details, setDetails] = useState<any>(null);
  const [activeStep, setActiveStep] = useState<DetailStep>("general");
  const [actionLoading, setActionLoading] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [pendingStep, setPendingStep] = useState<WorkflowStep | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const { buildClient } = useApiClient();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const ticketRef = useRef(ticket);
  ticketRef.current = ticket;

  const load = async () => {
    setLoading(true);
    try {
      const conns = await getConnections();
      const conn = conns.find((c) => c.id === connectionId);
      if (!conn) throw new Error("Connection not found");
      const client = buildClient(conn);
      const all = await client.getTickets(workspaceId);
      const t = all.find((x: any) => x.id === ticketId);
      setTicket(t);
      const d = await client.getTicketDetails(workspaceId, ticketId);
      setDetails(d);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to load ticket.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [workspaceId, ticketId, connectionId]);

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [workspaceId, ticketId, connectionId])
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [activeStep]);

  const isRunning = ticket?.state === "running" || ticket?.state === "queued" || (ticket?.state === "idle" && ticket?.status === "pending");

  const isStuck = (() => {
    if (!isRunning || !ticket?.updatedAt) return false;
    const updatedAt = new Date(ticket.updatedAt).getTime();
    return Date.now() - updatedAt > 180_000; // 3 minutes
  })();

  useEffect(() => {
    const shouldPoll = ticket?.state === "running" || ticket?.state === "queued" || (ticket?.state === "idle" && ticket?.status === "pending");
    if (!shouldPoll) return;
    const interval = setInterval(() => {
      refresh();
    }, 1000);
    return () => clearInterval(interval);
  }, [ticket?.state, ticket?.status]);



  const withClient = async (fn: (client: any) => Promise<any>) => {
    const conns = await getConnections();
    const conn = conns.find((c) => c.id === connectionId);
    if (!conn) throw new Error("Connection not found");
    const client = buildClient(conn);
    return fn(client);
  };

  const handleApprove = async () => {
    setActionLoading(true);
    const currentEff = (ticket?.effectiveStep || ticket?.step || "spec") as WorkflowStep;
    const nextStep = (["spec", "plan", "tasks"] as WorkflowStep[])[(["spec", "plan", "tasks"] as WorkflowStep[]).indexOf(currentEff) + 1];
    if (nextStep) setPendingStep(nextStep);
    try {
      await withClient((c) => c.approveTicket(workspaceId, ticketId));
      await load();
      // Auto-jump to the new effective step after approval
      setActiveStep((prev) => {
        if (prev === "general") return prev;
        const prevIdx = ["spec", "plan", "tasks"].indexOf(prev as string);
        const newEff = ticketRef.current?.effectiveStep || ticketRef.current?.step || "spec";
        const effIdx = ["spec", "plan", "tasks"].indexOf(newEff);
        if (prevIdx !== -1 && prevIdx < effIdx) {
          return newEff as DetailStep;
        }
        return prev;
      });
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setActionLoading(false);
      setTimeout(() => setPendingStep(null), 3000);
    }
  };

  const handleQueue = async () => {
    setActionLoading(true);
    try {
      await withClient((c) => c.queueTicket(workspaceId, ticketId));
      await load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const refresh = async () => {
    try {
      const conns = await getConnections();
      const conn = conns.find((c) => c.id === connectionId);
      if (!conn) return;
      const client = buildClient(conn);
      const all = await client.getTickets(workspaceId);
      const t = all.find((x: any) => x.id === ticketId);
      setTicket(t);
      const d = await client.getTicketDetails(workspaceId, ticketId);
      setDetails(d);
    } catch {
      // silent fail on background refresh
    }
  };

  const handleComment = async (message: string) => {
    if (!message.trim()) return;
    const step = (activeStep !== "general" ? activeStep : (ticket?.effectiveStep || ticket?.step || "spec")) as WorkflowStep;
    setPendingStep(step);
    setActionLoading(true);
    try {
      await withClient((c) =>
        c.chatTicket(workspaceId, ticketId, {
          step,
          messages: [{ role: "user", content: message.trim() }],
          revise: true,
        })
      );
      await load();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to send comment.");
    } finally {
      setActionLoading(false);
      setTimeout(() => setPendingStep(null), 3000);
    }
  };

  const handleToggleAutoApprove = async (value: boolean) => {
    if (activeStep === "general") return;
    setActionLoading(true);
    try {
      const next = { ...(ticket?.autoApprove || {}), [activeStep]: value };
      await withClient((c) =>
        c.updateTicket(workspaceId, ticketId, { autoApprove: next })
      );
      await load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (activeStep === "general" || activeStep === "tasks") return;
    setActionLoading(true);
    try {
      await withClient((c) => c.regenerateTicket(workspaceId, ticketId, activeStep));
      await load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartImplement = async () => {
    setActionLoading(true);
    try {
      await withClient((c) => c.startImplementation(workspaceId, ticketId));
      await load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopImplement = async () => {
    setActionLoading(true);
    try {
      await withClient((c) => c.stopImplementation(workspaceId, ticketId));
      await load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecover = async () => {
    setActionLoading(true);
    try {
      const result = await withClient((c) => c.recoverTicket(workspaceId, ticketId));
      if (result.recovered) {
        Alert.alert("Recovered", result.message);
      } else {
        Alert.alert("Not Stuck", result.message);
      }
      await load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const toggleTaskExpand = (id: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const effectiveStep = ticket?.effectiveStep || ticket?.step || "spec";

  const getStepLabel = (step: "spec" | "plan") => {
    const idx = ["spec", "plan", "tasks"].indexOf(step);
    const effIdx = ["spec", "plan", "tasks"].indexOf(effectiveStep);
    const outdated = step === "spec" ? details?.spec?.outdated : details?.plan?.outdated;
    if (outdated) return "Outdated";
    if (idx < effIdx || ticket?.state === "done") return "Completed";
    if (ticket?.state === "error" && step === effectiveStep) return "Error";
    if (ticket?.state === "awaiting_review" && step === effectiveStep) return "Awaiting review";
    if ((ticket?.state === "running" || ticket?.state === "queued") && step === effectiveStep) return "In progress";
    if (step === effectiveStep) return details?.[step]?.content ? "Generated" : "Not started";
    return "Pending";
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor="#4f46e5" />
        }
      >
        {activeStep === "general" && (
          <>
            <View style={styles.card}>
              <Text style={styles.title}>{ticket?.title}</Text>
              <View style={styles.row}>
                <View style={[styles.badge, { backgroundColor: "#eef2ff" }]}>
                  <Text style={[styles.badgeText, { color: "#4f46e5" }]}>
                    {ticket?.effectiveStep || ticket?.step || ticket?.status}
                  </Text>
                </View>
                <Text style={styles.meta}>{ticket?.workspaceName || workspaceId}</Text>
              </View>
              {ticket?.description ? (
                <Text style={styles.description}>{ticket.description}</Text>
              ) : null}
            </View>

            {ticket?.state === "awaiting_review" && (
              <View style={[styles.card, { backgroundColor: "#fffbeb", borderColor: "#fcd34d" }]}>
                <Text style={{ fontSize: 13, color: "#92400e", marginBottom: 8 }}>
                  This ticket is awaiting review on the <Text style={{ fontWeight: "700" }}>{effectiveStep}</Text> step.
                </Text>
                <Button title="Go to Review" onPress={() => setActiveStep(effectiveStep)} />
              </View>
            )}

            {details?.spec?.content && (
              <TouchableOpacity
                style={styles.card}
                onPress={() => setActiveStep("spec")}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text style={styles.sectionTitle}>Spec</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <StepStatusIcon
                      status={ticket?.state}
                      step="spec"
                      effectiveStep={effectiveStep}
                      isRunning={isRunning}
                      outdated={details?.spec?.outdated}
                      isActive={false}
                    />
                    <Text style={{ fontSize: 12, color: "#6b7280", fontWeight: "500" }}>
                      {getStepLabel("spec")}
                    </Text>
                  </View>
                </View>
                <View style={{ maxHeight: 120, overflow: "hidden" }}>
                  <SimpleMarkdown>{details.spec.content}</SimpleMarkdown>
                </View>
              </TouchableOpacity>
            )}

            {details?.plan?.content && (
              <TouchableOpacity
                style={styles.card}
                onPress={() => setActiveStep("plan")}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text style={styles.sectionTitle}>Plan</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <StepStatusIcon
                      status={ticket?.state}
                      step="plan"
                      effectiveStep={effectiveStep}
                      isRunning={isRunning}
                      outdated={details?.plan?.outdated}
                      isActive={false}
                    />
                    <Text style={{ fontSize: 12, color: "#6b7280", fontWeight: "500" }}>
                      {getStepLabel("plan")}
                    </Text>
                  </View>
                </View>
                <View style={{ maxHeight: 120, overflow: "hidden" }}>
                  <SimpleMarkdown>{details.plan.content}</SimpleMarkdown>
                </View>
              </TouchableOpacity>
            )}

            {Array.isArray(details?.tasks) && details.tasks.length > 0 && (
              <TouchableOpacity
                style={styles.card}
                onPress={() => setActiveStep("tasks")}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text style={styles.sectionTitle}>Tasks</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <TaskProgressIcon tasks={details.tasks} active={false} />
                    <Text style={{ fontSize: 12, color: "#6b7280" }}>
                      {details.tasks.filter((t: any) => t.done || t.status === "done").length} / {details.tasks.length}
                    </Text>
                  </View>
                </View>
                {details.tasks.slice(0, 3).map((task: any) => (
                  <View key={task.id} style={styles.taskRow}>
                    <TaskStatusIcon status={task.status} done={task.done} />
                    <Text style={[styles.taskText, task.done && styles.taskDone]} numberOfLines={1}>
                      {task.description || task.title || "Untitled task"}
                    </Text>
                  </View>
                ))}
                {details.tasks.length > 3 && (
                  <Text style={{ fontSize: 12, color: "#4f46e5", marginTop: 4, fontWeight: "600" }}>
                    + {details.tasks.length - 3} more
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </>
        )}

        {activeStep === "spec" && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Spec</Text>
            {details?.spec?.content ? (
              <SimpleMarkdown>{details.spec.content}</SimpleMarkdown>
            ) : (
              <Text style={styles.empty}>No spec generated yet.</Text>
            )}
          </View>
        )}

        {activeStep === "plan" && (
          <View style={[styles.card, details?.plan?.outdated && styles.cardOutdated]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={styles.sectionTitle}>Plan</Text>
              {details?.plan?.outdated && (
                <View style={styles.outdatedBadge}>
                  <Text style={styles.outdatedBadgeText}>Outdated</Text>
                </View>
              )}
            </View>
            {details?.plan?.content ? (
              <SimpleMarkdown>{details.plan.content}</SimpleMarkdown>
            ) : (
              <Text style={styles.empty}>No plan generated yet.</Text>
            )}
            {details?.plan?.outdated && (
              <View style={styles.outdatedBanner}>
                <Text style={styles.outdatedBannerText}>
                  This plan is outdated because an upstream artifact was edited. It will be regenerated when you continue the workflow.
                </Text>
              </View>
            )}
          </View>
        )}

        {activeStep === "tasks" && (
          <View style={[styles.card, details?.tasks?.some((t: any) => t.outdated) && styles.cardOutdated]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={styles.sectionTitle}>Tasks</Text>
              {details?.tasks?.some((t: any) => t.outdated) && (
                <View style={styles.outdatedBadge}>
                  <Text style={styles.outdatedBadgeText}>Outdated</Text>
                </View>
              )}
            </View>
            {Array.isArray(details?.tasks) && details.tasks.length > 0 ? (
              details.tasks.map((task: any) => (
                <View key={task.id}>
                  <TouchableOpacity
                    onPress={() => {
                      if (task.result || task.errorMessage) {
                        toggleTaskExpand(task.id);
                      }
                    }}
                    style={styles.taskRow}
                    activeOpacity={task.result || task.errorMessage ? 0.6 : 1}
                  >
                    <TaskStatusIcon status={task.status} done={task.done} />
                    <Text style={[styles.taskText, task.done && styles.taskDone]}>
                      {task.description || task.title || "Untitled task"}
                    </Text>
                    {(task.result || task.errorMessage) && (
                      <Ionicons
                        name={expandedTasks.has(task.id) ? "chevron-down" : "chevron-forward"}
                        size={14}
                        color="#9ca3af"
                      />
                    )}
                  </TouchableOpacity>
                  {expandedTasks.has(task.id) && task.result && (
                    <View style={styles.taskResult}>
                      <Text style={styles.taskResultText}>{task.result}</Text>
                    </View>
                  )}
                  {expandedTasks.has(task.id) && task.errorMessage && (
                    <View style={styles.taskError}>
                      <Text style={styles.taskErrorText}>{task.errorMessage}</Text>
                    </View>
                  )}
                </View>
              ))
            ) : (
              <Text style={styles.empty}>No tasks generated yet.</Text>
            )}
            {details?.tasks?.some((t: any) => t.outdated) && (
              <View style={styles.outdatedBanner}>
                <Text style={styles.outdatedBannerText}>
                  These tasks are outdated because an upstream artifact was edited. They will be regenerated when you continue the workflow.
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomPills, { paddingBottom: insets.bottom + 12 }]}>
        <TicketActionPills
          activeStep={activeStep}
          ticketState={ticket?.state}
          effectiveStep={effectiveStep}
          isRunning={isRunning}
          autoApprove={ticket?.autoApprove}
          isArchived={!!ticket?.archivedAt}
          planOutdated={details?.plan?.outdated}
          tasksOutdated={details?.tasks?.some((t: any) => t.outdated)}
          pendingStep={pendingStep}
          isStuck={isStuck}
          onComment={() => setCommentOpen(true)}
          onApprove={handleApprove}
          onToggleAutoApprove={handleToggleAutoApprove}
          onQueue={handleQueue}
          onRegenerate={handleRegenerate}
          onStartImplement={handleStartImplement}
          onStopImplement={handleStopImplement}
          onRecover={handleRecover}
        />
        <TicketStepPills
          activeStep={activeStep}
          onSelectStep={setActiveStep}
          ticketState={ticket?.state}
          effectiveStep={effectiveStep}
          isRunning={isRunning}
          tasks={details?.tasks}
          planOutdated={details?.plan?.outdated}
          tasksOutdated={details?.tasks?.some((t: any) => t.outdated)}
          pendingStep={pendingStep}
        />
      </View>

      <CommentModal
        visible={commentOpen}
        onClose={() => setCommentOpen(false)}
        onSend={handleComment}
        stepLabel={activeStep === "general" ? "General" : activeStep}
        disabled={actionLoading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 180 },
  card: {
    backgroundColor: "#ffffff",
    margin: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  title: { fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  meta: { fontSize: 12, color: "#6b7280" },
  description: { fontSize: 14, color: "#374151", marginTop: 4, lineHeight: 20 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#111827", marginBottom: 8 },
  empty: { fontSize: 13, color: "#9ca3af", fontStyle: "italic" },
  actions: { marginHorizontal: 12, gap: 8, marginBottom: 8 },
  taskRow: { flexDirection: "row", gap: 8, marginBottom: 6, alignItems: "flex-start" },
  taskText: { flex: 1, fontSize: 13, color: "#374151", lineHeight: 18 },
  taskDone: { textDecorationLine: "line-through", color: "#9ca3af" },
  taskResult: {
    marginLeft: 24,
    marginBottom: 8,
    backgroundColor: "#f9fafb",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  taskResultText: { fontSize: 12, color: "#374151", lineHeight: 18 },
  taskError: {
    marginLeft: 24,
    marginBottom: 8,
    backgroundColor: "#fef2f2",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  taskErrorText: { fontSize: 12, color: "#b91c1c", lineHeight: 18 },
  cardOutdated: {
    borderColor: "#facc15",
    borderWidth: 2,
  },
  outdatedBadge: {
    backgroundColor: "#fef9c3",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  outdatedBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#854d0e",
  },
  outdatedBanner: {
    marginTop: 12,
    backgroundColor: "#fefce8",
    padding: 10,
    borderRadius: 8,
  },
  outdatedBannerText: {
    fontSize: 12,
    color: "#854d0e",
    lineHeight: 18,
  },
  bottomPills: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    gap: 8,
  },
});
