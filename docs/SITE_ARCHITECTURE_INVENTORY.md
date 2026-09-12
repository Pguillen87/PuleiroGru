# Inventário de arquitetura do Puleiro Web

Documento de levantamento para reorganização do site por página, domínio e
responsabilidade.

## 1. Escopo e fotografia atual

Levantamento realizado em 2026-09-11 no checkout:

```text
Repositório Web: C:\App\PuleiroGRU\PuleiroGruLive\hatch-route-tests
Branch:          qa-integration
HEAD:            9efe035
Remote:          https://github.com/Pguillen87/PuleiroGru.git
```

O checkout analisado é um worktree vinculado ao repositório Web principal.
Este documento descreve o estado do código; não propõe alterações de
comportamento nem substitui os contratos de backend já documentados.

### Contagem atual

| Artefato | Quantidade | Observação |
| --- | ---: | --- |
| Templates de páginas Next.js (`page.tsx`) | 6 | Inclui a página dinâmica da incubadora |
| Handlers de autenticação | 2 | Callback e signout; não são páginas visuais |
| Arquivos de rotas BFF/API | 31 | Operações de geração, incubação, biblioteca, comunidade e importação |
| Componentes React TSX | 27 | Inclui componentes compartilhados e específicos de fluxo |
| Testes unitários | 37 arquivos | Vitest |
| Testes E2E | 4 arquivos | Playwright |

### Conclusão rápida

O site possui **6 entradas visuais de página**:

1. `/` — Central do Puleiro.
2. `/criar` — criação de mascote; atualmente possui dois motores de jornada.
3. `/explorar` — comunidade pública.
4. `/meus-mascotes` — biblioteca privada e retomada de incubação.
5. `/incubadora/[jobId]` — jornal de uma incubação e pós-nascimento.
6. `/account/update-password` — atualização de senha.

Além delas, existem endpoints de autenticação e 31 rotas BFF que não devem ser
misturados à camada visual.

## 2. Hierarquia atual de páginas

```text
Puleiro Web (/)
├── /criar
│   ├── Fluxo legado de geração
│   └── Fluxo Incubadora assíncrona V1, quando INCUBATOR_FLOW_ENABLED=true
├── /meus-mascotes
│   ├── Incubadora: ovos e nascimentos em andamento
│   ├── Pós-nascimento: perfis DRAFT/ACTIVE retomáveis
│   ├── Biblioteca: cards de mascotes concluídos
│   ├── Finalizações pendentes
│   └── Mascotes públicos salvos da comunidade
├── /explorar
│   └── Comunidade pública de mascotes publicados
├── /incubadora/[jobId]
│   ├── Acompanhamento do nascimento
│   ├── Escolha do Master
│   ├── Revisão das três poses
│   ├── Hatch server-side
│   └── Jornal pós-nascimento: nome e ativação
└── /account/update-password
    └── Nova senha depois do fluxo de recuperação
```

### Sitemap visual

```mermaid
graph TD
    HOME[Central /]
    CREATE[/criar\nCriar mascote]
    LIB[/meus-mascotes\nBiblioteca privada]
    EXPLORE[/explorar\nComunidade]
    INC[/incubadora/:jobId\nJornal da incubação]
    PASSWORD[/account/update-password\nAtualizar senha]

    HOME --> CREATE
    HOME --> LIB
    HOME --> EXPLORE
    CREATE --> LIB
    LIB --> INC
    LIB --> EXPLORE
    INC --> LIB
    INC --> PASSWORD
```

## 3. Navegação global

### `components/navigation/Header.tsx`

O Header aparece nas páginas principais e concentra:

- marca `PuleiroWordmark` com ligação visual para o produto;
- links `Criar`, `Explorar` e `Meus mascotes`;
- navegação desktop e menu mobile;
- consulta do usuário atual via Supabase Auth;
- botão `Sair` quando existe sessão;
- limpeza de sessão local e redirecionamento para `/` após logout;
- eventos `puleiro:auth-required` e `puleiro:auth-signed-out` usados para
  reagir a expiração de sessão.

Responsabilidade atual: navegação, estado de sessão e logout. A futura
organização deve manter o Header independente das jornadas de criação e da
biblioteca.

