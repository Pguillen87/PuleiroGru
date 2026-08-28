"use client";

import { useState } from "react";

const checkpoints = ["after_asset_1", "after_assets_3", "after_manifest", "after_code", "before_ready", "after_ready"] as const;

export default function FixturePanel() {
  const [result, setResult] = useState("");
  const [running, setRunning] = useState(false);
  async function run(checkpoint: typeof checkpoints[number]) {
    setRunning(true); setResult("");
    try {
      const response = await fetch("/api/internal/staging-package-fixture", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ checkpoint }) });
      setResult(JSON.stringify(await response.json(), null, 2));
    } finally { setRunning(false); }
  }
  async function inspectSource() {
    setRunning(true); setResult("");
    try {
      const response = await fetch("/api/internal/staging-package-fixture", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "inspect_source" }) });
      setResult(JSON.stringify(await response.json(), null, 2));
    } finally { setRunning(false); }
  }
  return <main><h1>Validação interna de pacote</h1><p>Disponível apenas no Preview com sessão QA autorizada.</p>
    <button disabled={running} onClick={inspectSource}>Inspecionar fonte</button>
    {checkpoints.map((checkpoint) => <button key={checkpoint} disabled={running} onClick={() => run(checkpoint)}>{checkpoint}</button>)}
    <pre aria-live="polite">{result}</pre>
  </main>;
}
