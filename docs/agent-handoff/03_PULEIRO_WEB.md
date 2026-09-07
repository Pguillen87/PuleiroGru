# 03 — Puleiro Web e BFF

## Stack e entrada

**IMPLEMENTADO:** `Pguillen87/PuleiroGru` usa Next.js 16 App Router, React 19, TypeScript, Supabase SSR/JS, `jose` para JWT BFF e `sharp` para saneamento de imagens. As rotas estão em `app/`; o BFF está co-localizado nas Route Handlers `app/api/mascot/`.

Páginas principais encontradas em `main`:

| Página | Responsabilidade |
| --- | --- |
| `/` | Central do Puleiro. |
| `/criar` | Fluxo de criação. |
| `/incubadora/[jobId]` | Diário/detalhe de incubação. |
| `/meus-mascotes` | Biblioteca pessoal. |
| `/explorar` | Comunidade. |

Uma página índice exclusiva `/incubadora` não foi encontrada em `main`; a separação visual completa da Incubadora é roadmap, não fato entregue.

## Sessão e fronteira BFF

1. Browser usa Supabase SSR; `requireBrowserIdentity()` confirma a sessão.
2. Rotas BFF derivam `identity.uid` no servidor.
3. `modal-auth.ts` emite JWT HS256 curto para Modal, com issuer/audience/owner/attempt definidos pelo contrato.
4. O browser chama apenas `/api/mascot/...`; não deve receber secret, JWT BFF, path interno de Volume ou URL Modal privada.

Mutações usam `requireTrustedMutationRequest()` e as rotas críticas validam owner e attempt no servidor. A imagem é reencodada com `sharp`; tipos aceitos no código são JPEG, PNG e WebP.

## Attempt, recovery e idempotência

`mascot_attempts` é a âncora Web de recuperação. Para Incubadora assíncrona:

- POST de incubação deriva attempt determinístico de `X-Puleiro-Incubation-Key`.
- O BFF reserva/recupera attempt no Supabase antes de criar o job Modal.
- Quando `modal_job_id` está ausente, o GET de incubadora consulta Modal pelo mesmo owner+attempt e só persiste o vínculo se o attempt retornado coincidir.
- Recovery de leitura não cria job, reenvia foto nem agenda GPU.

O cookie `puleiro_attempt` existe para compatibilidade/continuidade, mas o recovery assíncrono não pode depender exclusivamente dele.

## Biblioteca e pacote

Biblioteca e comunidade são owner-scoped no Supabase. A publicação de pacote V1 é uma operação separada do nascimento: reutiliza poses existentes, grava o manifest no Storage privado e entrega código de importação pelo BFF. Consulte `07_DATA_SUPABASE_STORAGE.md`.

## Divergências relevantes

- `README.md` descreve parte do encoder visual como TorchScript, enquanto o Modal `main` contém inicialização ONNX com `CPUExecutionProvider`. Registrar isso como documentação antiga divergente.
- O README também afirma que o pacote/código está em fase posterior; o código Web já possui rota de publicação. A operação real em ambiente publicado continua **NÃO VERIFICÁVEL**.

## Fontes no código

- `package.json`, `app/`, `components/`, `lib/auth/`, `lib/security/mutation-request.ts`.
- `lib/mascot-generation/attempt.ts`, `attempt-store.ts`, `incubation-recovery.ts`, `modal-auth.ts`, `modal-provider.ts`, `package-store.ts`.
- `app/api/mascot/incubations/route.ts`, `app/api/mascot/library/`, `app/api/mascot/import/[code]/route.ts`.