Não há atualmente:

- breadcrumbs;
- navegação secundária por seção;
- footer com links de produto, ajuda ou legal;
- `loading.tsx`, `error.tsx` ou `not-found.tsx` por rota;
- grupos de rota Next.js para separar áreas públicas e autenticadas.

## 4. Inventário página a página

### 4.1 `/` — Central do Puleiro

Arquivo de entrada: `app/page.tsx`

Componente principal: `components/dashboard/PuleiroHub.tsx`

#### O que a página faz

É a home/central de navegação. Não consulta o backend nem cria estado de
mascote. Apresenta o conceito do produto e encaminha a pessoa para as três
ações principais:

- `Criar meu mascote` → `/criar`;
- `Minha biblioteca` → `/meus-mascotes`;
- `Explorar comunidade` → `/explorar`.

#### Estrutura visual

- Header global;
- seção hero `hub-stage`:
  - selo “Central do Puleiro”;
  - título “Todo mascote começa por aqui”;
  - texto introdutório;
  - CTA de criação;
  - selo decorativo do palco;
- seção `hub-doors` com dois cards/portas:
  - biblioteca pessoal;
  - comunidade;
- `site-shell`, `main` e estilos globais.

#### Divisão recomendada

Manter como domínio `home/dashboard`. O componente é pequeno e não precisa
conhecer geração, Supabase ou estado de incubação.

---

### 4.2 `/criar` — Criação de mascote

Arquivo de entrada: `app/criar/page.tsx`

Configuração: `publicGenerationConfig()` em
`lib/mascot-generation/config.ts`.

O page é dinâmico porque as flags do servidor devem coincidir com as regras
das rotas BFF.

#### Gate de acesso

`components/PuleiroExperience.tsx` usa `AccountGate` conforme
`config.authenticationRequired`. Dependendo do provider/configuração, a
criação pode exigir sessão Supabase ou usar a identidade local permitida em
desenvolvimento.

#### Existem duas jornadas nesta mesma URL

##### Jornada A — Incubadora assíncrona V1

Ativada por `config.incubatorFlowEnabled` e renderizada por
`components/incubator/IncubatorCreationExperience.tsx`.

Estados visuais locais:

```text
entry
→ photo
→ preview
→ subject
→ mismatch (se a análise sugerir divergência)
→ normal
→ listening
→ transcribing
→ summary
→ submitting
→ done | error
```

Responsabilidades:

- iniciar a jornada;
- selecionar ou arrastar uma fotografia;
- preparar a imagem localmente, removendo metadata e validando tipo/tamanho;
- confirmar o sujeito principal como pessoa, animal, objeto ou outro;
- pedir `subject-hint` ao BFF para detectar possível divergência;
- escolher uma referência para cada função:
  - Normal;
  - Ouvindo;
  - Transcrevendo;
- revisar foto, identidade e poses;
- consultar capacidades do servidor;
- registrar a incubação de forma idempotente;
- exibir confirmação ou erro recuperável.

Componentes usados:

- `EntryStage`;
- `PhotoSelectionStage`;
- `PhotoPreviewStage`;
- `SubjectConfirmationStage`;
- bloco `MismatchConfirmation` interno;
- `PoseSelectionStage`;
- bloco `IncubationSummary` interno;
- `PreparingStage`;
- `PuleiroStage`;
- `Header` e `AccountGate`.

APIs chamadas:

- `GET /api/mascot/capabilities`;
- `POST /api/mascot/subject-hint`;
- `POST /api/mascot/incubations`.

##### Jornada B — Fluxo legado de geração

Quando `incubatorFlowEnabled` está desligado, o componente usa
`AuthenticatedPuleiroExperience` e o hook
`lib/mascot-generation/useMascotGenerationFlow.ts`.

Estados principais:

```text
entry
→ photo-selection
→ photo-preview
→ subject-confirmation
→ uploading
→ creating-job
→ preparing
→ registered-safe
→ master-ready
→ master-approved/master-rejected
→ configuring-poses
→ choosing-normal/listening/transcribing
→ pose-selection-review
→ generating-poses
→ pose-set-ready
→ saving-library
→ code-ready
ou recoverable-error
```

