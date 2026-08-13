# Puleiro do GRU — auditoria e plano de integração com o Modal

**Status:** plano para aprovação; nenhuma integração, geração, GPU, secret ou deploy foi alterado.

**Data da auditoria:** 2026-08-13.

**Repositório Web auditado:** `Pguillen87/PuleiroGru`, `main` em `69b8b13`.

**Modal auditado:** `Pguillen87/gru`, `modal_service`, branch mais recente localizada `feature/mascot-guided-pose-flow` em `f52a979`.
**Deploy consultado de forma somente leitura:** `automacao-guillenia--gru-mascot-api.modal.run`.

## 1. Resumo executivo

O Modal atual é um serviço assíncrono funcional e substancialmente mais avançado que a ideia-base antiga. Ele valida imagem, autenticação Firebase, App Check, ownership, idempotência e limites; persiste jobs e assets privados; usa Qwen-Image-Edit-2511 em H100; gera três Masters e já contém uma pipeline para catálogo de doze poses.

O Puleiro publicado na `main` ainda é somente o protótipo visual local. Um adapter Next.js existe em `origin/feature/modal-master-generation`, mas não está na `main` e **não é compatível o bastante para ativação real**.

Os bloqueios principais são:

1. o deploy ativo informou `generation_enabled=true`; não é seguro fazer um POST exploratório;
2. `POST /v1/mascot/jobs` agenda GPU automaticamente quando a geração está habilitada, embora exista também `POST .../generate-master`;
3. `POST .../approve-master` aprova e dispara imediatamente a geração de poses;
4. o adapter Web usa Firebase ID token e App Check estáticos, que expiram e colapsam ownership de usuários diferentes;
5. o adapter reduz três Masters a apenas um e “Ver outra opção” cria outro job, desperdiçando os candidatos já pagos;
6. jobs Web não sobrevivem a refresh e o timeout de 90 segundos é próximo demais do cold benchmark observado;
7. `pose_choices` ainda existe no request/job, mas o catálogo gera as doze opções e o manifest usa defaults;
8. documentação recente do Modal ainda descreve partes da pipeline anterior e não reflete integralmente o código/deploy;
9. não há política implementada de retenção/exclusão nem publicação de pacote/código para o Android.

Recomendação: primeiro estabilizar um contrato BFF ↔ Modal com autenticação servidor-servidor, separar registro de job de autorização de GPU e separar aprovação do Master de geração de poses. Só então integrar o fluxo até `awaiting_master_approval`, mantendo o provider mock como padrão.

## 2. Escopo, fontes e grau de certeza

### 2.1 Fontes de verdade usadas

1. código e testes em `modal_service` na branch `feature/mascot-guided-pose-flow`;
2. OpenAPI e `/health` do deploy ativo, consultados apenas com GET;
3. código Android atual de `MascotApi`, `MascotRepository` e `CustomMascotStore`;
4. branch remota do adapter Web `origin/feature/modal-master-generation`;
5. histórico Git recente;
6. documentação recente do Modal;
7. `docs/MODAL_CONTRACT.md` da branch Web de integração;
8. `GRU_Mascote_Modal_Ideia_Base.txt`, apenas como intenção histórica.

### 2.2 Legenda de evidência

- **Comprovado:** observado no código, teste ou resposta ativa.
- **Indicado:** registrado em Git/documentação, sem prova de runtime atual.
- **Provável:** inferência técnica explícita.
- **Desconhecido:** falta evidência; exige decisão ou teste autorizado.

### 2.3 Limites desta auditoria

- Nenhum POST foi enviado ao Modal.
- Nenhuma GPU foi acionada.
- Nenhum token, App Check, secret ou asset privado foi lido.
- Nenhum deploy foi executado.
- O deploy não expõe o SHA do código; a correspondência exata entre o deploy e `f52a979` é **desconhecida**. O OpenAPI e a versão do catálogo indicam forte compatibilidade com essa linha de código.
- Os testes Python foram executados sem GPU: **67 passaram**.

## 3. Inventário dos projetos

### 3.1 Puleiro Web publicado

- Caminho local: `C:\Users\PAULO\.codex\worktrees\cb4b\Gru\web`.
- Repositório: `https://github.com/Pguillen87/PuleiroGru.git`.
- Branch: `main`.
- Stack: Next.js 16.3.0, React 19.2.8, TypeScript 5.9.3, App Router, CSS próprio, Playwright.
- Estado: protótipo visual `Entrada → Preparação → Reveal`; sem APIs, autenticação, storage ou Modal na `main`.
- Adapter em revisão: `origin/feature/modal-master-generation`, commit `58266f3`.

### 3.2 Serviço Modal real

- Repositório: `https://github.com/Pguillen87/gru.git`.
- Diretório: `modal_service`.
- Worktree limpo auditado: `C:\Users\PAULO\.codex\worktrees\modal-persistent-qwen\Gru`.
- Branch: `feature/mascot-guided-pose-flow`.
- SHA: `f52a97963a084ccd02d514d15ee53053f1151547`.
- Deploy encontrado: `https://automacao-guillenia--gru-mascot-api.modal.run`.

### 3.3 GRU Android

O Android atual ainda possui um cliente direto do Modal, com Firebase Anonymous Auth, App Check, polling, retomada local, checksum e promoção atômica. Isso é diferente da fronteira futura aprovada para o Puleiro, na qual o site cria e o Android recebe um código. A migração deve ser incremental; não se deve quebrar o cliente Android antes de existir resolver de código, pacote publicado e compatibilidade comprovada.

## 4. Estado atual comprovado do Modal

### 4.1 Endpoints ativos

O OpenAPI ativo expôs:

| Método | Endpoint | Comportamento observado no código |
| --- | --- | --- |
| GET | `/health` | público, sem GPU |
| POST | `/v1/mascot/jobs` | valida, persiste e, com kill switch ligado, agenda Master |
| GET | `/v1/mascot/jobs/{job_id}` | owner-only; polling e reconciliação |
| GET | `/v1/mascot/idempotency/{key}` | recupera criação pelo UID + chave |
| POST | `/v1/mascot/jobs/{job_id}/generate-master` | agenda Master explicitamente; redundante com create ativo |
| POST | `/v1/mascot/jobs/{job_id}/approve-master` | aprova e agenda poses imediatamente |
| POST | `/v1/mascot/jobs/{job_id}/cancel` | cancela estado e tenta cancelar a FunctionCall |
| GET | `/v1/mascot/jobs/{job_id}/result` | entrega manifest de poses quando `COMPLETED` |
| GET | `/v1/mascot/jobs/{job_id}/masters/{master_id}` | stream privado PNG owner-only |
| GET | `/v1/mascot/jobs/{job_id}/poses/{pose_id}` | stream privado com checksum |
| POST | `/v1/mascot/jobs/{job_id}/consistency` | rota legada/bloqueada por templates |
| POST | `/v1/mascot/jobs/{job_id}/generate-poses` | agenda poses no estado aceito |
| POST | `/v1/mascot/jobs/{job_id}/retry-pose` | rota legada/bloqueada por templates |

