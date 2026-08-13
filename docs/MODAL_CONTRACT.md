# Contrato de geração do mascote mestre

## Limite desta fase

Esta fase gera e apresenta somente o **mascote mestre**. As três poses, pacote, código do mascote, instalação Android, pagamento, publicação e biblioteca não foram implementados.

## Fronteira Web → Next.js

O navegador usa apenas endpoints do próprio Puleiro:

- `POST /api/mascot/jobs`: recebe `multipart/form-data` com o campo `photo`, valida a imagem e cria o job;
- `GET /api/mascot/jobs/:jobId`: consulta o estado normalizado;
- `GET /api/mascot/jobs/:jobId/master/:masterId`: entrega a imagem privada por proxy quando o provider é Modal.

Resposta normalizada:

```ts
type GenerationJobStatus = "queued" | "uploading" | "processing" | "succeeded" | "failed";

interface GenerationJob {
  id: string;
  status: GenerationJobStatus;
  message: string;
  masterImageUrl?: string;
  errorCode?: string;
  retryable?: boolean;
}
```

Tokens, URL privada, imagem em base64 e detalhes internos de erro não atravessam essa fronteira para o navegador.

## Contrato Modal localizado

O serviço existente em `modal_service` expõe:

- `POST /v1/mascot/jobs`, JSON `{ image_base64, content_type }`;
- `GET /v1/mascot/jobs/{job_id}`;
- `GET /v1/mascot/jobs/{job_id}/masters/{master_id}`.

Cabeçalhos atualmente exigidos:

- `Authorization: Bearer <Firebase ID token>`;
- `X-Firebase-AppCheck: <token>`;
- `X-Idempotency-Key: <uuid>` nas operações com custo.

Estados mapeados:

- `AWAITING_MASTER_APPROVAL` ou `MASTER_APPROVED` → `succeeded`;
- `FAILED` ou `CANCELED` → `failed`;
- demais estados de fila, validação e geração → `processing`.

O adapter seleciona apenas o primeiro mestre retornado, pois esta interface apresenta uma opção por vez.

## Pendências para ativação real

- definir como o site obtém e renova Firebase ID token e App Check sem credencial estática;
- confirmar deploy e URL do serviço Modal;
- habilitar conscientemente o kill switch/GPU de geração;
- validar o contrato em ambiente integrado com uma fotografia de teste autorizada;
- definir política de retenção e exclusão de fotografias.

Enquanto essas pendências estiverem abertas, `MASCOT_GENERATION_PROVIDER=mock` é o modo seguro e verificável.