Componentes de domínio usados nesta variante:

- `MasterDecisionStage` — escolhe o mascote Master;
- `MascotConfigurationDialog` — nome e referências de pose;
- `PoseSelectionReviewStage` — revisão conjunta;
- `PoseSetReadyStage` — revisão das imagens geradas e nome;
- `MascotCodeStage` — código da biblioteca;
- `ErrorStage` — recuperação por categoria de erro;
- `ProgressFolio`, `EditorialNote`, `GenerationProgress` e `PuleiroStage`.

APIs adicionais da variante legada:

- `POST /api/mascot/jobs`;
- `GET /api/mascot/jobs/current`;
- `GET /api/mascot/jobs/[jobId]`;
- `POST /api/mascot/jobs/[jobId]/master-generations`;
- `POST /api/mascot/jobs/[jobId]/masters/[masterId]/approve`;
- `PATCH /api/mascot/jobs/[jobId]/configuration`;
- `POST /api/mascot/jobs/[jobId]/pose-generations`;
- `GET /api/mascot/jobs/[jobId]/master/[masterId]`;
- `GET /api/mascot/jobs/[jobId]/pose/[role]`;
- `POST /api/mascot/jobs/[jobId]/complete`;
- `DELETE /api/mascot/jobs/[jobId]`.

#### Problema de responsabilidade atual

`/criar` decide entre duas máquinas de jornada grandes. Para reorganização,
elas devem ser separadas em domínios explícitos, por exemplo:

```text
features/mascot-creation-legacy/
features/async-incubator/
```

Ambas podem compartilhar somente primitives visuais e autenticação. A lógica
de estado, API e recuperação não deve continuar crescendo no mesmo componente
de entrada.

---

### 4.3 `/meus-mascotes` — Biblioteca pessoal

Arquivo de entrada: `app/meus-mascotes/page.tsx`

Gate: `AccountGate required`

Componente principal: `components/library/PersonalMascotLibrary.tsx`

Esta é a página mais carregada do site. Ela mistura quatro responsabilidades:

1. retomada de incubação;
2. projeção de perfis pós-nascimento;
3. biblioteca de mascotes finalizados;
4. itens públicos salvos da comunidade.

#### Carregamentos executados

Ao abrir a página, o componente consulta:

- `GET /api/mascot/library` — biblioteca paginada, busca, filtro e perfis
  pós-nascimento;
- `GET /api/mascot/incubations` — ovos e nascimentos em andamento;
- `GET /api/mascot/community/saved` — mascotes públicos salvos.

A lista de incubação é atualizada enquanto houver estados `PREPARING` ou
`INCUBATING`. A biblioteca aceita paginação por offset, com tamanho de página
24.

#### Seção A — `IncubatorShelf`

Arquivo: função interna de `PersonalMascotLibrary.tsx`.

Apresenta os trabalhos ainda em andamento:

- contador de ovos;
- ilustração de ovo/ninho;
- rótulo derivado do estado:
  - preparando;
  - criando mascote;
  - preparando poses;
  - pronto para chocar;
  - jornal aberto;
  - precisa de você;
  - nascimento interrompido;
- última atualização relativa;
- mensagem de falha quando aplicável;
- ação contextual:
  - `Chocar ovo`;
  - `Abrir Jornal`;
  - `Escolher mascote`;
  - `Ver detalhes`.

Cada ação abre `/incubadora/[jobId]`.

#### Seção B — `PostBirthProfileShelf`

Apresenta perfis pós-nascimento retornáveis:

- estado `Ativo` ou `Rascunho`;
- nome definitivo ou `Mascote sem nome`;
- texto de identidade confirmada;
- ação `Abrir Jornal`;
- ligação pelo `modalJobId`.

Perfis `ACTIVE` são retirados visualmente da lista de incubação para evitar que
o mesmo mascote apareça simultaneamente como “ovo” e como ativo.

#### Seção C — `LibraryControls`

Controles da coleção finalizada:

- busca por código do mascote;
- filtro `Todos`;
- filtro `Favoritos`;
- ordenação:
  - Mais recentes;
  - Mais antigos;
  - Código do mascote.

