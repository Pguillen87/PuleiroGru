# 09 — Modal, GPU e operações assíncronas

## Recursos declarados pelo código/documentação Modal

| Recurso | Uso descrito |
| --- | --- |
| Volume de assets | Originais, Masters, RAWs/poses, templates e artefatos de consistência. |
| Volume de modelos | Cache/modelos. |
| Dict de jobs | Estado operacional do job. |
| Dict de idempotência | Proteção de create/operações replay. |
| Dict de usage | Quota e reserva de custo separadas. |
| Secrets | Credenciais server-side; nomes podem ser documentados, valores nunca. |

Os nomes de recursos em `modal_service/ARCHITECTURE.md` são evidência documental e devem ser confirmados no deploy alvo antes de qualquer operação. Não presumir que todos os Volumes/Dicts descritos existem em cada ambiente.

## Gates e custo

`modal_service/app.py` lê gates como `GPU_GENERATION_ENABLED`, `MASTER_GENERATION_ENABLED`, `POSE_GENERATION_ENABLED`, `INCUBATOR_FLOW_ENABLED` e `INCUBATOR_AUTO_RANKING_ENABLED`. Em código, Master exige GPU+flag Master e poses exigem GPU+flag Pose.

O registro assíncrono de incubação pode existir separado da capacidade de executar GPU. Desligar flags pagas não é permissão para criar job duplicado, nem motivo para o browser inventar que o job está pronto.

## Reconciliador e recovery

O código contém `reconcile_async_incubations()`. Ele é CPU/control-plane e deve fazer no-op seguro se gates pagos estiverem desligados. Uma execução GPU ambígua exige inspeção de operation/call/output antes de qualquer decisão de retry.

O Modal PR #11 propõe recovery CPU de RAWs históricos somente para falha de QC compatível. Ele deve preservar operação e GPU call históricas e não criar nova reserva, worker, operação, job ou attempt. Enquanto aberto, é **EM ANDAMENTO**.

## Encoder e templates

O encoder de Incubadora é ONNX local, com manifest/checksum e provider único `CPUExecutionProvider`. O pacote de templates possui versão e validação própria; a ausência de templates deve impedir geração de poses, não gerar fallback aleatório.

## Ambientes e deploy

**Confirmado no código:** existe script `modal_service/deploy_v2_production_fail_closed.ps1` e documentação de deploy fail-closed. **NÃO VERIFICÁVEL:** apps Modal ativos, nomes atuais de QA/Production, tasks em execução, flags efetivas, volumes montados e créditos/custos do momento.

## Runbook seguro para operação paga

1. Confirmar app/ambiente QA e Production intacta.
2. Registrar SHA, health, templates, encoder, flags e baseline de tasks.
3. Obter autorização explícita com teto/quantidade de operações.
4. Habilitar somente flags mínimas no QA.
5. Uma operação por vez; acompanhar idempotency/operation/GPU call.
6. Em falha ambígua, parar e inspecionar antes de retry.
7. Ao fim, desligar flags QA e preservar evidência sanitizada.

## Fontes no código

- `modal_service/app.py`, `config.py`, `coordinator.py`, `persistent_runtime.py`, `model_cache.py`, `templates.py`, `incubator.py`.
- `modal_service/OPERATIONS.md`, `COSTS.md`, `POSE_OPERATIONS.md`, `FIRST_GPU_SMOKE.md`.
