# Biblioteca de mascotes

## Biblioteca pessoal — entregue nesta etapa

Cada item criado pelo usuário fica associado à sua conta Supabase e é protegido por RLS. A página permite busca por código, ordenação, favoritos e cópia do código da biblioteca.

O código atual (`GRU-XXXX-XXXX`) identifica o item privado. Ele **não** é ainda um código de instalação Android: esse contrato depende de pacote, manifesto, checksum e rota de resolução.

## Biblioteca pública — próxima etapa de produto

A comunidade será uma superfície separada da biblioteca pessoal. Publicar exige consentimento explícito e reversível; criar ou pagar por um mascote não autoriza publicação automática.

Antes de implementá-la, criar tabelas separadas para:

- perfil público do mascote e estado de moderação;
- voto por usuário, com unicidade por mascote e usuário;
- salvamento de um item público na biblioteca pessoal;
- métricas agregadas de uso, nunca contadores alteráveis pelo navegador.

Ranking deve vir de agregados no servidor, com limites, denúncia e moderação. Um mascote privado jamais deve ser enumerável ou copiável por código público.

## GRU Android

O botão **Abrir no GRU** somente será habilitado depois de existir um contrato aprovado de pacote/manifest e um deep link Android documentado. Até lá, o botão permanece desabilitado para não prometer uma instalação que o aplicativo ainda não consegue concluir.
