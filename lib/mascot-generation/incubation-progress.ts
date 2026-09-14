import type { IncubationSummary } from "./types";

export type IncubationTiming = { averageMs: number | null; sampleCount: number };

export function incubationProgress(item: IncubationSummary, timing: IncubationTiming, now: number) {
  if (["READY_TO_HATCH", "HATCHED", "PACKAGE_READY"].includes(item.productState)) {
    return { percent: 100, message: "Preparação concluída." };
  }
  if (["FAILED", "NEEDS_HUMAN_MASTER_SELECTION"].includes(item.productState)) return null;
  const start = Date.parse(item.createdAt ?? "");
  if (!Number.isFinite(start) || !timing.averageMs || timing.averageMs <= 0 || timing.sampleCount < 3) {
    return { percent: null, message: "Acompanhando as etapas. Ainda não há histórico suficiente para estimar o tempo." };
  }
  const elapsed = Math.max(0, now - start);
  const remaining = timing.averageMs - elapsed;
  return {
    percent: Math.min(95, Math.floor(elapsed / timing.averageMs * 100)),
    message: remaining > 0
      ? `Estimativa: cerca de ${Math.max(1, Math.ceil(remaining / 60_000))} min restantes.`
      : "Está levando mais tempo que a média. Acompanhe a etapa atual.",
  };
}

export function formatIncubationDate(value?: string, timeZone = "America/Sao_Paulo") {
  const date = new Date(value ?? "");
  if (!Number.isFinite(date.getTime())) return "Data não disponível";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    second: "2-digit", timeZone, timeZoneName: "short",
  }).format(date);
}