O OpenAPI não declara security schemes e documenta respostas apenas parcialmente. A proteção existe no código, mas a especificação gerada não é um contrato suficiente para clientes.

### 4.2 Health ativo

Resposta observada em 2026-08-13:

```json
{
  "service": "gru-mascot",
  "environment": "development",
  "generation_enabled": true,
  "templates_installed": false,
  "model_configured": true,
  "pose_catalog_size": 12,
  "pose_catalog_version": "poses-v3-visual-catalog"
}
```

Consequência: um POST válido pode gerar custo. A documentação diz que o padrão seguro é `false`, mas o runtime está `true`.

### 4.3 Autenticação atual

- O Android cria/reusa um usuário anônimo no Firebase Auth.
- O SDK emite um Firebase ID token curto; o provider renova quando necessário por `getIdToken(false)`.
- O Android obtém App Check por Play Integrity em release e Debug Provider em debug.
- O Modal valida assinatura, expiração, audience `gru-mascote`, issuer e UID do ID token.
- O Modal valida App Check com Firebase Admin.
- O UID verificado é o proprietário; o payload não aceita `user_id`.
- Todo `/v1/mascot/**` exige ambos os tokens.
- Escritas sensíveis exigem `X-Idempotency-Key`.
- O secret `gru-mascot-firebase-admin` fica no Modal e contém a credencial Firebase Admin.

### 4.4 Estados e modelo de execução

Estados internos atuais:

```text
QUEUED
VALIDATING_INPUT
READY_FOR_GENERATION
GENERATING_MASTER
AWAITING_MASTER_APPROVAL
CONSISTENCY_TEST
CONSISTENCY_FAILED
READY_FOR_POSES
GENERATING_POSES
COMPLETED
FAILED
CANCELED
```

Jobs são assíncronos. Estado operacional fica em Modal Dict; imagens ficam em Modal Volume. O worker mantém apenas a pipeline carregada. O polling reconcilia Masters após 15 s e falha worker estagnado após 300 s.

### 4.5 Modelo, GPU e geração

- Modelo: `Qwen/Qwen-Image-Edit-2511`, revisão fixa.
- LoRA: `Qwen-Image-Edit-2511-Lightning`, 4 steps, revisão fixa.
- GPU: H100.
- Masters: três seeds `0, 1, 2`.
- Entrada reduzida para no máximo 1024 px no worker.
- Timeout de desenvolvimento do worker: 900 s.
- `min_containers=0`, `max_containers=1`, uma entrada por container.
- `scaledown_window=45` s.
- Sem retry automático de inferência.
- Após aprovação, a branch atual pode gerar doze poses: quatro opções para cada papel `normal`, `listening` e `transcribing`.
- O request aceita `pose_choices`, mas o worker percorre as doze opções e o manifest usa `DEFAULT_POSE_CHOICES`; a seleção armazenada não restringe os outputs atuais.

### 4.6 Persistência e storage

| Recurso | Conteúdo | Acesso atual |
| --- | --- | --- |
| `gru-mascot-assets` Volume | original, Masters, poses, temporários, templates | privado ao app Modal |
| `gru-mascot-models` Volume | cache versionado do modelo | administrativo/worker |
| `gru-mascot-jobs` Dict | estado de job | API/coordenador |
| `gru-mascot-idempotency` Dict | replay de create/operação | API/coordenador |
| `gru-mascot-usage` Dict | quotas e reserva estimada | API/coordenador |
| `gru-mascot-firebase-admin` Secret | credencial Admin | somente API Modal |

Não existe limpeza automática habilitada. A documentação chama originais e Masters rejeitados de temporários, mas não define nem executa TTL. O original é persistido como recebido em `source.bin`; a validação decodifica a imagem, mas não remove EXIF antes de armazená-la.

### 4.7 Idempotência, limites e kill switch

- Job ID determinístico por hash de UID + idempotency key.
- Reuso da chave com digest ou poses diferentes é rejeitado.
- Coordinator serializa registro, quotas e reserva de custo.
- Desenvolvimento: 100 jobs/UID/dia, 100 globais/dia, 30 gerações/UID/dia.
- Reserva interna estimada: US$ 1 por autorização de geração; teto global e por UID de US$ 30/dia.
- Essa reserva não é faturamento real.
- Kill switch verificado no scheduler e no worker.
- Risco: a geração de poses após aprovação não faz uma nova reserva explícita de custo. O ledger atual pode subestimar o trabalho total.

### 4.8 Latência e custo conhecidos

Benchmark de 2026-08-08, Master-only, imagem sintética:

| Cenário | Worker total | Inferência dos 3 Masters | Interpretação de custo |
| --- | ---: | ---: | --- |
| cold bem-sucedido | 76,864 s | ~7 s | aproximadamente US$ 0,084 pela tarifa histórica, antes de auxiliares |
| warm | 19,995 s | ~7 s | aproximadamente US$ 0,022 pela tarifa histórica, antes de auxiliares |

O relatório agregado de uma tentativa falha + cold + warm + CPU/cache foi US$ 0,25776815. Esses valores são históricos, não preço garantido. O custo das doze poses atuais não foi medido; portanto é **desconhecido** e deve ser tratado como potencialmente material.

### 4.9 Observabilidade existente

- Middleware HTTP gera `X-Request-ID` aleatório e registra método, endpoint, status, duração e content-length.
- `InferenceObserver` usa `trace_id` derivado por hash do `job_id`.
- Eventos incluem cache, container, load, CUDA, job, geração, pós-processamento, escrita e falha.
- Allowlist impede imagem, Base64, UID, token, URL privada e credenciais.
- Não há hoje um correlation ID recebido do Puleiro cobrindo Browser → BFF → Modal.

### 4.10 Testes atuais

Foram executados localmente, sem GPU:

```text
67 passed in 1.68s
```

Cobrem domínio, transições, segurança pura, validação de imagem, quotas, idempotência, cache, lifecycle persistente, reconciliação, catálogo e contrato estrutural do worker. Não provam deploy, Firebase real, App Check real, Volume ativo, billing nem GPU.