Os perfis pós-nascimento são exibidos apenas no filtro `Todos` e quando a busca
está vazia.

#### Seção D — Cards `LibraryItem`

Cada mascote finalizado é um card com:

##### Área visual

- imagem da pose `normal` como capa;
- fallback para a primeira pose disponível;
- indicação de prioridade de carregamento para os quatro primeiros cards;
- botão `Ver 3 poses`;
- modal `MascotPosesDialog` com as poses do conjunto:
  - Normal;
  - Ouvindo;
  - Transcrevendo;
- foco inicial, fechamento por Escape e fechamento por ação explícita.

##### Identificação

- número de catálogo `Fig. 01`, `Fig. 02` etc.;
- ou posição da figurinha dourada quando favorito;
- nome do mascote;
- edição inline do nome;
- código do mascote;
- data de criação.

##### Ações diretas

- favoritar/desfavoritar;
- salvar posição entre os favoritos;
- copiar código;
- preparar ou retomar pacote Android;
- mostrar estado `Pronto para usar` quando o pacote estiver pronto.

##### Menu “Mais ações”

- alterar posição dourada, se favorito;
- publicar na comunidade;
- remover da comunidade;
- excluir mascote.

##### Diálogos

- `PackageReadyDialog` — informa que o pacote está pronto e oferece cópia do
  código;
- `MascotPosesDialog` — mostra o conjunto completo;
- `MascotDeleteDialog` — confirma exclusão e avisa que uma cópia já instalada
  no Android não é apagada do celular.

##### APIs do card

- `PATCH /api/mascot/library/[itemId]` — favorito, posição e nome;
- `DELETE /api/mascot/library/[itemId]` — exclusão;
- `POST /api/mascot/library/[itemId]/publication` — publicar/despublicar;
- `POST /api/mascot/library/[itemId]/package` — preparar pacote;
- `GET /api/mascot/library/[itemId]/pose/[role]` — imagens privadas.

#### Seção E — Finalizações pendentes

Exibe `pendingItems` que ainda não estão operacionais. O texto explica que o
código para Android só aparece depois da conferência completa.

Reutiliza o mesmo `LibraryItem`, mas sem permitir que a ação de estado seja
confundida com um mascote pronto.

#### Seção F — Mascotes públicos salvos

Componente interno: `SavedCommunityItem`.

Mostra:

- pose normal;
- código público;
- quantidade de favoritos;
- estado salvo/favorito;
- link `Ver na comunidade` → `/explorar`.

#### Responsabilidade recomendada para a reorganização

Esta página deve virar um shell fino composto por módulos independentes:

```text
PersonalMascotLibraryPage
├── IncubatorShelf
├── PostBirthShelf
├── CompletedMascotCollection
│   ├── LibraryControls
│   ├── MascotCard
│   ├── MascotPoseDialog
│   ├── MascotPackageDialog
│   └── MascotDeleteDialog
└── SavedCommunityCollection
```

O atual `PersonalMascotLibrary.tsx` concentra carregamento, filtros, polling,
mutations, modais e cards em um único arquivo. Ele é o principal candidato à
divisão por responsabilidade.

---

### 4.4 `/explorar` — Comunidade pública

Arquivo de entrada: `app/explorar/page.tsx`

Componente principal: `components/library/CommunityMascotLibrary.tsx`

#### O que a página faz

- carrega mascotes publicados em `GET /api/mascot/community`;
- funciona sem login para leitura;
- alterna ordenação entre:
  - Mais recentes;
  - Mais favoritados;
- informa que apenas mascotes publicados pelo criador aparecem;
- exibe cards públicos em grade.

#### Card `CommunityItem`

- pose normal como preview;
- código público do mascote;
- contador de favoritos;
- contador de itens salvos;
- botão `Favoritar`/`Favoritado`;
- botão `Salvar na biblioteca`/`Salvo na biblioteca`;
- feedback de erro local.

Mutations:

- `POST /api/mascot/community/[itemId]/favorite`;
- `POST /api/mascot/community/[itemId]/save`.

Imagens de pose pública:

- `GET /api/mascot/community/[itemId]/pose/[role]`.

