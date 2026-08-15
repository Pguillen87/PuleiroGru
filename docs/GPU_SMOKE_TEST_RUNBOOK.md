# Runbook — smoke controlado de GPU do Puleiro

> **Não executar durante a preparação do staging sem GPU.** Este documento é uma barreira operacional para uma autorização futura e explícita.

## Escopo e pré-condições

- ambiente Modal exclusivo: `gru-mascot-v2-staging`;
- branch Modal revisada e publicada: `feature/modal-v2-safe-integration`;
- produção `gru-mascot` inalterada;
- conta Supabase Auth de teste real, com ownership por `user.id` verificável;
- sessão SSR Supabase e RLS de `mascot_attempts` validadas;
- uma fotografia cujo uso foi autorizado pelo proprietário, sem dados pessoais desnecessários;
- foto sanitizada e teste de remoção de EXIF/GPS aprovado;
- `POSE_GENERATION_ENABLED=false` durante todo o ensaio;
- aprovação humana do teto financeiro e da janela de execução.

Sem todas as pré-condições, interromper antes de habilitar qualquer flag.

## Orçamento e limites

Preencher no momento da autorização:

| Controle | Valor aprovado |
|---|---|
| Responsável | PENDENTE |
| Data e janela | PENDENTE |
| Teto financeiro | PENDENTE |
| Duração máxima | PENDENTE |
| Conta de teste | PENDENTE |
| Hash/identificador da foto autorizada | PENDENTE |

Limites fixos do ensaio:

- uma tentativa (`attemptId`);
- um POST idempotente de autorização de Master;
- uma única geração de Masters;
- três Masters esperados;
- zero aprovação de Master;
- zero geração de poses;
- zero empacotamento e zero código.

## Preparação

1. Registrar os SHAs Web e Modal e confirmar worktrees limpas.
2. Confirmar por `modal app list --env main --json` que produção está saudável e sem alteração planejada.
3. Confirmar no staging: `REGISTRATION_ENABLED=true`, `MASTER_GENERATION_ENABLED=false`, `POSE_GENERATION_ENABLED=false`.
4. Validar `/health`, JWT curto, ownership, idempotência e retomada sem GPU.
5. Capturar baseline de runners: API/registro podem ter runners CPU; `QwenMasterWorker.generate` e `generate_poses` devem ter zero runners e zero inputs.
6. Confirmar alertas/logs sanitizados e correlationId disponível.
7. Obter autorização explícita do proprietário para o custo e para a foto.

## Execução autorizada futura

1. Habilitar `MASTER_GENERATION_ENABLED=true` **somente no staging** e manter poses desligadas.
2. Não alterar `main`/produção nem secrets de produção.
3. Autenticar com a conta de teste e registrar um job sem GPU.
4. Anotar `correlationId`, `attemptId` e `jobId` sem registrar tokens, URL privada ou bytes da imagem.
5. Enviar uma única autorização com idempotency key estável.
6. Não repetir o POST em timeout de leitura; consultar o job existente.
7. Acompanhar fila, cold start, tempo de inferência, estado e custo.
8. Confirmar exatamente três Masters owner-scoped.
9. Não aprovar Master e não acionar poses.
10. Desabilitar imediatamente `MASTER_GENERATION_ENABLED` ao concluir.

## Critérios de aprovação

- exatamente um agendamento GPU para a tentativa;
- nenhum agendamento duplicado em refresh, timeout ou múltiplas abas;
- três Masters válidos e privados;
- ownership e proxy privado preservados;
- nenhuma chamada de poses;
- custo e duração dentro dos limites aprovados;
- logs sem imagem, Base64, token, secret, EXIF, GPS ou nome original;
- kill switch volta a `false` e workers reduzem a zero.

## Critérios de interrupção imediata

- qualquer recurso, URL ou secret apontando para produção;
- custo ou duração ultrapassa o teto;
- mais de um agendamento GPU;
- tentativa de gerar poses;
- falha de ownership, exposição de imagem ou log sensível;
- erro de autenticação não explicado;
- job órfão ou estado impossível;
- ausência de correlationId ou telemetria necessária para auditar o ensaio.

## Rollback e desligamento

1. Definir `MASTER_GENERATION_ENABLED=false` no staging e redeployar somente o staging.
2. Confirmar que o endpoint de Master retorna `409 GENERATION_DISABLED`.
3. Confirmar runners/inputs GPU em zero após a janela de scaledown.
4. Preservar logs sanitizados e IDs técnicos para análise.
5. Se necessário, parar apenas o app `gru-mascot-v2-staging`; nunca executar stop/rollback sobre `gru-mascot`.
6. Documentar resultado, custo, duração e motivo de eventual interrupção antes de qualquer nova tentativa.
