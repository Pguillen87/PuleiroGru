import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssetQualityMetrics, GenerationJob } from "./types";

export async function reconcileAssetChecks(client: SupabaseClient, userId: string, job: GenerationJob) {
  const rows = [
    ...job.masters.filter((asset) => asset.qc).map((asset) => row(userId, job, "master", asset.id, asset.qc!)),
    ...job.poses.filter((asset) => asset.qc).map((asset) => row(userId, job, "pose", asset.role, asset.qc!, asset.templateVersion)),
  ];
  if (!rows.length) return;
  const { error } = await client.from("mascot_asset_checks").upsert(rows, {
    onConflict: "user_id,attempt_id,asset_type,asset_id",
  });
  if (error) throw new Error("Não foi possível reconciliar os controles de qualidade dos assets.");
}

function row(
  userId: string,
  job: GenerationJob,
  assetType: "master" | "pose",
  assetId: string,
  qc: AssetQualityMetrics,
  templateVersion?: string,
) {
  return {
    user_id: userId,
    attempt_id: job.attemptId,
    modal_job_id: job.id,
    asset_type: assetType,
    asset_id: assetId,
    qc_status: qc.status,
    safe_reasons: qc.safe_reasons,
    alpha_ratio: qc.alpha_ratio,
    border_opaque_ratio: qc.border_opaque_ratio,
    foreground_components: qc.foreground_components,
    model_version: "Qwen-Image-Edit-2511",
    prompt_version: "master-v4",
    template_version: templateVersion ?? null,
  };
}