#### Divisão recomendada

Separar `CommunityMascotLibrary` em:

```text
CommunityPage
├── CommunityToolbar
├── CommunityGrid
├── CommunityMascotCard
└── CommunityRelationActions
```

A comunidade não deve importar estado de incubação, perfil pós-nascimento ou
operações de pacote privado.

---

### 4.5 `/incubadora/[jobId]` — Jornal do nascimento

Arquivo de entrada: `app/incubadora/[jobId]/page.tsx`

Gate: `AccountGate required`

Componente principal: `components/incubator/IncubationJournal.tsx`

#### Carregamento e autoridade

- consulta `GET /api/mascot/incubations/[jobId]`;
- não declara estados por conta própria;
- usa `productState` retornado pelo servidor;
- faz polling a cada 8 segundos somente em `PREPARING` ou `INCUBATING`;
- aborta o polling quando a página desmonta.

#### Estados visuais

##### Precisa de escolha do Master

Quando `productState = NEEDS_HUMAN_MASTER_SELECTION`:

- mostra as opções de Master;
- permite selecionar uma opção;
- envia `POST /api/mascot/incubations/[jobId]/masters/[masterId]/select`;
- preserva a mesma incubação.

##### Pronto para hatch

O botão `Chocar ovo` só aparece quando o frontend confirma a projeção do
servidor com todos estes requisitos:

- `productState = READY_TO_HATCH`;
- exatamente três poses;
- roles distintas `normal`, `listening`, `transcribing`;
- `poseSetQc.status = passed`;
- `poseSetQc.version = pose-set-visual-v3`.

O hatch usa:

- `POST /api/mascot/incubations/[jobId]/hatch`.

##### Visualização das poses

Quando existem três poses, exibe um showcase:

- primeira pose como hero;
- demais poses como cards;
- legenda conforme `POSE_ROLE_LABELS`;
- imagens por proxy BFF privado.

##### Estado HATCHED

Quando `productState = HATCHED`:

- mostra confirmação do nascimento;
- monta `PostBirthJournal`;
- mantém as imagens aprovadas e o Master em somente leitura;
- não declara pacote, biblioteca ou Android prematuramente.

##### Falha

Mostra mensagem de erro recebida do BFF. O retry é controlado pela resposta e
nunca cria uma segunda incubação automaticamente.

#### `PostBirthJournal`

Arquivo: `components/incubator/PostBirthJournal.tsx`.

Responsabilidades:

- carregar perfil por `GET /api/mascot/incubations/[jobId]/profile`;
- editar nome entre 2 e 32 caracteres;
- salvar por `PATCH` usando `configurationRevision`;
- lidar com conflito otimista `409`;
- ativar por `POST /api/mascot/incubations/[jobId]/activate`;
- usar `Idempotency-Key` estável durante a ativação;
- exibir `DRAFT` e `ACTIVE`;
- tornar o nome somente leitura depois de `ACTIVE`;
- informar erro de sessão, validação, conflito e indisponibilidade.

#### Divisão recomendada

Separar em três blocos:

```text
IncubationJournalShell
├── IncubationStatusPanel
├── MasterSelectionPanel
├── PoseShowcase
├── HatchAction
└── PostBirthPanel
    ├── PostBirthProfileForm
    ├── PostBirthActivationAction
    └── PostBirthReadonlySummary
```

O Jornal deve continuar sendo o dono da jornada de um único `jobId`; a
biblioteca apenas lista e aponta para ele.

---

### 4.6 `/account/update-password` — Atualização de senha

Arquivo de entrada: `app/account/update-password/page.tsx`

Componente: `components/auth/PasswordUpdateForm.tsx`.

#### O que a página faz

- recebe sessão criada pelo link de recuperação;
- coleta nova senha e confirmação;
- exige pelo menos 6 caracteres;
- impede envio quando as duas senhas são diferentes;
- chama `supabase.auth.updateUser`;
- devolve feedback de sucesso ou falha;
- oferece retorno para `/`.

Rotas que participam do fluxo:

- `GET /auth/callback` — troca código de recuperação por sessão e redireciona;
- `POST /auth/signout` — revoga/limpa sessão no servidor.

