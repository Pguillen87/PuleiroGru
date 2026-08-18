# Pacote e importação do mascote

## Estado desta fase

O Supabase é a fonte de verdade do pacote: registra `mascot_packages`, `mascot_import_codes` e os assets privados no bucket `mascot-packages`.

O Modal continua responsável somente pela geração. A publicação do pacote reutiliza as poses já existentes e não agenda GPU.

## Endpoints

`POST /api/mascot/library/{itemId}/package`

- exige sessão Supabase;
- é owner-scoped;
- reutiliza um pacote já publicado;
- copia as três poses para o Storage privado;
- registra checksum, dimensões e manifesto;
- não inicia geração.

`GET /api/mascot/import/{code}`

- resolve um código registrado;
- rejeita código inválido, revogado ou inexistente;
- cria URLs assinadas de curta duração;
- devolve manifesto compatível com o importador Android;
- não expõe service role nem caminho interno sem assinatura.

## Limitação explícita

O código atual da biblioteca só se torna instalável depois que o endpoint de publicação de pacote for chamado para o item. A criação da biblioteca não deve prometer instalação automática antes desse passo.

O Android mantém a validação HTTPS, MIME, tamanho, dimensões, checksum e as três funções `NORMAL`, `LISTENING` e `TRANSCRIBING`.
