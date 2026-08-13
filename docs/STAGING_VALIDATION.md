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
- BFF local → staging: `201`, cookie HttpOnly de attempt, replay e retomada do mesmo job;
- estatística após o ensaio: `QwenMasterWorker.generate` e `generate_poses` com zero runners e zero inputs;
- app de produção permaneceu com zero tasks.

## Limite da validação

Firebase Web real não foi validado. A conta ativa do Firebase CLI recebeu `403 PERMISSION_DENIED` ao tentar criar o Web App no projeto `gru-mascote`. Nenhuma credencial Android ou de produção foi reutilizada como atalho. O staging Modal inicializa Firebase somente quando uma rota legada v1 é chamada; v2 usa exclusivamente o JWT curto do BFF.

## Dependências moderadas do npm audit

Os seis avisos formam uma única cadeia transitiva instalada por `firebase-admin@14.2.0`:

| Pacote | Versão | Caminho | Alcançabilidade neste código | Mitigação/decisão |
|---|---:|---|---|---|
| `firebase-admin` | 14.2.0 | direta | Auth, App Check e session cookies são usados | manter versão atual; sugestão automática é downgrade major para 10.3.0 |
| `@google-cloud/storage` | 7.22.0 | firebase-admin | storage não é importado pelo Puleiro | superfície não usada; acompanhar atualização upstream |
| `gaxios` | 6.7.1 | storage/google-auth | rede do Admin pode carregar a lib, mas não chama UUID com buffer | sem exploit conhecido no fluxo; não forçar override incompatível |
| `retry-request` | 7.0.2 | storage | storage não é usado | não alcançável no fluxo atual |
| `teeny-request` | 9.0.0 | storage/retry-request | storage não é usado | não alcançável no fluxo atual |
| `uuid` | 9.0.1 | gaxios/teeny-request | vulnerabilidade exige v3/v5/v6 com buffer fornecido; o Puleiro não chama essas APIs | risco residual baixo; atualizar quando a cadeia oficial aceitar `uuid>=11.1.1` |

Não foi aplicado downgrade, `npm audit fix --force`, major upgrade nem override transitivo sem validação. Risco de quebra de um override de `uuid`/Google libs é maior que o ganho neste fluxo, cuja operação vulnerável não é chamada.