#### Divisão recomendada

Manter isolada como domínio `auth/account-recovery`. Não deve depender de
componentes de criação, incubação ou biblioteca, exceto pela marca e pelo
`StageButton` compartilhado.

## 5. Componentes compartilhados atuais

| Pasta/arquivo | Responsabilidade |
| --- | --- |
| `components/actions/StageButton.tsx` | Botão visual com tons e estados comuns |
| `components/brand/PuleiroWordmark.tsx` | Marca textual do produto |
| `components/navigation/Header.tsx` | Navegação, sessão e logout |
| `components/status/StatusMessage.tsx` | Mensagem editorial de status |
| `components/status/GenerationProgress.tsx` | Progresso de nascimento/poses |
| `components/editorial/EditorialDetails.tsx` | Folio de etapa e nota editorial |
| `components/stage/PuleiroStage.tsx` | Moldura visual, imagem de palco e animações |
| `components/auth/AccountGate.tsx` | Sessão, login, cadastro e recuperação |
| `components/auth/PasswordUpdateForm.tsx` | Troca de senha |
| `components/PuleiroExperience.tsx` | Orquestrador do fluxo legado |

### Componentes específicos de criação/nascimento

| Arquivo | Responsabilidade |
| --- | --- |
| `EntryStage.tsx` | Entrada da jornada |
| `PhotoSelectionStage.tsx` | Seleção/drag-and-drop e preparação de foto |
| `PhotoPreviewStage.tsx` | Confirmação local antes do upload |
| `SubjectConfirmationStage.tsx` | Pessoa, animal, objeto ou outro |
| `MasterDecisionStage.tsx` | Escolha entre Masters |
| `MascotConfigurationDialog.tsx` | Nome e configurações de pose do fluxo legado |
| `PoseSelectionStage.tsx` | Escolha de uma pose por função |
| `PoseSetReadyStage.tsx` | Conferência das três imagens finais |
| `MascotCodeStage.tsx` | Código da biblioteca após conclusão do fluxo legado |
| `PreparingStage.tsx` | Estados assíncronos sem ação imediata |
| `ErrorStage.tsx` | Erros recuperáveis por categoria |
| `IncubatorCreationExperience.tsx` | Orquestra a criação assíncrona |
| `IncubationJournal.tsx` | Orquestra o jornal de um job |
| `PostBirthJournal.tsx` | Nome e ativação pós-nascimento |

## 6. Domínio de dados e BFF

O frontend não fala diretamente com Modal ou com a service role do Supabase.
O fluxo esperado é:

```text
Browser
  → Supabase Auth/SSR
  → Next.js BFF owner-scoped
  → Store de domínio/Supabase
  → Provider Modal via JWT curto
```

### Stores de domínio

| Arquivo | Responsabilidade |
| --- | --- |
| `attempt-store.ts` | tentativa, job, estado projetado e hatch |
| `library-store.ts` | mascotes pessoais, nome, favoritos e exclusão |
| `community-store.ts` | publicação, favoritos e itens salvos |
| `post-birth-store.ts` | perfil DRAFT/ACTIVE e revisão otimista |
| `package-store.ts` | manifesto V1, assets, checksums e pacote |
| `import-store.ts` | códigos temporários, hash, expiração e revogação |
| `telemetry-store.ts` | métricas privadas de geração |
| `asset-check-store.ts` | reconciliação de verificações de assets |
| `library-thumbnail-store.ts` | thumbnails privados da biblioteca |
| `modal-provider.ts` | adapter BFF → Modal v2 |
| `mock-provider.ts` | provider de desenvolvimento/teste |
| `provider.ts` | seleção entre `mock` e `modal` |

### Mapa de rotas BFF/API

#### Geração e incubação

| Rota | Método | Função |
| --- | --- | --- |
| `/api/mascot/capabilities` | GET | capacidades/flags operacionais |
| `/api/mascot/subject-hint` | POST | sugestão de identidade da foto |
| `/api/mascot/incubations` | GET/POST | listar e registrar incubação |
| `/api/mascot/incubations/[jobId]` | GET | recuperar uma incubação |
| `/api/mascot/incubations/[jobId]/masters/[masterId]/select` | POST | escolher Master da incubadora |
| `/api/mascot/incubations/[jobId]/hatch` | POST | confirmar hatch server-side |
| `/api/mascot/incubations/[jobId]/profile` | GET/PATCH | ler/alterar perfil pós-nascimento |
| `/api/mascot/incubations/[jobId]/activate` | POST | ativar perfil pós-nascimento |

