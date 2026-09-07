# Pacote Android V1 e Código de Importação

Este documento descreve o contrato entre o Puleiro Web/BFF e o importador
Android V1. O Supabase é a fonte de verdade dos pacotes, dos códigos e dos
assets privados; o Modal continua responsável somente pela geração e pelo QC.

## Pré-condições

Um pacote só pode ser importado quando:

1. a tentativa owner-scoped está em `HATCHED`;
2. o perfil pós-nascimento está em `ACTIVE` e tem `display_name`;
3. as três poses aprovadas (`normal`, `listening`, `transcribing`) passaram o
   QC visual v3;
4. `mascot_packages.status = ready`;
5. o manifesto V1 e os assets privados foram verificados integralmente.

O Master continua privado e não faz parte do contrato Android.

## Ciclo operacional

### 1. Publicar o pacote

`POST /api/mascot/incubations/{jobId}/package`

- exige sessão Supabase, ownership e origem de mutação confiável;
- exige perfil pós-nascimento `ACTIVE`;
- reutiliza publicação idempotente já pronta;
- normaliza os assets, valida MIME, dimensões, tamanho e SHA-256;
- grava os assets e o manifesto no bucket privado `mascot-packages`;
- só promove o pacote para `ready` depois de todos os checks passarem;
- não agenda GPU e não cria automaticamente um Import Code.

O endpoint legado `POST /api/mascot/library/{itemId}/package` continua
disponível para a biblioteca. O campo `code` retornado por ele é o
`mascot_code` da biblioteca e **não** deve ser usado pelo Android como Import
Code.

### 2. Emitir o Import Code

`POST /api/mascot/incubations/{jobId}/import-code`

Exige sessão Supabase, `Content-Type: application/json`, origem confiável,
ownership do job e perfil pós-nascimento `ACTIVE`. O pacote associado precisa
estar pronto e ter manifesto V1 válido.

Resposta de sucesso (`201`):

```json
{
  "code": "GRU-ABCD-1234",
  "packageId": "<uuid do pacote>",
  "expiresAt": "2026-09-07T12:15:00.000Z"
}
```

O código tem oito caracteres alfanuméricos, é gerado com aleatoriedade
criptográfica e possui TTL padrão de 15 minutos. O TTL pode ser ajustado no
servidor por `MASCOT_IMPORT_CODE_TTL_SECONDS`, limitado a 60 segundos–24 horas.
O segredo em texto claro só aparece na resposta de criação; o banco armazena
somente SHA-256 em `mascot_import_codes.code_hash`.

Não há endpoint público de revogação nesta fase. O domínio expõe a operação
owner-scoped `revokeImportCode` para integração operacional futura; qualquer
revogação precisa persistir `revoked_at` e nunca deve expor o hash.

### 3. Resolver o pacote no Android

`GET /api/mascot/import/{code}`

Esta é a única rota pública do fluxo de importação. Ela não exige sessão Web,
mas consulta o banco com credencial administrativa somente no servidor e
retorna apenas dados públicos do contrato Android, sem `user_id`, `code_hash`
ou credenciais.

Respostas de erro:

| Situação | HTTP | Código |
| --- | ---: | --- |
| formato inválido | 400 | `IMPORT_CODE_INVALID` |
| código desconhecido | 404 | `IMPORT_CODE_INVALID` |
| código expirado | 410 | `IMPORT_CODE_EXPIRED` |
| código revogado | 410 | `IMPORT_CODE_REVOKED` |
| pacote/manifesto indisponível | 409 | `IMPORT_PACKAGE_UNAVAILABLE` |
| banco ou Storage indisponível | 503 | `IMPORT_CODE_STORAGE_UNAVAILABLE` |

Para um código válido, a rota:

1. calcula o hash do código normalizado;
2. rejeita registro inexistente, revogado ou expirado;
3. exige pacote do mesmo owner e `status = ready`;
4. valida o manifesto V1 e os três caminhos owner-scoped;
5. gera URLs assinadas dos assets por 300 segundos;
6. responde com `Cache-Control: no-store` e `X-Content-Type-Options: nosniff`.

O Android deve tratar o manifesto como não confiável até validar localmente
schema, versão, MIME permitido, tamanho, dimensões, SHA-256 e a presença
exata das funções `NORMAL`, `LISTENING` e `TRANSCRIBING`.

## Contrato do manifesto V1

Campos principais:

```json
{
  "schemaVersion": 1,
  "assetPipelineVersion": 3,
  "packageId": "<uuid>",
  "mascotId": "<id da biblioteca>",
  "packageVersion": "1.0.0",
  "createdAt": "<ISO-8601>",
  "publishedAt": "<ISO-8601>",
  "displayName": "<nome pós-nascimento>",
  "visibility": "PRIVATE",
  "assets": [
    {
      "poseId": "<id>",
      "role": "NORMAL",
      "storagePath": "v1/<user>/<package>/normal/<sha256>.png",
      "sha256": "<64 hex>",
      "expectedBytes": 12345,
      "mimeType": "image/png",
      "width": 512,
      "height": 512
    }
  ]
}
```

O array `assets` deve conter exatamente três itens, um por role. O Master não
deve ser incluído nem promovido para o armazenamento Android.

## Segurança e isolamento

- `mascot_packages` e `mascot_import_codes` têm `user_id` e políticas RLS;
- a resolução usa a relação do código com o pacote e o owner persistidos;
- a service role fica exclusivamente no BFF;
- o bucket `mascot-packages` é privado;
- URLs assinadas são temporárias e nunca devem ser armazenadas em logs;
- códigos, cookies, tokens, fotos, embeddings e conteúdo de asset não entram
  em telemetria.

## Falhas e recuperação

- Código expirado: emitir outro pelo POST; não estender o registro antigo.
- Código revogado: emitir outro somente após confirmar que o pacote continua
  `ready`.
- `IMPORT_PACKAGE_UNAVAILABLE`: verificar perfil ACTIVE, pacote e manifesto;
  não publicar parcialmente.
- `IMPORT_CODE_STORAGE_UNAVAILABLE`: tratar como indisponibilidade temporária;
  não repetir agressivamente nem revelar erro interno ao cliente.
- Falha de uma pose ou checksum: manter o pacote sem `ready` e corrigir a
  origem aprovada antes de tentar nova publicação.

## Proteção ainda pendente para Production

A rota pública GET ainda precisa de rate limiting/WAF validado antes de
qualquer rollout de Production. A proposta operacional é observar primeiro e,
após revisão de tráfego, aplicar limite inicial de 30 requisições por IP a cada
60 segundos, respondendo `429` com `Retry-After` quando disponível. Esta
proteção não foi implementada nesta fase de documentação.
