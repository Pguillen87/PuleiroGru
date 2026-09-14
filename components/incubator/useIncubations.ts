"use client";

import { useCallback, useEffect, useState } from "react";
import type { IncubationSummary } from "@/lib/mascot-generation/types";

export function useIncubations() {
  const [items, setItems] = useState<IncubationSummary[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    const load = async () => {
      try {
        const response = await fetch("/api/mascot/incubations", { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok || !Array.isArray(body.incubations)) throw new Error(body.message ?? "Não foi possível atualizar a Incubadora.");
        if (controller.signal.aborted) return;
        setItems(body.incubations);
        setError("");
        setLoaded(true);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a Incubadora.");
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(() => { if (!document.hidden) void load(); }, 8_000);
      }
    };
    const resume = () => { if (!document.hidden) reload(); };
    window.addEventListener("online", reload);
    document.addEventListener("visibilitychange", resume);
    void load();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      window.removeEventListener("online", reload);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [revision, reload]);
  return { items, error, loaded, reload };
}
