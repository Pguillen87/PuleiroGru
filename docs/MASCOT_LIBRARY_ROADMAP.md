# Biblioteca de mascotes

## Biblioteca pessoal — entregue nesta etapa

Cada item criado pelo usuário fica associado à sua conta Supabase e é protegido por RLS. A página permite busca por código, ordenação, favoritos e cópia do código da biblioteca.

O código atual (`GRU-XXXX-XXXX`) identifica o item privado. Ele **não** é ainda um código de instalação Android: esse contrato depende de pacote, manifesto, checksum e rota de resolução.

## Biblioteca pública — primeira base entregue

A comunidade é uma superfície separada em `/explorar`. Publicar exige consentimento explícito e reversível; criar ou pagar por um mascote não autoriza publicação automática. A pessoa pode favoritar ou salvar um mascote público, e esses itens também aparecem na biblioteca pessoal.

As tabelas separadas preservam perfil público, favoritos e salvamentos. A leitura e as alterações passam pelo BFF; o navegador não recebe URLs privadas de assets nem permissão para enumerar mascotes privados.

## Próxima etapa de produto

Antes de abrir a comunidade amplamente, faltam denúncia, moderação, políticas de remoção, paginação/busca, categorias e agregados de instalação/uso vindos do Android. Ranking de “mais usados” só poderá existir quando a instalação/uso for comprovadamente reportado pelo app; por enquanto, “mais favoritados” é o único ranking disponível.

## GRU Android

O botão **Abrir no GRU** somente será habilitado depois de existir um contrato aprovado de pacote/manifest e um deep link Android documentado. Até lá, o botão permanece desabilitado para não prometer uma instalação que o aplicativo ainda não consegue concluir.
