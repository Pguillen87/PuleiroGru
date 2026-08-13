---
target: integração segura Modal v2
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
timestamp: 2026-08-13T17-16-38Z
slug: components-puleiroexperience-tsx
---
# Integração segura Modal v2

## Design Health Score

25/40 — aceitável antes das correções. O palco, os três Masters sem novo custo e a retomada preservam o Puleiro; sessão Web ausente, jargão técnico e recuperação ambígua eram os riscos principais.

## Design Specificity

Autoral e reconhecível pelo portão, ovo, ninho, reveal e linguagem editorial. Detector determinístico: 0 achados. A avaliação manual identificou fronteiras de autenticação e estados excepcionais que o detector não cobre.

## Priority Issues

- P0: faltava ponte ID token + App Check para sessão HttpOnly; corrigida com `/api/auth/session`.
- P0: imagens privadas não podiam usar headers; corrigido pela sessão HttpOnly.
- P1: mensagens internas do Modal poderiam vazar; corrigidas por allowlist normalizada.
- P1: timeout e falha definitiva ainda precisam de estados de produto distintos antes da ativação real.
- P2: falha de retomada ainda exige especificação de produto para saída segura.

## Personas

Jordan precisa de linguagem sem GPU/job. Casey precisa sair e retornar sem nova cobrança. Riley precisa de distinção clara entre job ainda ativo e falha definitiva.

## Questions

Definir na fase de produto a saída segura durante espera, a UX de sessão expirada e a política de nova tentativa com possível custo.