## 5. Alterações recentes do Modal

| Mudança | Commit | Arquivos centrais | Evidência/motivo aparente | Impacto no Puleiro |
| --- | --- | --- | --- | --- |
| Pipeline Qwen persistente por container | `52e4bf0` | `app.py`, `model_cache.py`, `persistent_runtime.py` | reduzir cold reload e custo | polling precisa tolerar cold/warm diferentes |
| Reconciliação de worker/artefatos | `da8094d`, `d30fa3b`, `38c9ed6` | `app.py`, testes | evitar job preso e Volume desatualizado | melhora retomada, mas timeout Web de 90 s continua frágil |
| Preservação de identidade humana/animal | `7537be1` | `catalog.py`, testes | impedir híbridos/espécie errada | intenção antiga foi atualizada no prompt real |
| Poses escolhidas pelo usuário | `f4c4eb6` | domínio, coordinator, catálogo, worker | três papéis operacionais explícitos | create ganhou `pose_choices`; adapter Web não envia |
| Catálogo visual com 12 poses | `c9c280a` | `app.py`, `catalog.py`, testes | quatro opções por papel | contrato antigo de três outputs ficou obsoleto |
| Fluxo guiado de escolha no Android | `5cc7e53`, `dc774ee` | Android | escolha local do catálogo | não pertence ao MVP Web atual, mas afeta contrato futuro |
| Registro de saúde do catálogo | `f52a979` | `app.py` | expor tamanho/versão em health | confirma linha do deploy, mas não o SHA exato |

## 6. Comparação entre intenção, documentação e código

| Assunto | Documento antigo | Código atual | Compatível? | Ação necessária |
| --- | --- | --- | --- | --- |
| Criação do job | Android envia foto diretamente | Modal aceita JSON Base64; Web propõe multipart ao BFF | Parcial | manter Browser → BFF; BFF traduz sem expor Modal |
| Consulta de status | pouco definida | polling owner-only e reconciliação | Sim | normalizar estados no BFF |
| Imagem mestre | um Master conceitual | três candidatos Master privados | Parcial | expor candidatos um por vez sem novo job |
| Aprovação | aprova antes das poses | aprovação dispara poses imediatamente | Não | separar aprovação de `generate-poses` |
| Rejeição | nova geração ou foto | sem endpoint de rejeição | Parcial | decisão local; novo job só após esgotar candidatos e regra de custo |
| Nova tentativa | repetir geração | novo job; seeds fixos e mesma entrada podem repetir resultado | Parcial | idempotência de tentativa e estratégia explícita de variação |
| Três poses | normal, ouvindo, transcrevendo | catálogo de 12; Android seleciona 3 | Parcial | decidir se Web escolhe antes/depois; não integrar agora |
| Empacotamento | conjunto salvo | Modal entrega manifest de poses, sem pacote distributivo | Não | serviço de publicação fora do worker de geração |
| Código do mascote | inexistente | inexistente | Não | registry código → manifest em fase futura |
| Autenticação | não definida | Firebase Anonymous + App Check Android | Parcial | BFF precisa identidade recuperável e auth servidor-servidor |
| App Check | não definido | implementação orientada ao Android | Não para BFF | Web App Check em Browser → BFF; não copiar token Android |
| Idempotência | não definida | sólida no Modal; frágil no adapter Web | Parcial | bind user + entitlement + digest + attempt no BFF |
| GPU/kill switch | não definido | kill switch duplo, mas runtime ativo `true` | Parcial | desligar/verificar antes de qualquer teste sem GPU |

### 6.1 Documentos desatualizados

- `GRU_Mascote_Modal_Ideia_Base.txt`: obsoleto tecnicamente; escolhe OmniGen2, diz que não é necessário site e põe Android como criador.
- `modal_service/API.md`: não lista `generate-master`, descreve poses como bloqueadas por templates, mas o código atual agenda catálogo de poses após aprovação.
- `pose_choices`: permanece no schema e no JobRecord, porém o catálogo atual gera doze opções e publica defaults; o nome do campo pode induzir um cliente a esperar geração seletiva.
- `modal_service/README.md` e `COSTS.md`: o default de código continua false, porém o deploy ativo está true.
- `docs/MODAL_CONTRACT.md` do Puleiro: correto como isolamento inicial, porém não representa três Masters, `pose_choices`, `generate-master`, recuperação por idempotência, aprovação que dispara poses nem autenticação renovável.
- OpenAPI ativo: rotas corretas, mas sem security schemes e sem schemas completos de resposta/erro.

## 7. Auditoria do adapter atual do Puleiro

O adapter está somente em `origin/feature/modal-master-generation` (`58266f3`).

| Arquivo do Puleiro | Comportamento atual | Modal real | Risco | Correção proposta |
| --- | --- | --- | --- | --- |
| `modal-provider.ts` | tokens estáticos no constructor | ID token e App Check são curtos/renováveis | bloqueante: expiração e owner único | credential provider servidor-servidor por chamada |
| `modal-provider.ts` | create com foto Base64 | contrato aceita também `pose_choices` | médio | não enviar poses no MVP; definir default no Modal ou contrato v2 |
| `modal-provider.ts` | primeiro Master somente | retorna três Masters | alto: desperdiça candidatos | armazenar lista e revelar sequencialmente |
| `modal-provider.ts` | considera `MASTER_APPROVED` final | estado não existe no domínio | médio | mapper exaustivo com fallback seguro |
| `modal-provider.ts` | erros viram mensagem por status apenas | envelope tem `detail.code`, retry e charge | alto | parser tipado e allowlist de erros públicos |
| `client.ts` | timeout total 90 s | cold worker medido 76,864 s + fila/rede | alto | polling retomável, sem deadline destrutivo; UI pode encerrar espera sem perder job |
| `client.ts` | retry de polling oculta alguns erros | 401 exige renovar sessão; 404/409 têm semântica | alto | política por código, uma renovação de credencial, sem retry cego de writes |
| `jobs/route.ts` | aceita `X-Request-Id` do navegador | key define job/ownership/idempotência | alto | BFF valida/gera attempt ID e persiste binding |
| `jobs/route.ts` | sem identidade/ownership Web | Modal owner é UID estático do env | bloqueante | sessão recuperável e owner verificado no BFF |
| proxy Master | valida IDs e MIME, `private,no-store` | Modal entrega checksum | parcial | verificar SHA-256 antes/depois do proxy e autorização local |
| `useMascotGenerationFlow.ts` | estado só em memória | Modal persiste job | alto | persistir referência server-side e retomar por usuário |
| `MasterDecisionStage` | “Ver outra” cria outro job | três candidatos já existem | alto: custo e repetição | avançar para próximo candidato; novo job é operação distinta |
| aprovação local | não chama Modal | Modal approval dispara poses | seguro no protótipo, incompleto no real | manter desacoplado até contrato de aprovação sem poses |
| logs | `console.error` com mensagem | observabilidade pede correlation | médio | logger estruturado/sanitizado, sem token/bytes/URL |

