# 11 — Testes e validação

## Web

Comandos declarados:

```powershell
npm.cmd test -- --run
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run build
npm.cmd run test:integration
npm.cmd run test:e2e
```

Cobertura encontrada em `tests-unit`, `tests-integration`, `tests` e Playwright. Há testes para attempts, recovery, package/import, validação de imagens, fluxo de UI e rotas.

Build pode exigir variáveis públicas Supabase já autorizadas. Não inventar valores para obter verde.

## Modal

Comandos documentados:

```powershell
py -3.12 -m pytest modal_service/tests -q -p no:cacheprovider
py -3.12 -m compileall -q modal_service
```

O diretório de testes cobre BFF auth, config, coordinator, domínio, imagem/QC, Incubadora, modelo/encoder, templates, v2 contract e validação. Testes CPU não autorizam execução GPU.

## Android

```powershell
.\gradlew.bat :app:testDebugUnitTest
.\gradlew.bat :app:lintDebug
.\gradlew.bat :app:connectedDebugAndroidTest
```

Há unit tests e instrumented tests para transcrição, overlay, importação e integridade de mascote.

## Matriz de aceitação antes de smoke pago

| Camada | Evidência mínima |
| --- | --- |
| Modal | testes CPU verdes, compileall, health QA, encoder/templates/gates verificados. |
| Web | unit/integration relevantes, typecheck, lint, Preview QA autenticado e inspeção visual. |
| Supabase | migrations aplicadas e RLS owner-scoped validada em QA. |
| Android | contrato do manifest e instalação atômica testados; device real apenas quando fase Android for autorizada. |
| GPU | autorização explícita, baseline de tasks/custo, uma operação controlada e rollback de flags. |

## O que não é prova suficiente

- Teste unitário não comprova deploy/runtime.
- HTTP 200 de health não comprova auth ou GPU segura.
- PR verde não comprova merge nem deploy.
- Smoke CPU não comprova geração GPU.
- Um caso visual não calibra thresholds estatisticamente.

## Fontes no código

- `package.json`, `playwright.config.ts`, `tests*/` no Web.
- `modal_service/tests/`, `requirements-dev.txt` no Modal.
- `app/src/gruTest/`, `app/src/gruAndroidTest/`, `README.md` no Android.
