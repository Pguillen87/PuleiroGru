# 13 — Trabalho aberto e roadmap

## Ordem de integração atual

1. Auditar PR Web #10 — recovery de assets owner-scoped.
2. Auditar PR Modal #11 — QC v3, recovery CPU e invariante de ready.
3. Auditar PR Web #11 — projeção de estados, polling e hatch; confirmar dependência sobre #10.
4. Mergear somente após auditoria; publicar Modal QA e Web Preview QA.
5. Revalidar health, encoder, templates, JWT BFF, RLS e flags fail-closed.
6. Executar recovery CPU do job QA histórico **somente com autorização**, validar `READY_TO_HATCH`, UI e hatch uma vez.
7. Só depois autorizar novo smoke GPU controlado para validar caminho auto/confiante.

## Planos históricos a confirmar

Este roadmap apareceu no histórico do projeto, mas não foi confirmado como ADR/roadmap formal em `main`. Tratar como **CONTEXTO HISTÓRICO / DECISÃO A CONFIRMAR**:

1. QC, poses, READY_TO_HATCH e hatch.
2. Jornal, nome e configuração.
3. Pacote Android V1, Library e código.
4. Separar Incubadora de Meus Mascotes.
5. E2E completo.

O primeiro bloco está parcialmente implementado nos PRs #10/#11; os demais não devem ser iniciados como efeito colateral da correção atual.

## Decisões humanas ainda necessárias

| Decisão | Por que é necessária |
| --- | --- |
| Aprovar/rejeitar os três PRs abertos | Eles alteram contratos de asset, QC, ready e hatch. |
| Autorizar deploy QA após merge | Deploy altera runtime, mesmo sem GPU. |
| Autorizar recovery CPU do job histórico | É uma mutação controlada do job, embora sem GPU. |
| Autorizar smoke GPU novo | Necessário para comprovar caminho auto; requer teto, ambiente e observabilidade. |
| Definir escopo do Plano 2 | Nome/configuração/package/Biblioteca não pertencem automaticamente ao hatch do Plano 1. |

## Riscos principais

1. **Divergência de contratos v1/v2** — alto impacto. Mitigar mantendo Android legado separado do BFF Web.
2. **Ready falso** — alto impacto de UX/integridade. Mitigar com invariantes server-side e testes; PR #11 ainda aberto.
3. **Retry GPU duplicado** — custo/duplicação. Mitigar com idempotência, reserva antes de spawn e investigação de estado ambíguo.
4. **Asset privado exposto por recovery** — privacidade. Mitigar com owner+attempt e proxy BFF; PR Web #10 ainda aberto.
5. **Documentação antiga divergente** — decisões erradas por agente novo. Mitigar priorizando GitHub/código e atualizando este handoff em mudanças relevantes.

## Fontes no código

- PRs GitHub consultados em 07/09/2026.
- `docs/ASYNC_INCUBATOR_V1.md`, `docs/MASCOT_LIBRARY_ROADMAP.md`.
- `modal_service/POSE_QC_V3.md` no PR Modal #11 (não em main).
