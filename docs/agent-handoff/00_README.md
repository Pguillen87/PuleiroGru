# 00 — Como usar este handoff

## Fonte canônica escolhida

Esta documentação fica em `Pguillen87/PuleiroGru/docs/agent-handoff/` porque esse repositório contém o BFF que integra browser, Supabase, Modal e o pacote Android, além das migrations de dados. O repositório `Pguillen87/gru` continua sendo a fonte canônica do Android e do Modal; cada seção aponta diretamente para seus arquivos.

Não duplicar estes documentos no repositório GRU. Quando uma decisão exclusiva de Android ou Modal precisar de documentação operacional própria, registrá-la junto ao código correspondente e referenciá-la aqui.

## Convenções de evidência

| Marca | Significado |
| --- | --- |
| **IMPLEMENTADO** | Encontrado no código versionado da branch indicada. |
| **EM PRODUÇÃO** | Exigiria comprovação de deploy/runtime; não inferir de código. |
| **EM ANDAMENTO** | Está em PR aberto ou branch, não em `main`. |
| **BLOQUEADO/PENDENTE** | Falta implementação, decisão ou pré-condição. |
| **NÃO VERIFICÁVEL** | Não houve evidência suficiente nesta investigação. |
| **HIPÓTESE** | Inferência explicitamente identificada; não usar para operar. |

## Ordem de leitura para Hermes

1. Leia `14_AGENT_RULES.md` antes de qualquer alteração.
2. Confira `12_CURRENT_STATUS.md` contra GitHub; o estado pode ter mudado desde este snapshot.
3. Para Web/BFF, leia `03_PULEIRO_WEB.md`, `06_APIS_AND_CONTRACTS.md` e `07_DATA_SUPABASE_STORAGE.md`.
4. Para geração, leia `04_INCUBATOR_AND_IMAGE_PIPELINE.md`, `05_STATE_MACHINES.md` e `09_MODAL_GPU_OPERATIONS.md`.
5. Para Android, leia `02_GRU_ANDROID.md` antes de tocar no manifesto ou no contrato de importação.

## Princípios operacionais que prevalecem

- Não assumir que merge, deploy e QA são a mesma coisa.
- Não executar GPU, retry pago, recovery remoto ou alteração em Production sem autorização explícita.
- Um `jobId` sozinho não autoriza acesso: todas as operações devem ser owner-scoped.
- Todo POST com efeito persistente ou custo precisa de idempotência server-side.
- Em operação GPU ambígua, consultar operação/call/output persistidos antes de qualquer retry.
- Preservar Android V1: o pacote contém somente `NORMAL`, `LISTENING` e `TRANSCRIBING`; Master não entra no pacote.

## Fontes no código

- `README.md`, `docs/ASYNC_INCUBATOR_V1.md`, `docs/MODAL_CONTRACT.md`, `supabase/migrations/` em `Pguillen87/PuleiroGru@41c7f4f`.
- `README.md`, `modal_service/ARCHITECTURE.md`, `modal_service/OPERATIONS.md` em `Pguillen87/gru@0f93306`.