Pontos positivos reaproveitáveis: interface provider, provider mock padrão, validação real com Sharp, proxy privado, IDs limitados, cache privado, polling cancelável, composição por estados e testes Playwright.

## 8. Arquitetura recomendada

```text
Browser não confiável
  → sessão + CSRF/App Check Web + upload multipart
Next.js BFF
  → valida identidade, ownership, entitlement, payload e idempotência
  → remove metadata e normaliza imagem
  → persiste tentativa/job público retomável
  → autenticação servidor-servidor curta
Modal
  → registra job sem GPU
  → recebe autorização explícita para gerar Master
  → persiste estado e assets privados
Storage/publicador futuro
  → pacote versionado + manifest + SHA-256
Registry futuro
  → código opaco → manifest autorizado
GRU Android
  → resolve código, baixa, valida e instala atomicamente
```

### 8.1 Fronteiras

- Browser nunca recebe token Modal, Firebase Admin, App Check interno, path de Volume ou URL privada.
- BFF é a boundary de autorização do produto; botão desabilitado não é segurança.
- Modal é executor assíncrono, não sistema de conta, checkout, biblioteca ou código.
- Publicação e código são serviços de produto posteriores, não responsabilidade do worker GPU.
- Android não recebe stack Web e não precisa conhecer estados internos de geração.

## 9. Fluxo técnico recomendado

### 9.1 Fluxo inicial

```text
foto selecionada
→ validação local indicativa
→ upload multipart ao BFF
→ validação/normalização no servidor
→ criação idempotente da tentativa
→ registro do job no Modal sem GPU
→ validação de entitlement e autorização explícita
→ geração do Master
→ polling retomável pelo BFF
→ candidatos Master disponíveis
→ proxy seguro da imagem
→ reveal de um candidato
→ gostei / ver próximo candidato
→ aprovação registrada sem gerar poses automaticamente
```

“Ver outra opção” primeiro percorre os candidatos do mesmo job. Uma nova geração só aparece depois de esgotados/rejeitados os candidatos e precisa de uma nova `attemptId`, regra comercial e idempotência próprias.

### 9.2 Fluxo futuro

```text
Master aprovado
→ escolha/geração de poses
→ validação de consistência
→ aprovação do conjunto
→ empacotamento
→ manifest versionado com SHA-256
→ publicação privada
→ código opaco
→ Android resolve, baixa, valida e instala
```

Este fluxo não será implementado na primeira integração.

## 10. Contrato recomendado Browser → Next.js

### 10.1 Criar tentativa

```http
POST /api/v1/mascot/jobs
Content-Type: multipart/form-data
Idempotency-Key: <UUID emitido/validado pelo BFF>
X-Puleiro-Trace-Id: <opcional; BFF substitui se inválido>
```

Campos:

- `photo`: JPEG/PNG/WebP, máximo configurado;
- `attemptId`: identificador opaco previamente emitido pelo BFF;
- nenhum token Modal e nenhum `userId` livre.

Resposta `202`:

```json
{
  "jobId": "pub_job_...",
  "status": "queued",
  "stage": "preparing",
  "messageCode": "MASCOT_JOB_ACCEPTED",
  "traceId": "...",
  "pollAfterMs": 1500
}
```

`uploading` é estado local do cliente enquanto o multipart ainda não terminou e não deve ser apresentado como estado persistido consultável do job.

### 10.2 Consultar job

```http
GET /api/v1/mascot/jobs/{publicJobId}
```

Resposta `200` com estado público, `messageCode`, `updatedAt`, candidato atual quando autorizado e ações permitidas. O BFF consulta ownership; IDs Modal não precisam ser iguais aos IDs públicos.

```json
{
  "jobId": "pub_job_...",
  "status": "awaiting_master_approval",
  "messageCode": "MASTER_READY",
  "allowedActions": ["view_master", "next_candidate", "approve_master"],
  "preservedState": "job_and_candidates",
  "traceId": "..."
}
```

`allowedActions` usa enum fechado: `wait`, `view_master`, `next_candidate`, `approve_master`, `reauthenticate`. O frontend não deduz ações de estados internos.

### 10.3 Descoberta e recuperação

```http
GET /api/v1/mascot/jobs/active
GET /api/v1/mascot/attempts/{attemptId}
```

- owner-scoped e autenticados;
- recuperam o handle quando refresh, storage local ou resposta do POST forem perdidos;
- a mesma `attemptId`/idempotency key nunca cria outro job;
- se houver mais de uma tentativa ativa, o endpoint devolve coleção ordenada e não escolhe silenciosamente qual retomar; a regra de produto permanece pendente.

### 10.4 Master privado

```http
GET /api/v1/mascot/jobs/{publicJobId}/masters/{publicMasterId}
```

- sessão e ownership obrigatórios;
- BFF resolve referência interna;
- confere SHA-256;
- `Content-Type: image/png`, `Cache-Control: private, no-store`, `nosniff`;
- pode usar redirect assinado curto somente depois de política aprovada.

### 10.5 Decisão do Master

```http
POST /api/v1/mascot/jobs/{publicJobId}/master-decision
Idempotency-Key: <operation key>
Content-Type: application/json

{ "decision": "approve", "masterId": "pub_master_..." }
```

ou

```json
{ "decision": "next_candidate" }
```

Na primeira fase, `approve` apenas registra aprovação. Não gera poses. `next_candidate` não cria GPU job. Nova geração será endpoint/operação posterior.

### 10.6 Códigos HTTP públicos

| HTTP | Uso |
| --- | --- |
| 200 | consulta/decisão idempotente concluída |
| 202 | criação ou operação assíncrona aceita |
| 400 | payload/identificador inválido |
| 401 | sessão ausente/expirada |
| 403 | sem entitlement/permissão, sem revelar recurso |
| 404 | job não existe ou não pertence ao usuário |
| 409 | transição inválida/idempotency conflict |
| 413 | upload acima do limite |
| 415 | formato real não suportado |
| 422 | imagem decodificável, mas fora das regras |
| 429 | quota/abuso/custo |
| 502 | resposta Modal inválida |
| 503 | dependência temporariamente indisponível |
| 504 | BFF não obteve resposta imediata; job pode continuar |

