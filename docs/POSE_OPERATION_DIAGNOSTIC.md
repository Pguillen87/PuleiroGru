# Operações de poses: diagnóstico e rastreabilidade

Data: 2026-08-15. Ambiente investigado: staging. Nenhuma chamada de geração foi feita durante esta auditoria.

## Diagnóstico do incidente

Job observado: `job_7d43d3a8ccd3f70527352572f1768fa5`. Attempt: `0e75a83b-f855-46ff-8cdf-c66017e56d04`.

| Horário aproximado | Evidência | Camada |
| --- | --- | --- |
| 12:38:11–12:38:12 | cache do modelo validado | Modal/cache |
| 12:38:15 | `pose_job_queued`; o POST respondeu `202` após 7,81 s | Modal HTTP/fila |
| 12:38:19 | cold start do H100 iniciado | Modal worker |
| 12:39:14 | runtime pronto; cold start de 54.611 ms | Modal worker |
| 12:39:14–12:39:26 | worker chamou novamente a transição de início e recebeu `GuardRejected: Pose generation is already active with different choices.` | coordenação |
| posterior | BFF registrou POST de poses com `503` após 19,3 s | BFF |

A causa da falha do worker é comprovada: havia duas transições de início, uma na reserva HTTP e outra dentro do worker. A segunda foi removida. A causa exata do `503` posterior no BFF não é comprovável a partir dos logs antigos: não existiam `puleiroTraceId`, `operationId` e `requestId`, e não há segundo POST Modal correlacionável. Isso impede distinguir com certeza timeout/transporte de outra falha na fronteira BFF.

## Contrato de IDs

- `puleiroTraceId`: nasce da tentativa aleatória e permanece estável durante todo o nascimento; nunca deriva do UID.
- `attemptId`: identifica a tentativa owner-scoped e é persistido em `mascot_attempts`.
- `operationId`: identifica uma mutação. Em replay, o Modal devolve o ID da primeira reserva.
- `requestId`: novo em cada requisição HTTP. O Modal devolve `X-Request-ID`; o BFF preserva o próprio ID e expõe o ID Modal como `X-Modal-Request-ID`.
- Headers BFF → Modal: `X-Correlation-ID`, `X-Operation-ID` e `X-Bff-Request-ID`.

O navegador recebe somente IDs opacos e um `supportCode` curto em erros. Tokens, cookies e URLs privadas nunca são incluídos.

## Operação assíncrona

`POST /v2/mascot/jobs/{jobId}/pose-generations` valida identidade, ownership, Master e exatamente uma escolha para cada papel; cria ou recupera a operação em um coordenador serializado; reserva uma única execução; agenda o worker; e responde `202`. O request não espera GPU, cache, geração ou publicação.

A chave lógica inclui owner autenticado, `attemptId`, `jobId`, `masterId` e fingerprint das três escolhas. Um replay legítimo usa JWT novo, recebe a mesma `operationId` e não cria outro worker. A escolha fica imutável após a reserva. Cada `jti` do JWT é consumido uma vez até expirar.

## Eventos estruturados

Eventos de poses: `pose_request_received`, `pose_operation_created`, `pose_operation_replayed`, `pose_queue_reserved`, `pose_worker_spawned`, `pose_worker_started`, `pose_worker_completed`, `pose_worker_failed`, `pose_assets_verified` e `pose_set_ready`.

Campos permitidos: `timestamp`, `environment`, `deploymentEnvironment`, `service`, `event`, `result`, `durationMs`, `puleiroTraceId`, `attemptId`, `operationId`, `requestId`, `jobId`, `masterId`, `poseRole`, `safeErrorCode` e `httpStatus`.

São descartados por allowlist: token, JWT, cookie, service role, UID bruto, foto, Base64, URL privada, nome original, prompt, secret e conteúdo do asset.

## Proteção e retomada

Rotas mutáveis exigem Origin permitido, rejeitam `Sec-Fetch-Site: cross-site`, validam Content-Type e obtêm o owner apenas da sessão Supabase. Produção falha fechada sem `PULEIRO_ALLOWED_ORIGINS`. O timeout de leitura não altera o job para falha e não cria POST: a interface mantém a operação guardada e a retoma por GET após refresh, nova aba ou retorno.

## Procedimento de suporte

1. Solicitar somente o código seguro mostrado ao usuário.
2. Localizar o `requestId` no BFF e obter `puleiroTraceId`, `attemptId`, `operationId` e `jobId` dos campos permitidos.
3. Correlacionar `X-Modal-Request-ID` com o log HTTP Modal.
4. Verificar, nesta ordem: operação criada/replayed, reserva, spawn, início, verificação dos três assets e conclusão/falha.
5. Nunca pedir foto, token, cookie, URL assinada ou credencial ao usuário.
6. Não repetir POST com nova chave para resolver timeout; consultar a operação existente.

## Gate da próxima rodada

Esta fase prova coordenação e observabilidade sem GPU. Ela não aprova qualidade, custo ou estabilidade GPU. Um smoke futuro exige autorização explícita, staging isolado, uma única operação, flags controladas e rollback documentado.
