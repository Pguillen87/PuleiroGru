# Incubadora assíncrona V1

## Limites do fluxo

O fluxo `async_incubator_v1` é aditivo e fica desligado por padrão com
`INCUBATOR_FLOW_ENABLED=false`. Ele não altera Android V1: o pacote final
continua contendo exclusivamente `NORMAL`, `LISTENING` e `TRANSCRIBING`.

O contrato de `subjectHint` aceita explicitamente `subject-hint-policy-v2`,
publicado pelo Modal atual, e mantém `subject-hint-v1` apenas para o produtor
mock/fallback compatível. Versões desconhecidas continuam inválidas.

O preflight de capabilities é somente leitura e não exige um attempt anterior:
o Web usa uma identidade BFF transitória, sem criar tentativa, job ou reserva.
`INCUBATOR_FLOW_ENABLED` controla se um ovo pode ser registrado; `master.ready`
e `poses.ready` descrevem a capacidade de executar geração paga e não bloqueiam
o registro. Com as flags de geração desligadas, o POST de incubação registra o
ovo e o reconciliador o mantém recuperável sem iniciar GPU.

Ao abrir a Incubadora, attempts `async_incubator_v1` owner-scoped sem
`modal_job_id` são reconciliados uma única vez por requisição usando
`getJobByAttempt(owner, attempt)`. Um job encontrado só é vinculado depois de
confirmar o mesmo `attempt_id`; 404, ausência ou divergência não criam job nem
alteram o attempt. O recovery também não reenvia foto, reserva GPU ou inicia
geração, e chamadas posteriores usam o vínculo persistido.

## Estados de produto

O estado é uma projeção de `mascot_attempts` e do job Modal, nunca uma segunda
máquina persistida:

`PREPARING` → `INCUBATING` → `READY_TO_HATCH` → `HATCHED` → `PACKAGE_READY`.

`FAILED` é terminal e permanece visível. `mascot_packages.status=ready`
continua sendo o único commit operacional do pacote Android.

## Segurança e idempotência

- Toda rota exige sessão Supabase e ownership do owner+attempt+job.
- Mutações exigem origem confiável e chave idempotente estável.
- O objeto de incubação armazena somente metadados sanitizados; fotos, URLs
  privadas, embeddings, tokens e códigos de importação não entram em logs.
- A seleção automática dos Masters só acontece depois de três candidatos e QC.
- O reconciliador CPU nunca faz inferência GPU novamente. GPU perdida sem saída
  válida termina em falha e exige uma nova ação explícita do usuário.

## Encoder visual

O classificador/ranker usa somente um artefato TorchScript local, identificado
por `INCUBATOR_VISUAL_ENCODER_PATH` e SHA-256 configurado. Não há download em
tempo de requisição. Sem esse artefato, a sugestão de tipo fica neutra e a
Incubadora não fica pronta para iniciar geração; isso evita alterar a escolha
da pessoa ou reduzir o gate de ranking silenciosamente.

O artefato recebe RGB `[1,3,224,224]` e retorna `(embedding, logits)` ou
`{embedding, logits}`, com logits na ordem `human`, `animal`, `object`,
`other`.

## Operação e recuperação

O Modal reserva calls antes da GPU, usa lease/heartbeat serializado pelo
`job_control` e executa um reconciliador CPU periódico. O reconciliador pode
confirmar saídas já persistidas e avançar a projeção, mas nunca reenvia Masters
ou poses. Um replay reaproveita job, tentativa, seleção de Master e operação
de poses existentes.

## Rollout e rollback

1. Aplicar a migration aditiva.
2. Publicar Modal compatível com os dois fluxos, ainda com a flag desligada.
3. Instalar o encoder verificado no volume de produção e validar capabilities.
4. Publicar Web e ativar inicialmente só para a conta QA.
5. Para rollback, desligar a flag para novos ovos; o reconciliador continua
   finalizando ovos existentes. Não remover a migration nem excluir ovos ativos.
# Política de confiança do Master

`master-ranker-policy-v1` avalia somente Masters que já passaram os hard gates
de QC. Como a amostra real ainda é pequena, os thresholds são conservadores e
versionados: `top1 >= 0.82` e `margin >= 0.04`. O resultado é
`AUTO_SELECTED`, `NEEDS_HUMAN_SELECTION` ou `RANKING_FAILED`.

No resultado ambíguo, o produto exibe `NEEDS_HUMAN_MASTER_SELECTION` ("Precisa
de você"). Não há reserva, spawn ou retry de poses. A escolha owner-scoped é
idempotente, persiste `selectionSource=human` e retoma o mesmo job. Scores e
decisões são sanitizados; embeddings não são persistidos.

Os limites não representam calibração estatística de Production. Se
`INCUBATOR_AUTO_RANKING_ENABLED=false`, o fluxo permanece em shadow mode e não
seleciona Master nem enfileira poses.
