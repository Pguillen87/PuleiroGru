# Puleiro do GRU — produto Web

O Puleiro do GRU é o lugar onde os mascotes do aplicativo GRU nascem. Esta fase implementa `Entrada → Foto → Upload → Job → Preparação → Mascote mestre → Aprovação ou nova tentativa`, com API intermediária e providers isolados.

Princípio: **uma decisão funcional por vez dentro de um cenário rural vivo**.

O site Web, o aplicativo Android e o serviço Modal são camadas separadas. O Puleiro Web usa Supabase Auth e sessão SSR; o Android preserva Firebase nas rotas Modal v1. O BFF converte o `user.id` validado em JWT curto para o Modal v2. As poses, pacote, código do mascote, instalação, pagamento, publicação e biblioteca não pertencem a esta fase.