### 10.7 Cancelamento

Fechar aba, abortar fetch ou atingir timeout **não cancela o job**. Um endpoint de cancelamento pode ser reservado, mas não deve ser exposto até o produto definir confirmação, cobrança e retomada. O BFF nunca deve inferir cancelamento por desconexão.

## 11. Contrato recomendado Next.js → Modal

### 11.1 Alteração necessária no Modal

Estabilizar semântica explícita:

1. `POST /v2/mascot/jobs` registra e armazena, sempre termina em `READY_FOR_GENERATION`;
2. `POST /v2/mascot/jobs/{id}/generate-master` é a única operação que reserva custo e agenda GPU;
3. `POST /v2/mascot/jobs/{id}/approve-master` apenas registra aprovação;
4. `POST /v2/mascot/jobs/{id}/generate-poses` é separado e futuro;
5. respostas e erros têm schemas versionados;
6. `/v1` permanece temporariamente para o Android até a migração.

Isso remove ambiguidade e impede custo antes de entitlement/autorização.

### 11.2 Headers

```text
Authorization: Bearer <token interno curto>
X-Idempotency-Key: <key derivada da operação>
X-Puleiro-Trace-Id: <UUIDv7 validado>
Content-Type: application/json
```

Não encaminhar cookie, ID token ou App Check do navegador como credencial servidor-servidor.

### 11.3 Payload

Enquanto o Modal aceitar apenas JSON, o BFF envia Base64 depois de validar e normalizar. Em uma evolução, preferir upload privado direto por URL assinada curta ou referência de objeto, evitando expansão Base64 e memória duplicada. A referência deve ser one-time, owner-bound e não pública.

### 11.4 Timeout e retry

- connect: 5–10 s;
- resposta de comando: 20–30 s;
- polling: deadline por request curto, não deadline destrutivo do job;
- GET pode repetir com exponential backoff + jitter;
- POST só repete com a mesma idempotency key após timeout/erro transitório;
- 401: renovar credencial interna uma vez;
- 409/422: não repetir;
- 429: respeitar `retry_at_utc`/Retry-After;
- circuit breaker para falhas repetidas;
- nunca iniciar novo job para “resolver” timeout de leitura.

## 12. Estados públicos normalizados

```ts
type ClientFlowState =
  | "selecting_photo"
  | "uploading"
  | "waiting_for_job"
  | "showing_result";

type PublicJobStatus =
  | "queued"
  | "processing"
  | "awaiting_master_approval"
  | "master_approved"
  | "generating_poses"
  | "awaiting_set_approval"
  | "packaging"
  | "ready"
  | "failed"
  | "canceled";
```

Mapeamento inicial:

| Modal interno | Público | Observação de UX |
| --- | --- | --- |
| BFF recebendo/normalizando | `ClientFlowState.uploading` | ainda não é job persistido |
| `QUEUED`, `VALIDATING_INPUT`, `READY_FOR_GENERATION` | `queued` | não revelar fila técnica |
| `GENERATING_MASTER` | `processing` | “Criando seu mascote…” |
| `AWAITING_MASTER_APPROVAL` | `awaiting_master_approval` | libera reveal e decisão |
| `CONSISTENCY_TEST`, `READY_FOR_POSES` | `master_approved` | futuro; não mostrar no MVP |
| `GENERATING_POSES` | `generating_poses` | futuro |
| `COMPLETED` | `awaiting_set_approval` | `ready` somente após pacote/publicação concluídos |
| `FAILED` | `failed` | código público sanitizado |
| `CANCELED` | `canceled` | futuro |
| estado desconhecido | `processing` por curto período + alerta operacional | nunca quebrar UI; não mascarar indefinidamente |

Mensagens vêm por `messageCode` traduzível, não texto final do Modal.

## 13. Autenticação e App Check

### 13.1 Opção A — Firebase Auth + App Check ponta a ponta

- Browser autentica com Firebase Auth.
- Web App Check usa um provider apropriado ao navegador.
- BFF valida sessão/ID token e App Check.
- BFF obtém/encaminha credencial Firebase aceita pelo Modal.

**Prós:** reutiliza Firebase e ownership atual.

**Contras:** encaminhar prova de app Web através do BFF confunde attestation do cliente com identidade do servidor; ID token de usuário não autentica o BFF; renovação e múltiplos mercados ficam acoplados; não deve usar token estático.

### 13.2 Opção B — sessão do usuário no BFF + autenticação dedicada BFF → Modal

- Browser usa Firebase Auth inicialmente, ou outro provider futuro, para conta recuperável.
- Browser → BFF pode exigir Web App Check/antiabuso.
- BFF valida user, entitlement e ownership.
- BFF emite token interno curto, com `iss`, `aud`, `sub`, `jti`, `exp`, operation e trace; assinatura assimétrica/KMS e rotação.
- Modal valida apenas o emissor interno nas rotas v2.
- Rotas v1 preservam Firebase + App Check para o Android durante migração.

**Prós:** boundary correta, rotação, auditoria, menor acoplamento ao browser/Android, compatível com China e auth futura.

**Contras:** exige verificador novo, gestão de chaves e dual auth temporária.

### 13.3 Recomendação

Adotar **Opção B**. Firebase Auth pode continuar como identidade inicial do usuário, mas App Check Web termina no BFF. Next.js server → Modal usa autenticação dedicada curta. Nenhuma credencial estática em `.env` deve representar usuário final.

### 13.4 App Check

- Android atual: manter App Check Android nas rotas v1 enquanto existirem.
- Browser: usar configuração própria de Firebase Web App, se Firebase for mantido.
- BFF → Modal: não exigir App Check de Android ou browser; usar service auth.
- O Modal pode manter App Check como defesa adicional apenas para clientes Firebase diretos, não como identidade do servidor.

### 13.5 Rotação e expiração

- ID token Firebase: curto e renovado pelo SDK; nunca armazenado como env permanente.
- App Check: curto e obtido pelo SDK adequado; nunca estático.
- Token interno: 2–5 minutos, audience fixa, `jti`, relógio tolerado e rotação de chave por `kid`.
- Secrets apenas no servidor/secret manager; nenhuma variável `NEXT_PUBLIC_*`.

## 14. Jobs, retomada e falhas

