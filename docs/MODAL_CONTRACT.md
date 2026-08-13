# Contrato Modal v2 — Puleiro do GRU

## Fronteiras de confiança

```text
Browser -- Firebase ID token + Web App Check --> Next.js BFF
Next.js BFF -- JWT curto e owner-scoped --> Modal v2
```

ID token e App Check terminam no BFF. O navegador não recebe URL, token ou secret do Modal. O `sub` do JWT curto é o UID verificado; o Modal ignora qualquer owner enviado no corpo.

## Browser → BFF

| Método | Rota | Função |
|---|---|---|
| POST | `/api/auth/session` | encerra ID token + App Check e cria sessão HttpOnly |
| POST | `/api/mascot/jobs` | sanitiza foto e registra job idempotente |
| GET | `/api/mascot/jobs/current` | retoma pelo `attemptId` em cookie HttpOnly |
| GET | `/api/mascot/jobs/:jobId` | consulta owner-scoped |
| GET | `/api/mascot/jobs/:jobId/master/:masterId` | proxy privado owner-scoped |
| POST | `/api/mascot/jobs/:jobId/masters/:masterId/approve` | aprova sem gerar poses |

Respostas de autenticação: `401 AUTH_REQUIRED/AUTH_INVALID`; App Check ausente: `403 APP_CHECK_REQUIRED`. O BFF não expõe endpoint de autorização de GPU nesta rodada.

## BFF → Modal v2

JWT HS256: `iss=puleiro-bff`, `aud=gru-modal`, `sub=<uid>`, `jti=<uuid>`, `iat`, `exp<=120s`, `attempt_id`. Secret mínimo de 32 caracteres, somente no servidor.

| Método | Rota | GPU nesta fase |
|---|---|---|
| POST | `/v2/mascot/jobs` | NÃO; retorna `generationScheduled:false` |
| GET | `/v2/mascot/jobs?attempt_id=...` | NÃO |
| GET | `/v2/mascot/jobs/:jobId` | NÃO |
| GET | `/v2/mascot/jobs/:jobId/masters/:masterId` | NÃO |
| POST | `/v2/mascot/jobs/:jobId/master-generations` | bloqueada por kill switch |
| POST | `/v2/mascot/jobs/:jobId/masters/:masterId/approve` | NÃO; apenas aprovação |
| POST | `/v2/mascot/jobs/:jobId/pose-generations` | bloqueada por kill switch próprio |

## Estados públicos

`registered`, `awaiting_generation_authorization`, `queued`, `generating_masters`, `awaiting_master_approval`, `master_approved`, `generating_poses`, `awaiting_set_approval`, `packaging`, `ready`, `failed`, `canceled`.

`ready` é reservado ao pacote publicado e utilizável pelo Android. Concluir uma etapa interna nunca produz `ready`.

## Idempotência e retomada

O servidor cria `attemptId`; o cookie contém somente esse identificador. A chave de registro deriva de owner + attempt. Duplo clique, timeout de leitura e refresh não criam outro POST de geração. Descoberta e leitura são sempre owner-scoped.

## Compatibilidade

Rotas v1 permanecem temporariamente inalteradas. A separação segura vale para v2; nenhum deploy foi realizado nesta fase.
