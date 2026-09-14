# Handoff técnico — GRU / Puleiro do GRU

Este é o ponto de entrada para **Hermes**, o próximo agente de desenvolvimento.
Ele descreve o ecossistema a partir de código e GitHub consultados em 07/09/2026.
Não trata planos, PRs abertos ou relatórios anteriores como funcionalidades entregues.

## Leitura em 10 minutos

1. [Visão geral e fonte de verdade](docs/agent-handoff/00_README.md)
2. [Arquitetura do ecossistema](docs/agent-handoff/01_ECOSYSTEM_ARCHITECTURE.md)
3. [Estado atual, PRs e ordem de integração](docs/agent-handoff/12_CURRENT_STATUS.md)
4. [Regras obrigatórias de trabalho](docs/agent-handoff/14_AGENT_RULES.md)

## Resposta rápida

| Pergunta | Resposta verificada |
| --- | --- |
| O que é? | GRU é um app Android de ditado com mascote flutuante; Puleiro é o Web/BFF para criar, organizar e, em fase posterior, entregar mascotes. |
| Repositórios | `Pguillen87/gru` (Android + Modal) e `Pguillen87/PuleiroGru` (Next.js, BFF e Supabase migrations). |
| Como se conectam? | Browser autenticado → BFF Next.js → Modal v2; Android legado → Modal v1 com Firebase/App Check; pacote Web → importador Android V1. |
| Onde estão os dados? | Metadados no Supabase; assets de geração no Volume Modal; pacote publicado no Storage privado do Supabase; mascote instalado no armazenamento privado Android. |
| Regra crítica | Browser não é autoridade para operações sensíveis. Owner scope, BFF, idempotência e gates server-side são obrigatórios. |
| Estado atual | Incubadora assíncrona está parcialmente mergeada; os PRs de recovery de assets e endurecimento de QC/hatch permanecem abertos. Consulte a tabela de status antes de agir. |
| Próximo trabalho recomendado | Auditoria dos PRs abertos; só depois merge, deploy QA e recovery CPU do job QA já existente. Não iniciar GPU por padrão. |

## Limites desta documentação

- Ela descreve o **código versionado** e o estado do GitHub observado na data acima.
- Configurações efetivas de Vercel, Modal, Supabase, secrets, tasks e Production são marcadas como **NÃO VERIFICÁVEL** quando não foram consultadas no runtime nesta investigação.
- URLs privadas, fotos, tokens, segredos e dados de usuários não são registrados.

## Mapa completo

- [Android](docs/agent-handoff/02_GRU_ANDROID.md)
- [Web e BFF](docs/agent-handoff/03_PULEIRO_WEB.md)
- [Incubadora e pipeline de imagens](docs/agent-handoff/04_INCUBATOR_AND_IMAGE_PIPELINE.md)
- [Máquinas de estado](docs/agent-handoff/05_STATE_MACHINES.md)
- [APIs e contratos](docs/agent-handoff/06_APIS_AND_CONTRACTS.md)
- [Supabase e Storage](docs/agent-handoff/07_DATA_SUPABASE_STORAGE.md)
- [Segurança e privacidade](docs/agent-handoff/08_SECURITY_PRIVACY.md)
- [Operações Modal/GPU](docs/agent-handoff/09_MODAL_GPU_OPERATIONS.md)
- [Deploy, QA e observabilidade](docs/agent-handoff/10_DEPLOY_QA_OBSERVABILITY.md)
- [Testes](docs/agent-handoff/11_TESTING.md)
- [Trabalho aberto e roadmap](docs/agent-handoff/13_OPEN_WORK_AND_ROADMAP.md)
- [Glossário](docs/agent-handoff/15_GLOSSARY.md)

## Fontes no código

- `Pguillen87/PuleiroGru` `main` em `41c7f4f131ceb7c53e405b4bdcac95e5cbdfe1a3`.
- `Pguillen87/gru` `main` em `0f9330646ae44d41f498405d706a1d7e576e5cbc`.
- GitHub: PRs abertos consultados em 07/09/2026.
