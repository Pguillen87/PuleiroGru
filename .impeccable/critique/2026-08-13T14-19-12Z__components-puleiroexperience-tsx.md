---
target: geração do mascote mestre
total_score: 37
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 1
timestamp: 2026-08-13T14-19-12Z
slug: components-puleiroexperience-tsx
---
# Impeccable Critique — geração do mascote mestre

⚠️ DEGRADED: single-context (sub-agents not authorized by user)

## Design Health Score

| # | Heurística | Nota | Evidência principal |
|---|---|---:|---|
| 1 | Visibilidade do estado | 4 | Upload, criação, processamento, reveal, sucesso e falha têm mensagens próprias, sem porcentagem falsa. |
| 2 | Correspondência com o mundo real | 4 | Foto, portão, ovo, ninho e nascimento preservam a metáfora do Puleiro. |
| 3 | Controle e liberdade | 3 | Foto pode ser trocada/removida e falhas preservam a entrada; processamento não tem cancelamento visual por decisão de escopo. |
| 4 | Consistência | 4 | Paleta, tipografia, componentes e narrativa permanecem coerentes em todos os estados. |
| 5 | Prevenção de erros | 4 | Tipo/tamanho são validados no cliente e conteúdo é decodificado no servidor; envio exige confirmação. |
| 6 | Reconhecimento | 4 | A ação seguinte e a etapa atual permanecem visíveis, sem exigir memória. |
| 7 | Flexibilidade | 3 | Teclado, toque e drag-and-drop são suportados; não há atalhos especializados, dispensáveis neste fluxo curto. |
| 8 | Estética e minimalismo | 4 | Uma decisão funcional por vez e palco dominante, sem formulário SaaS convencional. |
| 9 | Recuperação de erros | 4 | Linguagem simples, foto preservada, retry e troca sem stack trace ou código interno. |
| 10 | Ajuda e documentação | 3 | Orientação contextual e formatos aceitos estão visíveis; política de retenção segue pendente de produto. |
| **Total** | | **37/40** | **Excelente com pendências estreitas** |

## Veredicto de especificidade

A experiência é autoral: a seleção acontece dentro do palco editorial, o job vira incubação e o resultado é um nascimento. Não é intercambiável com um uploader SaaS. O detector determinístico retornou zero ocorrências nos cinco componentes principais alterados.

## Impressão geral

O fluxo real ganhou estrutura técnica sem perder a dramaturgia. O maior risco restante não é visual: a autenticação Firebase/App Check do Modal ainda precisa de emissão e renovação reais antes da ativação do provider.

## Pontos fortes

- Confirmação explícita antes de a fotografia sair do dispositivo.
- Mensagens de job reais por estado, sem progresso inventado.
- Reveal preservado e ações ausentes do DOM até a conclusão.
- Recuperação mantém a fotografia e apresenta somente dois próximos passos.

## Prioridades encontradas

- **P1 — Ativação Modal ainda bloqueada por autenticação:** tokens estáticos expiram e o site ainda não tem fluxo Firebase/App Check. Corrigir na fase de integração de ambiente, sem expor segredos no navegador.
- **P2 — Dependência de fontes remotas no desenvolvimento:** rede restrita aciona fallback. Auto-hospedar somente quando os arquivos tipográficos aprovados estiverem disponíveis.
- **P2 — Persistência temporária:** atualização ou fechamento da aba perde foto/job/aprovação. Está documentado e é aceitável nesta fase, mas precisa ser resolvido antes de uma jornada paga.

## Personas

- **Jordan, primeiro acesso:** entende o primeiro passo, formatos e confirmação; não encontra jargão técnico nos erros.
- **Sam, teclado/leitor de tela:** recebe labels, foco visível, status anunciável, alt útil e alvos de 48 px; a ordem de tabulação segue linear.
- **Casey, móvel distraído:** vê uma ação principal por vez e pode retomar após falha, mas perde a sessão se recarregar a página.

## Observações menores

- O badge “N” das capturas é uma ferramenta do Next.js dev e não aparece no build de produção.
- A ação “Remover foto” foi rebaixada visualmente para não competir com confirmação e troca.
- Prévia e mestre usam `contain` para não cortar imagens verticais ou horizontais.

## Perguntas de produto

- Qual mecanismo oficial emitirá e renovará Firebase ID token e App Check para o site?
- Qual é a retenção comprovada das fotografias e quando ela poderá ser comunicada ao usuário?
- A próxima fase precisa restaurar jobs após refresh antes de iniciar geração com custo?
