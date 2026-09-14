# 10 — Deploy, QA e observabilidade

## O que é versionado

| Área | Evidência encontrada | Limite |
| --- | --- | --- |
| Web | Next scripts e configuração Supabase no repo; Preview Vercel aparece como check em um PR Web. | Projeto/variáveis/deploys efetivos não foram lidos. |
| Modal | Script de deploy fail-closed, `/health`, capabilities e docs operacionais. | App ativo, secrets e flags atuais NÃO VERIFICÁVEIS. |
| Android | Gradle build/test/lint e variants debug/release. | Build/release atual e device físico NÃO VERIFICÁVEIS. |
| Supabase | migrations e `supabase/config.toml`. | Aplicação em remote, RLS runtime e Storage remoto NÃO VERIFICÁVEIS. |
| CI | Não foram encontrados workflows GitHub versionados em `main` dos dois repos. | Checks externos podem existir; não inferir CI ausente globalmente. |

## Health e capabilities

Modal fornece `/health` e uma capability v2 autenticada. Health deve ser usado para confirmar ambiente, gates e readiness; capability precisa de identidade BFF adequada. Um HTTP 200 público não prova autorização, encoder pronto ou capacidade GPU.

## Observabilidade existente

O repositório Modal contém módulos de observabilidade estruturada e documentação de correlação por request ID. O código Web contém `lib/observability/mascot-trace.ts`. Android possui telemetria sanitizada de mascote.

**NÃO VERIFICÁVEL:** exportador OTEL, Prometheus, Logfire, dashboards, SLOs, alertas, retenção de logs e runbooks implantados. Documentar tais itens como proposta, nunca como operação existente.

## Dados mínimos a observar em QA

- request/correlation ID sanitizado;
- job/attempt/operation IDs sanitizados;
- transições de estado;
- duração por estágio;
- decisão do ranking e versão de política;
- quantidade de assets/QC;
- reserva/custo somente quando confirmado pelo Modal;
- número de workers/tasks GPU antes/depois.

Nunca observar por meio de foto, Base64, token, secret, header de autorização ou URL assinada.

## Falhas e resposta operacional

| Classe | Exemplo | Conduta |
| --- | --- | --- |
| Permanente | 400/401/403, mismatch de owner, QC inválido | Não retry automático; retornar erro seguro e preservar contexto. |
| Transitória | timeout, 429, 5xx de dependência | Usar timeout e backoff somente em chamada idempotente; em GPU ambígua parar para investigar. |
| Parcial | telemetria/capability não crítica indisponível | Não mascarar falha crítica nem bloquear registro que seja seguro; registrar evento sanitizado. |
| Fatal | config/manifest de modelo inválido, estado corrompido | Fail closed, não iniciar geração. |

## Rollback

Para mudança de geração, o rollback primário é desligar gates de QA/Production conforme autorização e confirmar health. Migrations devem ser aditivas; não apagar dados de job/RAW como parte de rollback automático.

## Fontes no código

- Web: `lib/observability/mascot-trace.ts`, `docs/GPU_SMOKE_TEST_RUNBOOK.md`, `package.json`, `supabase/config.toml`.
- Modal: `modal_service/app.py`, `structured_observability.py`, `inference_observability.py`, `OPERATIONS.md`, `deploy_v2_production_fail_closed.ps1`.
- Android: `MascotTelemetry.kt` e `modal_service/OPERATIONS.md` para correlação documentada.
