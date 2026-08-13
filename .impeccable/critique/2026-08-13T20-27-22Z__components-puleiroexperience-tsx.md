---
target: integração real staging sem GPU
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 4
timestamp: 2026-08-13T20-27-22Z
slug: components-puleiroexperience-tsx
---
# Integração staging e sessão Web

## Design Health Score

| # | Heurística | Nota | Questão principal |
|---|---|---:|---|
| 1 | Visibilidade do estado | 3 | Login e processamento têm feedback; retomada podia falhar silenciosamente |
| 2 | Correspondência com o mundo real | 3 | Metáfora forte, com jargão técnico residual no estado seguro |
| 3 | Controle e liberdade | 1 | Cadastro, recuperação e saída ainda não definidos |
| 4 | Consistência e padrões | 2 | Palco autoral; gate de conta ainda genérico antes da correção |
| 5 | Prevenção de erros | 2 | Idempotência ajuda; sessão e retomada competiam na montagem |
| 6 | Reconhecimento em vez de memória | 3 | Ações claras; login não explica alternativas |
| 7 | Flexibilidade e eficiência | 1 | Somente e-mail/senha nesta preparação |
| 8 | Estética e minimalismo | 3 | Interface focada, gate ainda sem o palco antes da correção |
| 9 | Recuperação de erros | 1 | Falhas diferentes usavam feedback genérico |
| 10 | Ajuda e orientação | 2 | Propósito da conta é claro; recuperação não definida |
| **Total** | | **21/40** | **Aceitável antes das correções** |

## Design Specificity

O fluxo de foto, incubação e três Masters continua reconhecível como Puleiro do GRU. Antes das correções, o AccountGate parecia um formulário genérico e o estado seguro expunha GPU/job. O detector determinístico retornou zero achados; as lacunas foram de sequência assíncrona e significado, não de antipadrões mecânicos.

## Priority Issues

- **P0:** retomada iniciava antes da sessão e não repetia após login.
- **P1:** sessão expirada não reabria o gate.
- **P1:** gate não compartilhava o cenário rural do Puleiro.
- **P1:** falhas de credencial, rede e serviço tinham a mesma mensagem.
- **P1:** cadastro e recuperação de conta continuam decisão de produto aberta.
- **P2:** foco dos inputs não tinha o tratamento autoral.

## Personas

- **Jordan:** entende e-mail/senha, mas precisa de cadastro/recuperação antes da abertura pública.
- **Casey:** precisa que refresh retome somente depois da sessão e que rede indisponível não pareça senha errada.
- **Sam:** labels, autocomplete e live region estão presentes; focus-visible e continuidade após login precisavam ser corrigidos.

## Questions

- Qual método de cadastro e recuperação será aprovado para produção?
- A saída segura durante espera será fechar e voltar, voltar à entrada ou abrir Meus mascotes?
- Quando uma tentativa falha, em que momento uma nova tentativa pode representar novo custo?
