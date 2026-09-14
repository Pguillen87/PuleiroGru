# 14 — Regras de Hermes

Estas regras são obrigatórias para qualquer agente que assuma GRU/Puleiro.

## Fonte de verdade

1. GitHub e código da branch alvo são a fonte de verdade para implementação.
2. Relatório, chat ou documento histórico é evidência auxiliar; não prova merge, deploy ou runtime.
3. Antes de editar, confirmar repo, remote, branch, `main`, PR alvo e worktree limpo/isolado.
4. Quando não houver evidência, escrever **NÃO VERIFICÁVEL**, **HIPÓTESE** ou **DECISÃO PENDENTE**; nunca preencher lacuna por suposição.

## Segurança e integridade

- Browser não é autoridade. Operações sensíveis ficam no BFF/servidor.
- Preservar Supabase Auth, RLS, owner scope, attempt scope e BFF JWT.
- Não expor nem imprimir secret, token, cookie, Authorization, foto, Base64, embedding, path interno ou URL privada.
- Não usar service role para burlar ownership.
- Não alterar contrato publicado silenciosamente; evoluir de modo compatível e documentado.

## Geração e custo

- GPU paga só com autorização explícita do usuário, ambiente e teto definidos.
- Nunca executar GPU em Production por inferência ou convenience.
- Não fazer retry automático após timeout/crash/resposta ambígua de GPU; primeiro verificar call/operação/output persistidos.
- Preservar idempotência de create, seleção, operação e hatch.
- Recovery CPU de RAW histórico não é retry GPU e não pode criar worker/call/reserva/job/attempt.

## Android e pacote

- Android V1 deve continuar compatível.
- Pacote é exatamente `NORMAL`, `LISTENING`, `TRANSCRIBING`; Master permanece fora.
- Nunca ativar/importar pacote parcial; verificar manifest, checksum, MIME, tamanho e promoção atômica.
- Android e Modal possuem máquinas de estado diferentes; não atribuir um ao outro.

## Migrations, deploy e observabilidade

- Migrations são aditivas, revisadas e nunca aplicadas em Production sem autorização.
- Merge não é deploy; deploy não é smoke; health não é aceite funcional.
- Logs devem ser sanitizados e correlacionáveis. Não introduzir métricas com IDs de usuário como label.
- Toda mudança arquitetural deve atualizar este handoff e os documentos específicos relevantes.

## Método de trabalho

1. Analisar requisitos, risco e contrato antes do código.
2. Criar branch/worktree isolado quando houver modificação.
3. Implementar a menor mudança coerente; não misturar planos de produto.
4. Adicionar testes comportamentais, executar validações e reler o diff.
5. Commitar/pushar e confirmar o HEAD remoto antes de afirmar conclusão.
6. Parar para auditoria quando o usuário exigir.

## Fontes no código

- Regras consolidadas de `README.md`, `docs/ASYNC_INCUBATOR_V1.md`, `modal_service/SECURITY.md`, `OPERATIONS.md`, migrations e PRs abertos.