| Situação | Comportamento recomendado |
| --- | --- |
| refresh | carregar job público ativo da conta e retomar polling |
| navegador fechado | job continua; usuário retorna pela biblioteca privada/tentativa ativa |
| perda de rede | UI mostra conexão interrompida; não cria novo job |
| timeout do frontend | encerrar espera local, preservar job e oferecer retorno |
| Modal ainda processando | BFF continua com fonte de verdade persistida/reconciliável |
| resultado pronto | próxima consulta retorna candidato e dispara reveal uma vez por cliente |
| falha GPU | estado failed com código sanitizado; nenhum retry automático pago |
| falha storage após geração | job não vira sucesso até checksum/asset confirmado |
| POST duplicado | mesma key + mesmo digest = mesmo job; diferente = 409 |
| resposta do create perdida | recuperar por idempotency key, nunca POST com chave nova |
| job órfão | reconciliador periódico e estado operacional explícito |

Persistência do BFF requer um repositório de jobs/ownership. A tecnologia de banco permanece decisão futura; a interface e o contrato devem ser definidos antes da implementação.

O BFF também separa `resultAvailableAt` de `revealedAt`. No retorno, um resultado já revelado abre no quadro final; o nascimento não se repete automaticamente. Antes da biblioteca privada, a recuperação ocorre pelos endpoints owner-scoped de tentativa ativa.

## 15. Upload, storage e privacidade

### 15.1 Upload

- JPEG, PNG e WebP;
- máximo inicial 10 MiB;
- 256–4096 px por lado;
- conferir MIME declarado e formato decodificado;
- limitar pixels antes de decode completo;
- remover EXIF/metadados e reencodar no BFF;
- gerar filename no servidor;
- proteção de rate, CSRF, auth, App Check/antiabuso e content-length;
- não logar filename original, bytes, Base64 ou dimensões potencialmente identificadoras sem necessidade.

### 15.2 Política mínima proposta

| Item | Storage | Acesso | Retenção | Exclusão/owner | Risco |
| --- | --- | --- | --- | --- | --- |
| foto original | privado, temporário | worker/BFF autorizados | TTL a decidir | owner pode pedir exclusão; job-scoped | dado pessoal/EXIF |
| Master rejeitado | privado, temporário | owner e operação | TTL a decidir | cleanup idempotente | custo/storage |
| Master aprovado | biblioteca privada | owner | enquanto compra/conta válida; política a decidir | não apagar ao despublicar | ownership pago |
| poses | biblioteca privada | owner/Android autorizado | igual ao mascote comprado | job/package scoped | integridade |
| pacote final | object storage versionado | resolver autorizado | enquanto disponível ao owner | revogar código sem destruir ownership | distribuição |
| logs | plataforma observável | operação restrita | TTL curto a decidir | sanitização, não asset | reidentificação |

Não existe hoje garantia implementada de TTL ou exclusão remota. Nenhuma UI deve prometer isso antes da rotina e dos testes.

## 16. Pacote, manifest, código e Android — futuro

O manifest Modal atual é útil como insumo, mas não é ainda o pacote de distribuição do produto. O publicador futuro deve:

1. selecionar exatamente três assets finais;
2. normalizar nomes e dimensões;
3. gerar manifest versionado com `normal`, `listening`, `transcribing`;
4. incluir SHA-256 por arquivo e do pacote;
5. publicar objeto imutável privado;
6. registrar código opaco, não sequencial e revogável → manifest;
7. permitir ao Android baixar, verificar e promover atomicamente;
8. preservar o mascote atual em qualquer falha.

O Android já tem checksum e promoção atômica reaproveitáveis. O novo resolver de código deve ser adicionado sem levar criação Web para o app. Até essa fase, o cliente direto antigo não deve ser removido automaticamente.

## 17. GPU, custo e sequência segura de ativação

### 17.1 Ambientes

| Nível | GPU | Permitido |
| --- | --- | --- |
| teste unitário/contrato | não | parser, estados, auth fake, storage fake |
| integração sem GPU | kill switch false | auth real de ambiente, create, polling `READY_FOR_GENERATION`, idempotência |
| smoke barato autorizado | uma H100, um job | uma foto autorizada, teto explícito, três Masters |
| teste completo autorizado | H100, limites fixos | aprovação e poses somente após custo medido |
| produção | não autorizada | exige LGPD, abuse, billing, rollback, SLO |

### 17.2 Sequência

1. desligar e comprovar `/health generation_enabled=false`;
2. fechar contrato v2 e service auth;
3. validar sem GPU e confirmar zero cost reservation/GPU call;
4. conferir crédito/tarifa vigente no painel Modal;
5. aprovar teto financeiro e uma foto de teste;
6. habilitar development temporariamente;
7. executar uma criação idempotente;
8. registrar fila, cold/warm, worker, GPU-seconds e custo real;
9. desligar e comprovar health false;
10. revisar qualidade/custo antes de qualquer aprovação/poses.

## 18. Observabilidade ponta a ponta

Usar `puleiroTraceId` UUIDv7 aleatório por tentativa. O BFF valida formato e gera um novo quando necessário. O mesmo ID sanitizado acompanha headers e eventos, mas não é credencial nem contém UID/job/código.

Eventos mínimos:

```text
puleiro_flow_started
photo_validation_completed
upload_completed
job_registration_started/completed
generation_authorization_started/completed
master_generation_started/completed
master_candidate_viewed
master_approved
master_candidate_skipped
flow_failed
flow_resumed
flow_completed
```

Latências:

```text
photo_prepare_ms
upload_ms
bff_validation_ms
modal_registration_ms
queue_ms
master_generation_ms
asset_proxy_ms
time_to_reveal_ms
total_flow_ms
```

Campos proibidos: imagem, Base64, filename original, Firebase token, App Check, Authorization, cookie, secret, UID bruto, código privado completo, URL assinada e paths internos.

O BFF deve usar logger estruturado; não espalhar `console.log`. Debug pode ter mais eventos sanitizados; produção mantém somente eventos essenciais e amostragem definida.

## 19. Erros públicos

O BFF deve mapear por allowlist:

| Código público | Origem possível | Mensagem de produto |
| --- | --- | --- |
| `PHOTO_INVALID` | INVALID_IMAGE/415/422 | escolher outra foto |
| `SESSION_REQUIRED` | 401 | entrar novamente sem perder tentativa |
| `NOT_AVAILABLE` | kill switch/cache/dependência | criação pausada; job preservado |
| `LIMIT_REACHED` | 429 | quando tentar novamente; sem cobrança se comprovado |
| `GENERATION_FAILED` | worker/asset | falha recuperável conforme estado/custo |
| `JOB_NOT_FOUND` | 404 owner-safe | retomar biblioteca ou suporte |
| `SERVICE_TEMPORARY` | 5xx/timeout | conexão/serviço; não criar duplicata |

Mensagens internas, stack e nomes de modelo não chegam ao browser.

