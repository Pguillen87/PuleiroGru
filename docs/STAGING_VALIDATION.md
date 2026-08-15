# Validação do ambiente Modal v2 staging sem GPU

Ambiente: `gru-mascot-v2-staging`  
URL: `https://automacao-guillenia-gru-mascot-v2-staging--gru-mascot-v2-d25cd0.modal.run`  
Data: 2026-08-13

## Resultado comprovado

- `/health`: `200`, ambiente `staging`, geração `false`;
- primeiro registro: `202`, estado `registered`, `generationScheduled=false`;
- replay idempotente: mesmo `jobId`, `idempotentReplay=true`;
- GET por `jobId` e por `attempt_id`: mesmo job;
- outro owner: `404`;
- Master generation: `409 GENERATION_DISABLED`;
- pose generation: `409 POSE_GENERATION_DISABLED`;
- JWT expirado e audience incorreta: `401`;
- probe com JWT curto e owner UUID: registro, replay, leitura e retomada passaram novamente em 2026-08-13;
- os endpoints de autorização de Master e poses foram chamados apenas para confirmar o bloqueio `409`; nenhum worker foi agendado;
- estatística do ambiente seguro: `QwenMasterWorker.generate` e `generate_poses` com zero runners e zero inputs;
- app de produção permaneceu com zero tasks.

## Correção Supabase Web

O Puleiro Web passou a usar Supabase Auth SSR. Firebase Web SDK, Firebase Admin e App Check Web foram removidos do repositório Web; Firebase permanece somente no Android e nas rotas Modal v1. O Modal v2 continua usando exclusivamente JWT curto do BFF.

Validação real inicial em 2026-08-13; configuração de cadastro atualizada em 2026-08-15:

- Project ID das chaves locais corresponde a `obpwtouliuwauscrtmlq`;
- e-mail/senha e cadastro estão habilitados; confirmação por e-mail está desabilitada, portanto o cadastro recebe sessão imediatamente;
- login real, renovação e logout passaram com usuários temporários removidos após o teste;
- o cadastro sem confirmação passou após a alteração de configuração;
- migration `mascot_attempts` aplicada via Supabase MCP; tabela, constraint, índices, RLS e policies SELECT/INSERT/UPDATE foram verificados no projeto remoto;
- testes reais de RLS passaram: um usuário não lê nem cria tentativa com o `user_id` de outro;
- advisor de segurança identificou `public.rls_auto_enable()` exposta a `anon`/`authenticated`; uma migration separada revogou `EXECUTE`, preservou o event trigger `ensure_rls` e zerou os findings de segurança;
- `npm audit` após remover Firebase retorna zero vulnerabilidades.

A recuperação real requer SMTP configurado e uma caixa postal controlada. O teste só envia a recuperação quando `SUPABASE_RECOVERY_TEST_EMAIL` existir em `.env.local`; sem essa variável ele é explicitamente ignorado, em vez de usar um endereço fictício ou mascarar a validação. As chamadas HTTP de autorização de Master e poses terminaram em `409`; chamadas dos workers de GPU, geração de Master e geração de poses permaneceram em zero.
