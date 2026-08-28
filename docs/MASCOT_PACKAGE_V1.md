# Pacote operacional de mascote V1

Um mascote fica **pronto para uso** somente quando o pacote privado V1 está com `mascot_packages.status = ready`.

- O pacote contém exatamente `NORMAL`, `LISTENING` e `TRANSCRIBING`; o Master continua privado e não integra o contrato Android.
- Antes de `ready`, assets, manifesto e código são inertes. A importação pública retorna somente pacotes `ready`.
- Cada asset usa os bytes do derivado QC-approved do Modal, com SHA-256, MIME, tamanho e dimensões registrados no manifesto V1.
- A gravação pode ser retomada de forma idempotente: reutiliza o mesmo item, pacote pendente, código e caminhos imutáveis após revalidar os bytes.
- Falhas deixam o pacote em `pending` e a tentativa Web em `failed` com um código seguro. Não há retry automático.
- O Android V1 mantém download, checksum e promoção local atômica: falhar uma das três poses não ativa pacote parcial.

## Staging e segurança

Storage `mascot-packages` é privado; as URLs de importação são assinadas, curtas e `no-store`. Logs devem conter somente IDs técnicos, estágio, duração, quantidade de assets e prefixos de hash.

**PENDENTE PARA PRODUÇÃO:** rate limiting/WAF da rota pública `GET /api/mascot/import/{code}`. Nenhum rollout de Production pode ser aprovado antes dessa proteção.