Cada erro público inclui `allowedActions`, `preservedState` e `messageCode`. O ledger financeiro permanece privado, mas o BFF resolve de forma determinística se a tentativa foi preservada, consumida ou não consumida antes de selecionar a mensagem. “Desconhecido” não pode ser apresentado como “sem cobrança”.

## 20. Matriz de testes necessária

### 20.1 Contrato

- payload válido/inválido;
- response schema válido/ausente/extra;
- estado desconhecido;
- envelope de erro inesperado;
- idempotency replay igual e conflito diferente;
- três Masters e ordem estável;
- checksum ausente/incorreto;
- OpenAPI contract test versionado.

### 20.2 Autenticação

- sessão válida/expirada/ausente;
- token interno válido, expirado, audience/issuer inválido;
- rotação por `kid`;
- Web App Check ausente/inválido no BFF;
- App Check Android preservado em v1;
- ownership cruzado retorna 404 seguro;
- CSRF e rate limit.

### 20.3 Job

- sucesso, falha, timeout local, worker stale;
- refresh, aba fechada, retorno à conta;
- resposta do POST perdida e recovery;
- GET intermitente;
- duplicate POST concorrente;
- cancelamento futuro confirmado;
- nenhum retry pago automático;
- next candidate sem GPU;
- approval sem poses no contrato v2.

### 20.4 Imagem

- JPEG/PNG/WebP;
- MIME falso, corrompida, polyglot;
- zero byte e acima de 10 MiB;
- abaixo de 256/acima de 4096;
- decompression bomb;
- EXIF/GPS removido;
- transparência e orientação;
- SHA-256 no proxy.

### 20.5 Integração

- provider mock;
- Modal fake/contract server;
- deployment com GPU false;
- Firebase/service auth real de desenvolvimento;
- storage/reload/reconciliação;
- smoke GPU explicitamente autorizado;
- reveal só em `awaiting_master_approval`;
- browser console sem erros;
- mobile/tablet/desktop/reduced motion/conexão lenta.

## 21. Avaliação Impeccable do fluxo

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🟣 IMPECCABLE — SHAPE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Chamada:** `/impeccable shape`

**Achados:**

- O fluxo continua com uma decisão por vez se upload, espera, reveal e decisão forem estados exclusivos.
- Três candidatos devem ser apresentados um por vez; mostrar grade técnica quebra a narrativa.
- Estados internos, modelo, seeds, GPU e porcentagem não pertencem à UI.
- Aprovação só aparece depois de imagem disponível e reveal concluído.
- Erro de rede deve preservar o ovo/job; não mandar o usuário recomeçar.

**Impacto:** o BFF precisa fornecer ações permitidas e mensagens semânticas, não apenas estado cru.

**Correção sugerida:** máquina pública normalizada, candidate cursor e retomada pelo job persistido.

**Pendências:** regras comerciais da nova tentativa e saída durante espera.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔵 IMPECCABLE — CRITIQUE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Chamada:** `/impeccable critique`

**Avaliação independente A: 27/40 — aceitável, com lacunas de produto antes da integração.**

- O fluxo continua reconhecível como Puleiro, desde que estados internos permaneçam atrás do BFF, candidatos apareçam um por vez e o ovo represente trabalho real.
- Confiança depende de explicar que a foto foi recebida e que sair/fechar não perde a tentativa.
- Timeout não pode parecer falha definitiva quando o Modal continua trabalhando.
- “Ver outra opção” percorre candidatos já pagos; uma nova geração é outra decisão, com consequência e custo claros.
- Erros dizem, nesta ordem: o que aconteceu, o que foi preservado, se a tentativa foi consumida e qual ação está disponível.
- Privacidade precisa de linguagem curta sem prometer TTL/exclusão ainda inexistentes.
- Ações só são liberadas depois do anúncio de conclusão; polling não produz anúncios repetitivos.

**Avaliação independente B: 23/32 — bom, com lacunas contratuais importantes.**

- Foi corrigida a ausência de descoberta owner-scoped do job após perda do handle local.
- `uploading` foi separado como estado do cliente.
- `COMPLETED` do Modal deixou de significar `ready` no produto.
- Foram tipados `allowedActions`, `preservedState` e a política de reveal no retorno.
- O detector mecânico do Impeccable não é aplicável a uma especificação Markdown; não foi simulado.

**Recomendação:** preservar palco/ovo como representação do estágio real, usar texto curto anunciável e fechar antes da implementação a saída segura, a regra da nova geração, a linguagem de privacidade e as ações por erro.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🟠 IMPECCABLE — ADAPT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Chamada:** `/impeccable adapt`

**Achados:**

- O estado e o job são iguais em todos os viewports; muda somente a composição.
- Em conexão lenta, status continua no palco e oferece retorno seguro, não novo POST.
- Após refresh/retorno, reconstruir o estado antes de executar motion; não repetir o nascimento automaticamente sem contexto.
- Reduced motion substitui transição pelo quadro final, mantendo mesmas ações.
- Sessão expirada preserva a tentativa e pede autenticação antes de revelar asset privado.

**Recomendação:** uma única árvore semântica e ações server-driven, responsiva por CSS.

Polish não foi executado porque o plano ainda aguarda aprovação estrutural.

## 22. Plano por fases

### Fase 0 — correção documental

- **Objetivo:** tornar código atual e contratos explícitos.
- **Arquivos:** `modal_service/API.md`, `README.md`, `ARCHITECTURE.md`, Web `docs/MODAL_CONTRACT.md`.
- **Dependências:** decisão de contrato v2.
- **Riscos:** documentar comportamento que ainda será alterado.
- **Testes:** links, exemplos e contract diff.
- **Conclusão:** nenhuma contradição create/approve/poses/kill switch.
- **Custo:** sem GPU.
- **Rollback:** reverter commit documental.

### Fase 1 — contrato e autenticação

- **Objetivo:** schemas v2, registro separado de GPU, approval separado de poses e service auth.
- **Arquivos:** Modal `app.py`, `security.py`, schemas/testes; Web provider/config/contracts.
- **Dependências:** emissor de token interno/secret manager e identity strategy Web.
- **Riscos:** dual auth e compatibilidade Android.
- **Testes:** contract, auth, rotação, ownership, idempotência.
- **Conclusão:** v1 Android intacta; v2 BFF autenticada; OpenAPI completo.
- **Custo:** sem GPU.
- **Rollback:** manter v1 e desabilitar v2 por flag.

### Fase 2 — ambiente integrado sem GPU

