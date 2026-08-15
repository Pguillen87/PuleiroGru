import type { PoseChoices, PoseRole, SubjectCategory } from "./types";

export type PoseOption = {
  id: string;
  role: PoseRole;
  label: string;
  description: string;
  previewPosition: string;
};

export const POSE_ROLE_ORDER: PoseRole[] = ["normal", "listening", "transcribing"];

export const POSE_ROLE_LABELS: Record<PoseRole, string> = {
  normal: "Normal",
  listening: "Ouvindo",
  transcribing: "Transcrevendo",
};

export const POSE_OPTIONS: PoseOption[] = [
  { id: "normal_attentive", role: "normal", label: "Pronto e atento", description: "Postura equilibrada e olhar atento.", previewPosition: "0% 0%" },
  { id: "normal_relaxed", role: "normal", label: "Relaxado", description: "Expressão tranquila e postura natural.", previewPosition: "33.333% 0%" },
  { id: "normal_curious", role: "normal", label: "Observador", description: "Olhar curioso sem perder a silhueta.", previewPosition: "66.667% 0%" },
  { id: "normal_firm", role: "normal", label: "Sereno", description: "Espera calma e confiante.", previewPosition: "100% 0%" },
  { id: "listening_focus", role: "listening", label: "Gesto de escuta", description: "Reação clara, adaptada à anatomia.", previewPosition: "0% 50%" },
  { id: "listening_process", role: "listening", label: "Inclinado para ouvir", description: "Corpo levemente orientado para o som.", previewPosition: "33.333% 50%" },
  { id: "listening_natural", role: "listening", label: "Reação natural", description: "Olhar, cabeça ou partes naturais respondem ao som.", previewPosition: "66.667% 50%" },
  { id: "listening_ready", role: "listening", label: "Cabeça inclinada", description: "Atenção concentrada e leitura imediata.", previewPosition: "100% 50%" },
  { id: "transcribing_notes", role: "transcribing", label: "Anotando", description: "Registro visual simples, adequado ao personagem.", previewPosition: "0% 100%" },
  { id: "transcribing_fast", role: "transcribing", label: "Digitando", description: "Ação focada com suporte visual compacto.", previewPosition: "33.333% 100%" },
  { id: "transcribing_thought", role: "transcribing", label: "Organizando ideias", description: "Processamento atento sem acessórios excessivos.", previewPosition: "66.667% 100%" },
  { id: "transcribing_active", role: "transcribing", label: "Processando", description: "Ação clara de transformar fala em conteúdo.", previewPosition: "100% 100%" },
];

export const DEFAULT_POSE_CHOICES: PoseChoices = {
  normal: "normal_attentive",
  listening: "listening_focus",
  transcribing: "transcribing_fast",
};

export function optionsForRole(role: PoseRole, category: SubjectCategory) {
  void category;
  return POSE_OPTIONS.filter((option) => option.role === role);
}
