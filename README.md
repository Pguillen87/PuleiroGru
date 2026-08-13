# Puleiro do GRU

Experiência Web em Next.js onde os mascotes do aplicativo GRU nascem.

Esta entrega prepara o fluxo real de geração:

```text
Entrada → Foto → Confirmação → Upload → Job → Preparação → Mascote mestre → Escolha
```

O navegador nunca chama o Modal diretamente. A API do Next.js valida a fotografia, protege credenciais e usa um provider isolado. O provider `mock` permanece como padrão de desenvolvimento; o adapter `modal` implementa o contrato localizado, mas depende das pendências de autenticação e deploy descritas em [docs/MODAL_CONTRACT.md](docs/MODAL_CONTRACT.md).

Esta fase gera somente o mascote mestre. As poses, pacote e código ainda não foram implementados.

## Desenvolvimento

```powershell
npm install
npm run dev
```

No PowerShell, copie a configuração com:

```powershell
Copy-Item .env.example .env.local
```

## Providers

Use `MASCOT_GENERATION_PROVIDER=mock` para desenvolver sem custo e sem serviços externos. O mock mantém jobs apenas na memória do processo e usa o asset de reveal aprovado como resultado.

Para selecionar o adapter real, use `MASCOT_GENERATION_PROVIDER=modal` e configure as três variáveis `MODAL_*` somente no servidor. Não publique `.env.local` nem adicione prefixo `NEXT_PUBLIC` às credenciais.

Os intervalos `JOB_POLL_INTERVAL_MS` e `JOB_TIMEOUT_MS` controlam um polling cancelável, com backoff, encerrado em sucesso, falha, timeout, troca de estado ou desmontagem do componente.

## Upload e privacidade

São aceitas imagens JPEG, PNG e WebP decodificáveis, entre 256 e 4096 pixels, dentro do limite configurado. Tipo, tamanho e conteúdo são conferidos novamente no servidor. O nome original e os bytes da foto não são registrados nos logs.

A política de retenção e exclusão das fotografias ainda é uma pendência de produto. A interface não promete exclusão automática.

## Validação

```powershell
npm run lint
npm run build
npm run test:e2e
```

Os testes Playwright cobrem Chromium, Firefox, WebKit e Edge, incluindo upload, API, polling, reveal, movimento reduzido, teclado, acessibilidade básica e reflow responsivo.

## Persistência atual

A aprovação do mascote é mantida somente no estado da sessão aberta. Não existe biblioteca ou salvamento permanente nesta fase.
