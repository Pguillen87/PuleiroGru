# Puleiro do GRU

Experiência Web em Next.js onde os mascotes do aplicativo GRU nascem.

```text
Browser → Supabase Auth/SSR → Next.js BFF → JWT curto → Modal v2
```

O Puleiro Web usa Supabase Auth. O BFF valida a sessão com `auth.getUser()`, deriva ownership de `user.id` e autentica-se no Modal v2 com JWT HS256 de curta duração. Firebase permanece apenas no GRU Android e nas rotas Modal v1 legadas.

## Estado seguro desta fase

```text
foto → remoção de EXIF → tentativa RLS owner-scoped → registro Modal sem GPU → retomada
```

O registro não agenda GPU. `MASTER_GENERATION_ENABLED` e `POSE_GENERATION_ENABLED` permanecem `false`. Aprovar um Master não inicia poses.

Antes de gerar, o usuário confirma se o sujeito é pessoa, animal, objeto ou outro; animais também informam a espécie. Essa confirmação alimenta prompts específicos que impedem mistura de categorias. Depois de aprovar um dos três Masters, o usuário escolhe uma opção para cada função — Normal, Ouvindo e Transcrevendo — e revisa o conjunto antes da operação separada de poses.

Cada conceito de pose possui uma referência visual editorial identificada como exemplo de movimento, não como resultado personalizado. Depois da geração, as três imagens reais são servidas por proxy privado owner-scoped. Em staging, a geração só fica disponível quando o deploy é iniciado explicitamente com o modo de teste GPU.

## Configuração local

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Variáveis públicas: URL e anon key do Supabase. `SUPABASE_SERVICE_ROLE_KEY` é somente servidor, não participa da sessão comum e nunca pode usar prefixo `NEXT_PUBLIC`. O provider `mock` usa a identidade local apenas fora de produção e com geração desabilitada.

## Banco e RLS

A migration em `supabase/migrations` cria `mascot_attempts`, restringe status, ativa RLS e limita SELECT/INSERT/UPDATE a `auth.uid() = user_id`. A aplicação ao projeto remoto deve ocorrer com Supabase CLI autenticada por Personal Access Token ou conexão de banco autorizada, seguida de `RUN_REAL_STAGING_TESTS=true npm run test:integration`. A anon key e a service role não concedem permissão de DDL.

## Segurança e privacidade

- JPEG, PNG e WebP são decodificados, orientados e reencodados com `sharp`;
- EXIF, GPS, XMP e IPTC não são preservados;
- owner vem da sessão Supabase validada, nunca do body;
- `attemptId` fica em cookie `HttpOnly`, `SameSite=Lax` e `Secure` em produção;
- tokens, bytes, Base64, nomes originais e metadata não são registrados;
- a service role não está presente no bundle cliente.

## Validação

```powershell
npm test
npm run lint
npx tsc --noEmit
npm run build
npm run test:e2e
$env:RUN_REAL_STAGING_TESTS='true'; npm run test:integration
```

Consulte [contrato Modal v2](docs/MODAL_CONTRACT.md), [plano de integração](docs/MODAL_INTEGRATION_PLAN.md), [validação de staging](docs/STAGING_VALIDATION.md) e [runbook de smoke GPU](docs/GPU_SMOKE_TEST_RUNBOOK.md).
