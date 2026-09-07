# 08 — Segurança e privacidade

## Modelo observado

| Fronteira | Controle confirmado |
| --- | --- |
| Browser → Web | Sessão Supabase SSR; identidade derivada no servidor. |
| Mutação Web | Verificação de origem confiável e validação de payload. |
| Web → Modal v2 | JWT BFF curto, assinado no servidor, com owner/attempt. |
| Modal assets | Volume privado; assets servidos via BFF/proxy owner-scoped. |
| Supabase | RLS nas tabelas principais de attempts, biblioteca e telemetria. |
| Android → Modal v1 | Firebase ID token + Firebase App Check. |
| Android package | HTTPS, checksum, MIME/tamanho/dimensões e promoção atômica. |

## Regras que Hermes não pode quebrar

1. Nunca aceitar owner, `user_id`, attempt ou job como autoridade vinda apenas do browser.
2. Nunca mover segredo BFF/Modal/Supabase service-role para `NEXT_PUBLIC_*`, app Android ou cliente.
3. Nunca expor path Modal, URL assinada privada, original, RAW, embedding, JWT ou header `Authorization`.
4. Nunca usar um job global por ID sem resolver owner+attempt no Supabase/BFF.
5. Não transformar o Master em asset do pacote Android V1.
6. Não permitir pacote parcial; validar as três roles e checksums antes de promoção.
7. Não repetir GPU ambígua sem consultar operação/call/output persistidos.

## Fotos, metadados e logs

Web valida e reencoda JPEG/PNG/WebP com Sharp; a documentação do projeto declara remoção de EXIF/GPS/XMP/IPTC. Logs de geração devem registrar apenas metadados sanitizados: estágio, duração, quantidade de assets, versão de política/QC e IDs técnicos abreviáveis conforme política operacional. Não registrar imagem, Base64, nome original, EXIF, token, secret ou URL privada.

## LGPD e retenção

**BLOQUEADO/PENDENTE:** o documento Modal `SECURITY.md` prevê gate LGPD de consentimento, retenção, exclusão, App Check e evidências de release. A implementação e validação end-to-end de retenção/exclusão não foram confirmadas nesta investigação.

## Rate limiting e abuso

O README Web marca rate limiting/WAF da rota pública de importação como pendência para Production. Não afirmar que já há proteção efetiva sem configuração runtime comprovada.

## Checklist antes de alteração sensível

- [ ] Entidade autenticada e owner scope confirmados no servidor.
- [ ] Idempotency key estável para POST com efeito/custo.
- [ ] Erros transformados no boundary sem vazar detalhes internos.
- [ ] Logs com redaction e sem payload sensível.
- [ ] Migrations aditivas revisadas, RLS testada e sem uso de dados reais.
- [ ] Feature flag/GPU/Production explicitamente autorizados.

## Fontes no código

- Web: `README.md`, `lib/auth/browser-auth.ts`, `lib/security/mutation-request.ts`, `lib/mascot-generation/validation.ts`, `modal-auth.ts`.
- Modal: `modal_service/AUTHENTICATION.md`, `SECURITY.md`, `bff_auth.py`, `security.py`.
- Android: `AndroidManifest.xml`, `MascotPackageInstaller.kt`, `MascotImportModels.kt`.
