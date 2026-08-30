# Incubadora assíncrona V1

## Limites do fluxo

O fluxo `async_incubator_v1` é aditivo e fica desligado por padrão com
`INCUBATOR_FLOW_ENABLED=false`. Ele não altera Android V1: o pacote final
continua contendo exclusivamente `NORMAL`, `LISTENING` e `TRANSCRIBING`.

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