- **Objetivo:** Browser mock → BFF real → Modal v2 com kill switch false.
- **Arquivos:** rotas Next, provider, job repository, proxy, observabilidade.
- **Dependências:** ambiente de desenvolvimento e storage de metadata.
- **Riscos:** token/config e persistência.
- **Testes:** auth real, create/recovery/polling/proxy fake, zero GPU.
- **Conclusão:** health false; job `READY_FOR_GENERATION`; zero FunctionCall/custo reservado.
- **Custo:** CPU/storage/rede mínimos.
- **Rollback:** provider mock.

### Fase 3 — smoke autorizado com GPU

- **Objetivo:** uma foto autorizada até três Masters.
- **Arquivos:** nenhuma feature nova; runbook/telemetria.
- **Dependências:** autorização financeira, kill switch temporário, cache pronto.
- **Riscos:** custo, qualidade, cold start e dado pessoal.
- **Testes:** um job/idempotent replay/polling/checksums.
- **Conclusão:** Master disponível, custo/latência medidos, switch false novamente.
- **Custo:** teto aprovado antes da execução; histórico Master cold ~US$ 0,084 + auxiliares.
- **Rollback:** cancelar se ativo, desligar e redeploy, provider mock.

### Fase 4 — Master real e decisão

- **Objetivo:** upload, retomada, três candidatos sequenciais, aprovação sem poses.
- **Arquivos:** state machine, BFF decision endpoint, ownership store, UI existente.
- **Dependências:** fases 1–3.
- **Riscos:** dupla cobrança/nova tentativa e sessão expirada.
- **Testes:** refresh, slow network, next candidate, approve idempotente.
- **Conclusão:** uma decisão por vez, nenhum pose job.
- **Custo:** um job Master por tentativa autorizada.
- **Rollback:** feature flag para mock/pausar criação.

### Fase 5 — persistência e retomada

- **Objetivo:** conta, biblioteca privada mínima e jobs retomáveis.
- **Arquivos:** repository de jobs/ownership, sessão, rotas de retomada.
- **Dependências:** banco/storage escolhidos e política de retenção.
- **Riscos:** LGPD, migração e orphan jobs.
- **Testes:** outro aparelho, logout/login, exclusão, reconciliação.
- **Conclusão:** compra não depende do código para recuperação.
- **Custo:** banco/storage/egress.
- **Rollback:** leitura compatível e export/migração.

### Fase 6 — poses

- **Objetivo:** três papéis consistentes a partir do Master aprovado.
- **Arquivos:** Modal pose pipeline, BFF contract, UI futura.
- **Dependências:** decisão catálogo 12 vs três escolhidas, benchmark e aprovação.
- **Riscos:** custo hoje não medido e aprovação dispara worker.
- **Testes:** identidade, roles, checksum, falha parcial, custo.
- **Conclusão:** conjunto aprovado e íntegro sem alterar Master.
- **Custo:** desconhecido até benchmark autorizado.
- **Rollback:** manter Master privado sem pose package.

### Fase 7 — pacote e código

- **Objetivo:** manifest, pacote, registry e Android por código.
- **Arquivos:** publisher/registry futuros; resolver Android; store existente.
- **Dependências:** storage/CDN, código e política de revogação.
- **Riscos:** acesso público indevido, colisão, integridade e compatibilidade.
- **Testes:** SHA-256, atomic install, código inválido/revogado, rollback local.
- **Conclusão:** Android instala por código e preserva mascote anterior em falha.
- **Custo:** storage/egress/registry.
- **Rollback:** revogar publicação e manter pacote privado do owner.

## 23. Riscos priorizados

### Bloqueantes

1. deploy ativo com geração habilitada;
2. auth estática do adapter Web;
3. create agenda GPU automaticamente;
4. approve dispara poses automaticamente;
5. ausência de ownership/persistência Web;
6. SHA exato do deploy não exposto;
7. original armazenado sem remoção de EXIF no Modal atual.

### Altos

1. timeout Web de 90 s e ausência de retomada;
2. nova tentativa desperdiça três Masters já gerados;
3. custo das doze poses desconhecido e possivelmente não reservado no ledger;
4. documentação/API/OpenAPI divergentes;
5. sem retenção/exclusão implementada;
6. pacote/código ainda inexistentes.

### Médios

1. Base64 amplia payload/memória;
2. mensagens e estados desconhecidos não tipados;
3. correlation ID não atravessa as camadas;
4. proxy não valida checksum no adapter;
5. modelagem de erro Web perde `charge_incurred` e `retry_at_utc`.

### Baixos

1. nomenclatura `idle` no Android versus `normal` no produto;
2. referência de até quatro Masters enquanto a geração atual cria três;
3. docs em inglês no Modal e produto pt-BR, desde que códigos sejam estáveis.

## 24. Decisões pendentes

Dependem do usuário/produto:

1. autorizar desligamento do kill switch do deploy de desenvolvimento antes do teste integrado;
2. aprovar autenticação dedicada BFF → Modal (Opção B);
3. definir conta recuperável Web inicial;
4. decidir regra/custo de nova geração após os três candidatos;
5. definir TTL da foto original e Masters rejeitados;
6. decidir quando a escolha das poses acontece;
7. definir regra de saída segura durante espera e múltiplas tentativas ativas;
8. escolher infraestrutura de metadata/library/registry em fase própria;
9. autorizar teto financeiro do smoke GPU futuro;
10. definir política de exclusão, revogação e suporte.

Não dependem de decisão de produto: corrigir docs, completar OpenAPI, remover token estático, separar operações com custo, mapear estados e adicionar correlation ID.

## 25. Veredito de prontidão

```text
Modal atual compreendido: SIM
Documentação antiga validada: PARCIAL
Contrato atual compatível com o Puleiro: PARCIAL
Autenticação definida: NÃO; Opção B recomendada e pendente de aprovação
App Check definido: SIM, como recomendação; ainda não implementado
Plano de integração completo: SIM
Seguro iniciar teste sem GPU: NÃO, enquanto o deploy ativo reportar generation_enabled=true
Seguro iniciar teste com GPU: NÃO
Pronto para implementar integração real: NÃO, antes da aprovação deste plano e fechamento dos bloqueios da Fase 1
```
# Status de implementação segura — 2026-08-13

O contrato v2 sem GPU foi implementado em branch isolada do Modal e no BFF Web. Registro, consulta, retomada e aprovação são operações separadas; App Check e Firebase ID token terminam no BFF; a comunicação BFF → Modal usa JWT curto; EXIF é removido antes do armazenamento; aprovação não inicia poses. Os kill switches de Master e poses permanecem desligados. Nenhum deploy ou chamada GPU foi realizado.
