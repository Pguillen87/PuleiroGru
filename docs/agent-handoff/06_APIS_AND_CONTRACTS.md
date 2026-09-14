# 06 — APIs e contratos relevantes

## Browser → BFF Web

| Método/rota | Caller e auth | Efeito / idempotência |
| --- | --- | --- |
| `POST /api/mascot/subject-hint` | sessão Supabase | Probe auxiliar; não substitui a escolha explícita do usuário. |
| `GET /api/mascot/capabilities` | sessão Supabase | Preflight sem criar job; o contrato de attempt exige leitura cuidadosa. |
| `GET /api/mascot/incubations` | sessão + owner | Lista/reconcilia vínculos existentes por owner+attempt; não cria job. |
| `POST /api/mascot/incubations` | sessão + origem confiável | Registra/reusa attempt com chave `X-Puleiro-Incubation-Key`; retorna job assíncrono. |
| `GET /api/mascot/incubations/{jobId}` | sessão + attempt owner-scoped | Lê job de incubação. |
| `POST /api/mascot/incubations/{jobId}/masters/{masterId}/select` | sessão + mutação confiável | Seleção humana owner-scoped. |
| `POST /api/mascot/incubations/{jobId}/hatch` | sessão + mutação confiável | Hatch; gate forte de ready é pendência no PR Web #11. |
| `GET /api/mascot/jobs/{jobId}/master/{masterId}` | sessão | Proxy privado de Master; recovery owner-scoped está no PR Web #10. |
| `GET /api/mascot/jobs/{jobId}/pose/{role}` | sessão | Proxy privado de pose; mesma dependência do PR Web #10. |
| `POST /api/mascot/library/{itemId}/package` | sessão + owner | Publica pacote V1 a partir de poses existentes; sem GPU. |
| `GET /api/mascot/import/{code}` | código válido | Resolve pacote pronto e emite URLs assinadas curtas. Rate limit em Production é pendente documentado. |

## BFF → Modal v2

O BFF assina JWT HS256 curto com `iss=puleiro-bff`, `aud=gru-modal`, `sub` do usuário Supabase, `jti`, `iat`, `exp` e `attempt_id`. O segredo é servidor-only. Não registrar valor de variável, token ou header de autorização.

Rotas relevantes documentadas/consumidas: criação e leitura de job, busca por attempt, streaming privado de Master/pose, capabilities, seleção de Master e operações de geração. A lista definitiva deve ser extraída do OpenAPI/handlers do deploy alvo antes de integrar novo cliente.

## Android → Modal v1

`MascotApi` Android usa Firebase ID token e Firebase App Check em `/v1/mascot/...`: criação, leitura, recovery por idempotência, geração de Master, aprovação, cancelamento, resultado e download. É contrato legado separado do BFF Web.

## Contratos imutáveis

- `attempt_id` e owner no JWT BFF devem coincidir com o recurso buscado.
- `subject-hint-policy-v2` e `subject-hint-v1` são allowlist Web; versões arbitrárias não são válidas.
- Roles operacionais são exatamente `normal`, `listening`, `transcribing` no Web/Modal e `NORMAL`, `LISTENING`, `TRANSCRIBING` no Android.
- URL de asset do Android import é HTTPS, host público, sem redirect livre/local e com checksum obrigatório.

## Erros

O BFF converte erros internos em resposta segura ao usuário. Falhas 4xx de validação/autorização não devem receber retry automático; falha de integração transitória deve preservar attempt/job para consulta posterior. Código e logs internos não devem aparecer ao usuário.

## Fontes no código

- Web: `app/api/mascot/`, `lib/mascot-generation/modal-auth.ts`, `modal-provider.ts`, `provider.ts`, `incubation-input.ts`, `lib/security/mutation-request.ts`.
- Modal: `modal_service/app.py`, `bff_auth.py`, `API_V2.md`.
- Android: `.../mascot/MascotApi.kt`, `.../mascot/importing/MascotImportModels.kt`.