#### Fluxo legado de jobs

| Rota | Método | Função |
| --- | --- | --- |
| `/api/mascot/jobs` | POST | registrar job legado |
| `/api/mascot/jobs/current` | GET | recuperar job atual |
| `/api/mascot/jobs/[jobId]` | GET/DELETE | consultar/excluir job |
| `/api/mascot/jobs/[jobId]/master-generations` | POST | iniciar Master |
| `/api/mascot/jobs/[jobId]/masters/[masterId]` | GET | servir imagem Master privada |
| `/api/mascot/jobs/[jobId]/masters/[masterId]/approve` | POST | aprovar Master |
| `/api/mascot/jobs/[jobId]/configuration` | PATCH | salvar nome/poses legados |
| `/api/mascot/jobs/[jobId]/pose-generations` | POST | iniciar poses |
| `/api/mascot/jobs/[jobId]/pose/[role]` | GET | servir pose privada |
| `/api/mascot/jobs/[jobId]/complete` | POST | finalizar biblioteca |

#### Biblioteca e pacote

| Rota | Método | Função |
| --- | --- | --- |
| `/api/mascot/library` | GET | lista paginada da biblioteca |
| `/api/mascot/library/[itemId]` | PATCH/DELETE | alterar ou excluir mascote |
| `/api/mascot/library/[itemId]/pose/[role]` | GET | pose privada da biblioteca |
| `/api/mascot/library/[itemId]/publication` | POST | publicar/despublicar |
| `/api/mascot/library/[itemId]/package` | POST | preparar pacote a partir da biblioteca |
| `/api/mascot/incubations/[jobId]/package` | POST | preparar pacote pós-nascimento |
| `/api/mascot/incubations/[jobId]/import-code` | POST | emitir Import Code |
| `/api/mascot/import/[code]` | GET | resolver pacote para Android |

#### Comunidade

| Rota | Método | Função |
| --- | --- | --- |
| `/api/mascot/community` | GET | listar mascotes publicados |
| `/api/mascot/community/saved` | GET | listar mascotes salvos pelo usuário |
| `/api/mascot/community/[itemId]/pose/[role]` | GET | pose pública |
| `/api/mascot/community/[itemId]/favorite` | POST | favoritar/desfavoritar |
| `/api/mascot/community/[itemId]/save` | POST | salvar/remover da biblioteca |

## 7. Organização de pastas recomendada

O código atual está organizado principalmente por tipo técnico (`components`,
`lib`, `app`). Para dividir responsabilidades sem quebrar as URLs, uma
organização por domínio pode ser introduzida gradualmente:

```text
app/
├── (public)/
│   ├── page.tsx
│   ├── explorar/page.tsx
│   └── criar/page.tsx
├── (account)/
│   ├── meus-mascotes/page.tsx
│   ├── incubadora/[jobId]/page.tsx
│   └── account/update-password/page.tsx
└── api/mascot/                 # manter contratos HTTP estáveis

features/
├── home/
├── auth/
├── creation-legacy/
├── async-incubator/
├── post-birth/
├── personal-library/
├── community/
└── package-import/

components/shared/
├── actions/
├── brand/
├── navigation/
├── stage/
└── status/

lib/domains/
├── attempts/
├── library/
├── community/
├── post-birth/
├── packaging/
└── import-code/
```

Essa é uma proposta de destino, não uma instrução para mover tudo de uma vez.
As rotas `app/api` devem permanecer estáveis para não quebrar o frontend, os
testes, o contrato Android ou o Modal.

## 8. Plano de divisão por responsabilidade

### Fase A — separar leitura do inventário

1. Manter as URLs existentes.
2. Criar componentes de página finos.
3. Extrair tipos e modelos de resposta para módulos de domínio.
4. Não alterar contratos BFF.

