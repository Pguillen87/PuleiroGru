# Auditoria final dos Planos 1, 2 e 3

Checklist de fechamento documental e de preparação para QA. Esta auditoria é
de repositório e testes locais; não constitui aprovação de Production.

## Escopo funcional

- [x] Plano 1: hatch server-side, ownership, roles e QC visual v3.
- [x] Plano 2: perfil pós-nascimento, nome, revisão otimista, ativação e
      retomada na biblioteca.
- [x] Plano 3: manifesto V1, normalização de assets, pacote privado e Import
      Code temporário/revogável.
- [x] Isolamento do Master: somente leitura no fluxo pós-nascimento e fora do
      pacote Android.
- [x] Isolamento de Production: nenhuma alteração remota ou deploy nesta fase.

## Cobertura por artefato

| Área | Arquivo/rota | Evidência |
| --- | --- | --- |
| Hatch | `app/api/mascot/incubations/[jobId]/hatch/route.ts` | `tests-unit/hatch-route.test.ts`, `hatch-behavior.test.ts` |
| Perfil | `app/api/mascot/incubations/[jobId]/profile/route.ts` | `post-birth-profile-route.test.ts` |
| Ativação | `app/api/mascot/incubations/[jobId]/activate/route.ts` | `post-birth-activate-route.test.ts` |
| Biblioteca | `app/api/mascot/library/route.ts` | `library-post-birth-route.test.ts`, `post-birth-library.spec.ts` |
| Pacote | `app/api/mascot/incubations/[jobId]/package/route.ts` | `post-birth-package-route.test.ts`, `package-manifest.test.ts` |
| Import Code | `lib/mascot-generation/import-store.ts` | `import-store.test.ts` |
| Resolver Android | `app/api/mascot/import/[code]/route.ts` | `import-route.test.ts` |
| Emissão Android | `app/api/mascot/incubations/[jobId]/import-code/route.ts` | `post-birth-import-code-route.test.ts` |
| UI pós-nascimento | `components/incubator/PostBirthJournal.tsx` | `post-birth-journal.spec.ts` |

## Segurança e operação

- [x] Dados de pacote e código têm `user_id` e políticas RLS na migration existente.
- [x] Bucket `mascot-packages` é privado.
- [x] Banco persiste hash do Import Code, não o segredo em texto claro.
- [x] Expiração, revogação e falhas de storage têm respostas distintas.
- [x] GET de importação usa `no-store`, `nosniff` e URLs assinadas curtas.
- [x] Logs/telemetria existentes aceitam somente campos sanitizados.
- [ ] Rate limiting/WAF para GET público: pendente e bloqueador para
      Production; não faz parte desta alteração documental.

## Dependências e configuração

- [x] `package.json` contém scripts de Vitest, TypeScript via CLI, ESLint e
      Playwright.
- [x] As dependências usadas pelo pacote V1 (`sharp`, Supabase e Next.js)
      estão declaradas.
- [x] `.env.example` documenta as credenciais e flags essenciais sem segredos.
- [x] `vitest.config.mts`, `playwright.config.ts`, `tsconfig.json` e
      `eslint.config.mjs` estão presentes.
- [x] `npm audit --omit=dev` executado com `0 vulnerabilities`; repetir a
      auditoria completa antes de qualquer release.

## Evidências a anexar no fechamento

- [x] `npm test` — 38 arquivos, 157/157 testes aprovados.
- [x] `npm run test:e2e` — 204/204 testes aprovados em Chromium, Firefox,
      WebKit e Edge.
- [x] `npx tsc --noEmit` — aprovado.
- [x] `npm run lint` — aprovado.
- [x] `npm audit --omit=dev` — `0 vulnerabilities`.
- [ ] `git status` limpo e HEAD remoto confirmado após o commit documental.

## Auditoria de integração com `main`

Verificação executada após `git fetch origin`, sem merge automático:

- `origin/main`: `41c7f4f131ceb7c53e405b4bdcac95e5cbdfe1a3`;
- branch auditada: `fccf7ed26f4d6e5f1789b56ee7a1f0fb21b9e434`;
- merge-base: `41c7f4f131ceb7c53e405b4bdcac95e5cbdfe1a3`;
- divergência: `origin/main...HEAD = 0 atrás / 13 à frente`;
- `git merge-tree`: nenhuma entrada de conflito reportada;
- merge real: não executado, conforme a restrição desta auditoria.

Checklist de integração:

- [x] `git fetch origin` concluído.
- [x] Base remota `main` identificada e branch comparada.
- [x] Nenhum conflito de merge detectado.
- [x] Suíte unitária executada em worktree limpo: 38 arquivos, 157/157.
- [x] Suíte E2E executada com o servidor local: 204/204 em Chromium,
      Firefox, WebKit e Edge.
- [x] TypeScript e ESLint executados novamente sem erros.
- [x] `npm audit` retornou `0 vulnerabilities` na rodada documental.
- [x] Nenhum deploy, chamada GPU ou alteração remota em Production realizada.
- [x] Contratos de observabilidade e ausência de segredos no log documentados.
- [ ] Rate limiting/WAF da rota GET pública ainda é requisito bloqueador para
      Production, mas não bloqueia a preparação para QA.

## Decisão

Os artefatos funcionais dos três planos estão isolados e documentados para
QA. As suítes locais estão verdes e a comparação com `origin/main` não revelou
conflitos. A branch fica pronta para merge/QA após o commit desta atualização
de auditoria e a confirmação do push. Production permanece bloqueada até a
proteção de abuso da rota pública ser implementada e validada.
