# 12 — Estado atual verificado

> Snapshot GitHub: 07/09/2026. Revalidar antes de qualquer merge, deploy ou operação QA.

## Branches principais consultadas

| Repositório | Branch | Commit consultado |
| --- | --- | --- |
| `Pguillen87/PuleiroGru` | `main` | `41c7f4f131ceb7c53e405b4bdcac95e5cbdfe1a3` |
| `Pguillen87/gru` | `main` | `0f9330646ae44d41f498405d706a1d7e576e5cbc` |

## Funcionalidades

| Requisito / feature | Status | Evidência | Repositório | Pendente |
| --- | --- | --- | --- | --- |
| GRU Android: ditado e overlay | IMPLEMENTADO | classes de ditado/acessibilidade e README | gru main | validação no device atual NÃO VERIFICÁVEL |
| Android V1: parser/instalação de pacote 3 poses | IMPLEMENTADO | `MascotImport*`, `CustomMascotStore` | gru main | resolver de produção ainda indisponível no código |
| Puleiro: sessão Supabase e BFF Modal v2 | IMPLEMENTADO | auth/Modal provider/rotas | Web main | deploy runtime NÃO VERIFICÁVEL |
| Attempts, RLS e biblioteca | IMPLEMENTADO | migrations + stores | Web main | aplicação remota NÃO VERIFICÁVEL |
| Registro de Incubadora sem GPU | IMPLEMENTADO | merges #9 e rotas | Web/Modal main | QA runtime precisa revalidação |
| Ranking de Master com política conservadora | IMPLEMENTADO | ADR, `incubator.py`, PR #8 mergeado | Modal main | calibração estatística não comprovada |
| Seleção humana de Master | IMPLEMENTADO | rotas Web/Modal | main | smoke histórico existe, runtime atual não foi reexecutado |
| Proxy owner-scoped de Master/pose após refresh | EM ANDAMENTO | PR Web #10 aberto | PuleiroGru | auditar, mergear e publicar QA |
| QC de poses role-aware v3 / recovery CPU | EM ANDAMENTO | PR Modal #11 aberto | gru | auditar, mergear e publicar QA |
| READY_TO_HATCH forte, polling e hatch seguro | EM ANDAMENTO | PR Web #11 aberto | PuleiroGru | depende do PR #10 e do Modal #11 |
| Página própria da Incubadora | BLOQUEADO/PENDENTE | não encontrada em main | PuleiroGru | roadmap posterior |
| Pacote Android publicado e importado end-to-end | BLOQUEADO/PENDENTE | endpoint/store existem; resolver Android é indisponível | ambos | integração/configuração e teste real |
| Production pronta para Incubadora | NÃO VERIFICÁVEL | nenhum audit/deploy final nesta investigação | ambos | não inferir de código |

## PRs abertos relevantes

| Repo | PR | Situação GitHub | Dependência / próximo passo |
| --- | --- | --- | --- |
| gru | [#11 — QC visual v3 e recovery](https://github.com/Pguillen87/gru/pull/11) | OPEN, MERGEABLE, base `main`, head `545751c` | Auditoria independente; depois QA sem GPU para recovery do RAW histórico. |
| PuleiroGru | [#10 — recovery de assets](https://github.com/Pguillen87/PuleiroGru/pull/10) | OPEN, MERGEABLE, Vercel Preview check success | Pré-requisito de asset recovery após refresh. |
| PuleiroGru | [#11 — hatch readiness](https://github.com/Pguillen87/PuleiroGru/pull/11) | OPEN, MERGEABLE | Depende explicitamente do PR Web #10 e do contrato v3 Modal. |
| gru | [#3 — import code Android V1](https://github.com/Pguillen87/gru/pull/3) | OPEN | Não misturar com Incubadora sem auditoria de compatibilidade. |
| gru | [#1/#2 — trabalho legado Modal](https://github.com/Pguillen87/gru/pulls) | OPEN | Revisar escopo antes de merge; não assumir compatibilidade com Incubadora atual. |

## Job QA histórico de referência

Existe evidência histórica de um job QA que gerou três Masters, tomou o caminho humano, aprovou `master_2` e executou uma operação de poses. O conjunto foi reprovado pelo QC v2 apesar de avaliação visual registrada como aceitável. IDs específicos, foto e paths privados não são repetidos neste handoff.

O recovery proposto pelo PR Modal #11 deve reutilizar exclusivamente seus RAWs preservados, sem criar GPU/job/attempt/operação. Nenhuma execução dessa recuperação foi feita nesta investigação.

## Divergências código × documentação antiga

1. `README.md` Web menciona encoder TorchScript; `modal_service/incubator.py` principal contém encoder ONNX CPU. Documentação antiga precisa de revisão, não mudança silenciosa de contrato.
2. `modal_service/ARCHITECTURE.md` descreve seis poses MVP; os contratos Web/Android V1 encontrados usam exatamente três roles operacionais.
3. Documentos antigos de GPU/staging citam nomes de apps/branches históricos; não são prova da configuração atual de QA/Production.

## Fontes no código

- GitHub API/CLI: PRs e branches acima, consultados em 07/09/2026.
- `git log` de `origin/main` em ambos os repositórios.
- `docs/ASYNC_INCUBATOR_V1.md`, `modal_service/ARCHITECTURE.md`, `README.md` de ambos os repos.
