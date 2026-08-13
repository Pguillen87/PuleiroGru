# Puleiro do GRU — produto Web

O Puleiro do GRU é o lugar onde os mascotes do aplicativo GRU nascem. Esta fase implementa `Entrada → Foto → Upload → Job → Preparação → Mascote mestre → Aprovação ou nova tentativa`, com API intermediária e providers isolados.

Princípio: **uma decisão funcional por vez dentro de um cenário rural vivo**.

O site Web, o aplicativo Android e o serviço Modal são camadas separadas. O site não altera nem incorpora a stack Android. O mock é o provider padrão verificável; o adapter Modal foi implementado segundo o contrato existente, mas a ativação real depende de autenticação Firebase/App Check e deploy válidos. As poses, pacote, código do mascote, instalação, pagamento, publicação e biblioteca não pertencem a esta fase.
