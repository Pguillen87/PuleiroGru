# 15 — Glossário

| Termo | Significado neste projeto |
| --- | --- |
| Attempt | Registro Web owner-scoped que permite recuperar uma criação. |
| BFF | Backend for Frontend: Route Handlers Next.js entre browser e Modal. |
| Master | Candidato visual principal do mascote; não pertence ao pacote Android V1. |
| Pose | Uma representação operacional do mascote. Roles: normal, listening, transcribing. |
| Incubadora | Fluxo assíncrono Web de nascimento, do registro ao hatch. |
| Hatch | Transição do ovo pronto para nascimento confirmado; não implica automaticamente pacote ou Biblioteca. |
| QC | Quality Control: gates de qualidade individuais e do conjunto de poses. |
| Alpha QC | Verificação de transparência/recorte do asset processado. |
| RAW | Output preservado antes do derivado/processamento operacional. |
| Ready to hatch | Estado de produto que exige conjunto completo e evidências válidas; não equivale apenas a job `completed`. |
| Owner scope | Regra de que só o proprietário autenticado pode consultar/mutar seu recurso. |
| Idempotência | Repetir uma operação lógica produz a mesma consequência, sem duplicar job/custo. |
| RLS | Row Level Security do Postgres/Supabase, restringindo linhas pelo usuário autenticado. |
| BFF JWT | Token curto emitido pelo Web servidor para autenticar a chamada owner-scoped ao Modal v2. |
| Kill switch / gate | Flag que impede operação potencialmente cara ou perigosa, como GPU. |
| Reconciliador | Processo CPU/control-plane que observa/preserva estado e pode retomar fluxo permitido; não deve refazer GPU automaticamente. |
| Package V1 | Manifest e três assets instaláveis pelo Android, com checksums e promoção atômica. |
| QA | Ambiente controlado para validação; não é Production. |

## Fontes no código

- Web: `docs/MASCOT_PACKAGE_V1.md`, `docs/ASYNC_INCUBATOR_V1.md`, `lib/mascot-generation/types.ts`.
- Modal: `modal_service/v2_contract.py`, `modal_service/incubator.py`.
- Android: `app/src/gru/kotlin/com/pguillen/gru/mascot/importing/MascotImportModels.kt`.
