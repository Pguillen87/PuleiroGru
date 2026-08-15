# Contrato Modal v2 — Puleiro do GRU

## Fronteiras de confiança

```text
Browser -- sessão SSR Supabase --> Next.js BFF
Next.js BFF -- JWT curto owner-scoped --> Modal v2
```

O BFF valida o usuário com Supabase `auth.getUser()`. O claim `sub` recebe somente o `user.id` confirmado. O navegador não recebe URL, token ou secret do Modal; Firebase Web e App Check Web não fazem parte deste contrato.

## Browser → BFF

| Método | Rota | Função |
|---|---|---|
| POST | Supabase Auth | cadastro/login/recuperação; SDK grava cookies SSR |
| POST | `/api/mascot/jobs` | sanitiza foto, preserva tentativa e registra job idempotente |
| GET | `/api/mascot/jobs/current` | retoma por sessão + RLS + `attemptId` |
| GET | `/api/mascot/jobs/:jobId` | consulta owner-scoped |
| GET | `/api/mascot/jobs/:jobId/master/:masterId` | proxy privado owner-scoped |
| POST | `/api/mascot/jobs/:jobId/masters/:masterId/approve` | aprova sem gerar poses |
| POST | `/api/mascot/jobs/:jobId/pose-generations` | envia uma escolha para Normal, Ouvindo e Transcrevendo; bloqueado por flag até validação |

Sessão ausente ou expirada retorna `401 SESSION_EXPIRED`. O BFF não expõe autorização de GPU nesta rodada.

## Persistência Supabase

`mascot_attempts` relaciona `auth.users.id`, `attempt_id`, `modal_job_id`, status e Master escolhido. A constraint `unique(user_id, attempt_id)` impede duplicação; RLS limita SELECT/INSERT/UPDATE ao próprio `auth.uid()`. O fluxo comum usa a anon key com a sessão, nunca a service role.

## BFF → Modal v2

JWT HS256: `iss=puleiro-bff`, `aud=gru-modal`, `sub=<supabase-user-id>`, `jti=<uuid>`, `iat`, `exp<=120s`, `attempt_id`. Secret mínimo de 32 caracteres e somente servidor.

| Método | Rota | GPU nesta fase |
|---|---|---|
| POST | `/v2/mascot/jobs` | NÃO; `generationScheduled:false` |
| GET | `/v2/mascot/jobs?attempt_id=...` | NÃO |
| GET | `/v2/mascot/jobs/:jobId` | NÃO |
| GET | `/v2/mascot/jobs/:jobId/masters/:masterId` | NÃO |
| POST | `/v2/mascot/jobs/:jobId/master-generations` | bloqueada por kill switch |
| POST | `/v2/mascot/jobs/:jobId/masters/:masterId/approve` | NÃO; apenas aprovação |
| POST | `/v2/mascot/jobs/:jobId/pose-generations` | bloqueada por kill switch próprio |

## Identidade antes da geração

O Browser confirma uma categoria (`human`, `animal`, `object` ou `other`) e uma descrição curta antes do upload. Animais exigem espécie. O BFF valida esses campos e envia `subject_identity` ao Modal. O Modal não tenta transformar uma classificação implícita do modelo em fonte de verdade: o prompt é construído a partir da confirmação do usuário.

Para humanos, o contrato proíbe traços animais e a transferência de estampas de roupa para a pele. Para animais, preserva a espécie confirmada. Para objetos, preserva construção e materiais sem acrescentar anatomia animal.

## Três poses selecionadas

Após a aprovação do Master, a interface apresenta uma decisão por vez: Normal, Ouvindo e Transcrevendo. A revisão envia exatamente uma opção por função. A aprovação não chama poses; `POST .../pose-generations` é uma operação separada, idempotente e protegida por `POSE_GENERATION_ENABLED`.

O Master aprovado é a única referência visual das três imagens. A foto original não volta a ser usada para gerar cada pose de forma independente.

O contrato operacional assíncrono, os IDs distribuídos, o diagnóstico do incidente de 503 e o procedimento de suporte estão em [`POSE_OPERATION_DIAGNOSTIC.md`](./POSE_OPERATION_DIAGNOSTIC.md). Um aceite de poses retorna `202`; replay preserva a primeira `operationId` e não reserva outro worker.

Quando o conjunto termina, o status público inclui referências para exatamente três resultados. O Browser baixa cada imagem por `GET /api/mascot/jobs/:jobId/pose/:role`; o BFF valida sessão, attemptId e ownership e então usa o endpoint privado v2 correspondente. URLs internas e caminhos do Volume nunca chegam ao navegador.

## Compatibilidade

Rotas Modal v1, Firebase Auth e App Check do Android permanecem inalterados. A separação Supabase aplica-se somente ao Puleiro Web e termina no BFF.
