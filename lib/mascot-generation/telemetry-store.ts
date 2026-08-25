import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerationJob, GenerationMetric, GenerationMetricStage, GenerationMetricStatus } from "./types";
import type { MascotTraceContext } from "@/lib/observability/mascot-trace";

type TelemetryRow = {
  id: string;
  attempt_id: string;
  modal_job_id: string;
  stage: GenerationMetricStage;
  status: GenerationMetricStatus;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  estimated_cost_usd: number | null;
  actual_cost_usd: number | null;
  cost_source: GenerationMetric["costSource"] | null;
};

export async function recordGenerationRequested(client: SupabaseClient, userId: string, job: GenerationJob, stage: GenerationMetricStage, trace?: MascotTraceContext) {
  const { error } = await client.from("mascot_generation_telemetry").upsert({
    user_id: userId,
    attempt_id: job.attemptId,
    modal_job_id: job.id,
    stage,
    status: "requested" satisfies GenerationMetricStatus,
    started_at: new Date().toISOString(),
    completed_at: null,
    duration_ms: null,
    ...(trace ? { puleiro_trace_id: trace.puleiroTraceId, operation_id: trace.operationId ?? null } : {}),
  }, { onConflict: "user_id,modal_job_id,stage", ignoreDuplicates: true });
  if (error) throw new Error("Não foi possível registrar o início da geração.");
}

export async function reconcileGenerationTelemetry(client: SupabaseClient, userId: string, job: GenerationJob) {
  const status = completionStatus(job.status);
  const stages = stagesToComplete(job);
  await Promise.all(stages.map((stage) => finishStage(client, userId, job.id, stage, status)));
}

async function finishStage(
  client: SupabaseClient,
  userId: string,
  jobId: string,
  stage: GenerationMetricStage,
  status: GenerationMetricStatus,
) {
  const { data } = await client.from("mascot_generation_telemetry")
    .select("id, started_at")
    .eq("user_id", userId)
    .eq("modal_job_id", jobId)
    .eq("stage", stage)
    .eq("status", "requested")
    .maybeSingle<{ id: string; started_at: string }>();
  if (!data) return;
  const completedAt = new Date();
  const durationMs = Math.max(0, completedAt.getTime() - new Date(data.started_at).getTime());
  await client.from("mascot_generation_telemetry")
    .update({ status, completed_at: completedAt.toISOString(), duration_ms: durationMs })
    .eq("id", data.id);
}

export async function listGenerationMetrics(client: SupabaseClient, userId: string) {
  const { data, error } = await client.from("mascot_generation_telemetry")
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(100)
    .returns<TelemetryRow[]>();
  if (error) throw new Error("Não foi possível abrir o relatório de geração.");
  return (data ?? []).map(toMetric);
}

export function metricSummary(metrics: GenerationMetric[]) {
  const completed = metrics.filter((metric) => metric.status === "completed" && metric.durationMs !== undefined);
  const byStage = (stage: GenerationMetricStage) => completed.filter((metric) => metric.stage === stage).map((metric) => metric.durationMs!);
  const estimatedCostUsd = metrics.reduce((sum, metric) => sum + (metric.estimatedCostUsd ?? 0), 0);
  const actualCostUsd = metrics.reduce((sum, metric) => sum + (metric.actualCostUsd ?? 0), 0);
  return {
    totalRuns: metrics.length,
    completedRuns: completed.length,
    masterTypicalMs: median(byStage("master")),
    poseTypicalMs: median(byStage("poses")),
    estimatedCostUsd,
    actualCostUsd,
    hasActualCost: metrics.some((metric) => metric.actualCostUsd !== undefined),
  };
}

function stagesToComplete(job: GenerationJob): GenerationMetricStage[] {
  if (["awaiting_set_approval", "ready"].includes(job.status)) return ["master", "poses"];
  if (["awaiting_master_approval", "master_approved", "generating_poses"].includes(job.status)) return ["master"];
  if (["failed", "canceled"].includes(job.status)) return ["master", "poses"];
  return [];
}

function completionStatus(status: GenerationJob["status"]): GenerationMetricStatus {
  if (status === "canceled") return "canceled";
  return status === "failed" ? "failed" : "completed";
}

function median(values: number[]) {
  if (!values.length) return undefined;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : Math.round((ordered[middle - 1] + ordered[middle]) / 2);
}

function toMetric(row: TelemetryRow): GenerationMetric {
  return {
    id: row.id,
    attemptId: row.attempt_id,
    jobId: row.modal_job_id,
    stage: row.stage,
    status: row.status,
    startedAt: row.started_at,
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    ...(row.duration_ms !== null ? { durationMs: row.duration_ms } : {}),
    ...(row.estimated_cost_usd !== null ? { estimatedCostUsd: Number(row.estimated_cost_usd) } : {}),
    ...(row.actual_cost_usd !== null ? { actualCostUsd: Number(row.actual_cost_usd) } : {}),
    ...(row.cost_source ? { costSource: row.cost_source } : {}),
  };
}
