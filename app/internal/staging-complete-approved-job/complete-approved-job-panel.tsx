"use client";

import { useState } from "react";

export default function CompleteApprovedJobPanel() {
  const [result, setResult] = useState("");
  const [running, setRunning] = useState(false);

  async function complete() {
    setRunning(true);
    setResult("");
    try {
      const response = await fetch("/api/internal/staging-complete-approved-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      setResult(JSON.stringify(await response.json(), null, 2));
    } finally {
      setRunning(false);
    }
  }

  return <main>
    <h1>Finalização interna do mascote aprovado</h1>
    <p>Disponível somente no Preview para a sessão QA autorizada.</p>
    <button disabled={running} onClick={complete}>Finalizar job aprovado</button>
    <pre aria-live="polite">{result}</pre>
  </main>;
}
