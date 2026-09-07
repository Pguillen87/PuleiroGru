# Runbook pós-nascimento e preparação do pacote Android V1

Runbook operacional para QA/homologação do ciclo completo do mascote. O
runbook cobre somente o Puleiro Web/BFF e o contrato de importação; não inicia
GPU, não publica em Production e não altera o app Android.

## Estado esperado

O fluxo mantém as responsabilidades separadas:

| Plano | Responsabilidade | Evidência de conclusão |
| --- | --- | --- |
| Plano 1 | geração, QC v3 e hatch | tentativa owner-scoped com `hatched_at` preenchido |
| Plano 2 | nome, journal e ativação | `mascot_post_birth_profiles.state = ACTIVE` |
| Plano 3 | pacote e importação Android | `mascot_packages.status = ready` e Import Code válido |

A Web nunca deve declarar `HATCHED` por conta própria. O estado é projetado a
partir da tentativa e do job confirmado pelo servidor.

## Pré-voo de QA

- [ ] Branch contém as migrations aditivas e o commit funcional esperado.
- [ ] Supabase URL, anon key e service role estão configurados somente no
      ambiente de QA; a service role nunca é exposta ao cliente.
- [ ] `MASCOT_GENERATION_PROVIDER` aponta para o provider aprovado para QA.
- [ ] `INCUBATOR_FLOW_ENABLED` está explicitamente definido conforme o cenário.
- [ ] As flags de GPU permanecem desligadas quando o objetivo for somente
      validar estado, pacote ou importação.
- [ ] Bucket `mascot-packages` existe e permanece privado.
- [ ] Não há uso de usuário, token, foto ou código real de Production.

## Procedimento principal

### 1. Nascimento

1. Criar ou retomar uma incubação `async_incubator_v1`.
2. Confirmar que o job é owner-scoped e que a recuperação não recriou job,
   Master ou poses.
3. Aguardar `READY_TO_HATCH` somente quando Master aprovado, três roles e QC
   `pose-set-visual-v3` estiverem confirmados.
4. Chamar `POST /api/mascot/incubations/{jobId}/hatch` com origem confiável e
   sessão autenticada.
5. Confirmar resposta `HATCHED` e `hatchedAt` persistido. Um replay deve
   devolver o mesmo nascimento, não criar uma segunda tentativa.

### 2. Perfil pós-nascimento

1. Abrir `GET /api/mascot/incubations/{jobId}/profile`.
2. Confirmar `state = DRAFT`, `configurationRevision` e `journalConfig`.
3. Salvar o nome pelo `PATCH` usando a revisão observada.
4. Em `409 POST_BIRTH_PROFILE_CONFLICT`, preservar o rascunho local,
   recarregar o perfil e pedir nova confirmação; não sobrescrever a revisão.
5. Ativar pelo `POST /api/mascot/incubations/{jobId}/activate`.
6. Confirmar `state = ACTIVE`, `activatedAt` e replay idempotente quando a
   ativação já estiver concluída.

### 3. Biblioteca e retomada

1. Abrir `/meus-mascotes`.
2. Confirmar que o nome definitivo e o estado `ACTIVE` aparecem na prateleira.
3. Atualizar a página e confirmar que o perfil permanece owner-scoped e ativo.
4. Confirmar que mascotes de outros owners não aparecem nem em `items`, nem em
   `postBirthProfiles`.

### 4. Pacote V1

1. Chamar `POST /api/mascot/incubations/{jobId}/package`.
2. Confirmar resposta `201` na primeira publicação ou `200` no replay.
3. Confirmar `mascot_packages.status = ready` e exatamente três assets.
4. Validar no manifesto `schemaVersion = 1`, `assetPipelineVersion = 3`,
   `visibility = PRIVATE`, SHA-256, MIME, bytes e dimensões.
5. Confirmar que nenhuma ação de pacote agenda GPU e que falha de uma pose não
   promove o pacote parcialmente.

### 5. Importação Android

1. Chamar `POST /api/mascot/incubations/{jobId}/import-code` com sessão do
   owner e `Content-Type: application/json`.
2. Entregar o `code` recebido ao fluxo Android somente dentro do TTL informado
   por `expiresAt`.
3. Chamar `GET /api/mascot/import/{code}`.
4. Confirmar três URLs assinadas e as roles `NORMAL`, `LISTENING` e
   `TRANSCRIBING`.
5. No Android, validar novamente MIME, tamanho, dimensões e SHA-256 antes da
   promoção local atômica.
6. Repetir após expiração e confirmar `410 IMPORT_CODE_EXPIRED`; para uma
   revogação controlada, confirmar `410 IMPORT_CODE_REVOKED`.

## Matriz de falhas

| Sintoma | Código/HTTP | Ação segura |
| --- | --- | --- |
| hatch antes do QC | `GENERATION_NOT_READY` / 409 | aguardar estado confirmado; não forçar `HATCHED` |
| perfil ainda não nasceu | `POST_BIRTH_PROFILE_NOT_AVAILABLE` / 404 | confirmar `hatched_at` e owner |
| revisão concorrente | `POST_BIRTH_PROFILE_CONFLICT` / 409 | recarregar e reconciliar rascunho |
| perfil não ativo para pacote | `POST_BIRTH_PROFILE_NOT_ACTIVE` / 409 | salvar/ativar perfil primeiro |
| pose ou checksum divergente | `ASSET_MISSING` ou `INVALID_CHECKSUM` / 409 | interromper publicação e investigar origem |
| código desconhecido | `IMPORT_CODE_INVALID` / 404 | emitir novo código; não fazer brute force |
| código expirado | `IMPORT_CODE_EXPIRED` / 410 | emitir novo código |
| código revogado | `IMPORT_CODE_REVOKED` / 410 | confirmar revogação e emitir novo código |
| Supabase/Storage indisponível | código de storage / 503 | aguardar backoff; não expor detalhes internos |

## Observabilidade e evidências

Registrar somente IDs técnicos, etapa, resultado, duração, HTTP status,
`safeErrorCode`, `attemptId`, `jobId`, `operationId` e correlation IDs. Nunca
registrar Import Code em texto claro, hash completo, URL assinada, cookie,
token, foto ou conteúdo de asset.

As respostas que participam da incubação podem carregar `X-Correlation-Id`,
`X-Request-Id` e `X-Operation-Id`. Guardar esses IDs junto ao resultado do
teste de QA para investigação posterior.

## Rollback e encerramento

- Desligar flags para novas incubacões se houver regressão; não apagar attempts
  ou migrations ativas.
- Não marcar pacotes `ready` manualmente para contornar falhas.
- Reemitir códigos em vez de editar `expires_at` de um código existente.
- Se o problema for público/abusável, bloquear temporariamente a rota GET por
  WAF e preservar os registros para auditoria.
- Encerrar o ciclo somente após guardar commit, saída das suítes, branch e
  ambiente usados.

## Critério de prontidão para QA

O fluxo está pronto para homologação quando todos os itens do pré-voo,
procedimento principal e matriz de falhas aplicáveis estiverem comprovados,
com a ressalva de que rate limiting/WAF continua bloqueador para Production.
