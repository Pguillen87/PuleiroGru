# Puleiro do GRU

Experiência Web em Next.js onde os mascotes do aplicativo GRU nascem.

Esta primeira entrega implementa, com dados locais, o fluxo:

```text
Entrada → Preparação → Nascimento → Escolha
```

O aplicativo Android, o serviço Modal e este site são produtos/camadas separados.

## Desenvolvimento

```powershell
npm install
npm run dev
```

## Validação

```powershell
npm run lint
npm run build
npm run test:e2e
```

Os testes Playwright cobrem Chromium, Firefox, WebKit e Edge, incluindo movimento reduzido, teclado, acessibilidade básica e reflow responsivo.