### Fase B — decompor a biblioteca

Extrair nesta ordem:

1. `IncubatorShelf`;
2. `PostBirthProfileShelf`;
3. `LibraryControls`;
4. `MascotCard`;
5. diálogos de poses, pacote e exclusão;
6. `SavedCommunityCollection`;
7. hook de carregamento/paginação da biblioteca;
8. hook de mutations do card.

Critério: cada módulo deve ter uma responsabilidade e testes próprios; o
comportamento owner-scoped e os estados de pacote não podem ser duplicados no
cliente.

### Fase C — separar as duas criações

1. Extrair a jornada assíncrona para `features/async-incubator`.
2. Manter o fluxo legado em `features/creation-legacy`.
3. Deixar `app/criar/page.tsx` somente como seletor de configuração.
4. Compartilhar somente primitives visuais, auth e catálogo de poses.

### Fase D — separar incubação de pós-nascimento

1. `IncubationJournal` deve cuidar de job, polling, Master, poses e hatch.
2. `PostBirthJournal` deve cuidar de perfil, nome, revisão e ativação.
3. A biblioteca deve apenas projetar listas e links de retomada.
4. O servidor continua sendo a autoridade de `HATCHED`, `ACTIVE` e
   `READY_TO_HATCH`.

### Fase E — consolidar pacote e comunidade

1. Pacote/importação deve ficar fora dos cards de comunidade.
2. O card pessoal pode disparar preparação de pacote, mas a lógica deve viver
   em um módulo de operação de pacote.
3. A comunidade deve conhecer somente mascotes públicos, relações de favorito
   e salvamento.

## 9. Pontos de atenção para a reorganização

- Não mover ou renomear URLs sem redirects/testes de regressão.
- Não permitir que a UI declare `HATCHED` ou `ACTIVE` localmente.
- Não misturar `mascot_code` da biblioteca com `Import Code` Android.
- Não expor service role, JWT, URL assinada, foto ou código em logs.
- Não mover stores Supabase para componentes client-side.
- Manter o Master aprovado somente leitura no pós-nascimento.
- Preservar o isolamento entre Plano 1, Plano 2 e Plano 3.
- Separar mascote em andamento, perfil pós-nascimento e mascote pronto na
  interface, mesmo que a fonte de dados continue sendo a mesma página.
- Validar com os testes existentes depois de cada extração:
  `npm test`, `npm run lint`, `npx tsc --noEmit` e os E2E aplicáveis.

## 10. Arquivos de referência para qualquer novo agente

Leitura mínima obrigatória:

1. `README.md`;
2. `docs/MODAL_CONTRACT.md`;
3. `docs/ASYNC_INCUBATOR_V1.md`;
4. `docs/POST_BIRTH_RUNBOOK.md`;
5. `docs/MASCOT_PACKAGE_IMPORT.md`;
6. este inventário;
7. a página e os componentes do domínio que será alterado;
8. os testes correspondentes antes de editar.

Leitura operacional complementar:

- `docs/MODAL_INTEGRATION_PLAN.md`;
- `docs/PLAN3_FINAL_AUDIT.md`;
- `docs/STAGING_VALIDATION.md`;
- `docs/POSE_OPERATION_DIAGNOSTIC.md`;
- `docs/GENERATION_METRICS.md`;
- `docs/GPU_SMOKE_TEST_RUNBOOK.md` — não executar smoke real sem autorização
  explícita.

## 11. Resultado do levantamento

O site não é apenas uma sequência de seis páginas independentes. Ele é uma
combinação de:

- uma Central de navegação;
- duas máquinas de criação concorrentes em `/criar`;
- um Jornal de incubação com autoridade server-side;
- uma biblioteca que hoje funciona como prateleira, retomada, gestão,
  empacotamento e ponte para a comunidade;
- uma comunidade pública;
- uma pequena área de autenticação.

O maior ganho de reorganização virá de três separações: **criação legacy vs.
incubadora**, **biblioteca vs. retomada/pós-nascimento** e **card visual vs.
operações de pacote/favorito/publicação**. Essas separações reduzem o tamanho
dos orquestradores sem mudar os contratos já validados.
