# Puleiro do GRU

Experiência Web em Next.js onde os mascotes do aplicativo GRU nascem.

O navegador fala somente com o BFF Next.js. Firebase ID token e Firebase App Check são verificados no BFF e nunca são encaminhados ao Modal. O BFF autentica-se no Modal v2 com JWT HS256 de curta duração (90 segundos por padrão).

O cliente Firebase Web está preparado para login por e-mail/senha e App Check reCAPTCHA v3. `POST /api/auth/session` troca ID token + App Check válidos por cookie Firebase `HttpOnly`. As APIs e imagens privadas passam a usar essa sessão; nenhum token fica em URL ou é armazenado manualmente em `localStorage`.

## Estado seguro desta fase

```text
foto → validação e remoção de EXIF → registro owner-scoped → retomada por attemptId
```

O registro não agenda GPU. `MASTER_GENERATION_ENABLED` e `POSE_GENERATION_ENABLED` falham fechados e permanecem `false`. Aprovar um Master não inicia poses. Modal v1 continua disponível temporariamente para os consumidores existentes.

## Desenvolvimento sem GPU

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Use `MASCOT_GENERATION_PROVIDER=mock`. O modo de identidade local exige simultaneamente `NODE_ENV != production`, `ALLOW_DEV_TEST_IDENTITY=true` e geração/poses desabilitadas. Ele nunca é uma solução de autenticação de produção.

## Segurança e privacidade

- JPEG, PNG e WebP são decodificados, orientados e reencodados com `sharp`;
- EXIF, GPS, XMP, IPTC e metadata desnecessária não são preservados;
- owner vem do token Firebase verificado, nunca do body;
- `attemptId` fica em cookie `HttpOnly`, `SameSite=Lax` e `Secure` em produção;
- tokens, bytes, Base64, nomes originais e metadata não são registrados;
- nenhuma variável sensível usa `NEXT_PUBLIC`.

## Validação

```powershell
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run test:e2e
```

Detalhes: [contrato Modal v2](docs/MODAL_CONTRACT.md) e [plano de integração](docs/MODAL_INTEGRATION_PLAN.md).

Ambiente isolado e limites comprovados: [validação de staging](docs/STAGING_VALIDATION.md). O ensaio futuro com custo permanece bloqueado pelo [runbook de smoke GPU](docs/GPU_SMOKE_TEST_RUNBOOK.md).
