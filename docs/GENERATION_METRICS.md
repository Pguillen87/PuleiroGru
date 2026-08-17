# Caderno de criação

O Puleiro mede a criação por etapa, sem transformar estimativas em fato.

## Dados registrados

- `master` e `poses` recebem um registro quando o BFF aceita a operação;
- a duração é fechada somente quando uma consulta posterior confirma a mudança de estado no Modal;
- falha e cancelamento permanecem visíveis como tal;
- o relatório é RLS owner-scoped: cada pessoa vê apenas suas próprias tentativas.

## Custo

`estimated_cost_usd` só pode receber uma reserva explicitamente devolvida pelo Modal. `actual_cost_usd` só pode receber uma fonte de cobrança verificável do Modal. Enquanto esses dados não fizerem parte da resposta v2, o Caderno mostra **Ainda não informado**. Valores de tabela, créditos do workspace ou suposições de GPU não podem ser exibidos como custo do usuário.

## Limites desta etapa

O tempo exibido durante uma operação é o tempo decorrido localmente; a barra representa apenas marcos confirmados pelo backend. Uma previsão de término será adicionada quando houver histórico suficiente por estágio, modelo e condição de cold start.

Nenhum token, cookie, UID, foto, URL privada, prompt ou conteúdo de asset é gravado como métrica.
