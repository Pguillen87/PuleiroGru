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

## Compatibilidade

Rotas Modal v1, Firebase Auth e App Check do Android permanecem inalterados. A separação Supabase aplica-se somente ao Puleiro Web e termina no BFF.
