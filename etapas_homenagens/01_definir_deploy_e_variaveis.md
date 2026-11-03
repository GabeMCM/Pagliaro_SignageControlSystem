# 01 - Definir Stack, Arquitetura e Variaveis

## Objetivo

Definir stack, arquitetura append-only modular e como o frontend publicado vai se comunicar com o backend.

## Escopo

- Adotar backend em Node.js + TypeScript + Fastify.
- Usar `@fastify/autoload` para carregar plugins e modulos.
- Manter frontend em React/Vite, organizado por features e registries.
- Permitir backend local somente se houver URL publica segura.
- Preparar configuracao para CORS, URL publica, banco e storage.
- Documentar a regra: arquivo pronto nao recebe nova responsabilidade funcional.

## Instrucoes de desenvolvimento

1. Criar documento ou atualizar README com a decisao de stack:
   - Node.js + TypeScript + Fastify.
   - React/Vite.
   - PostgreSQL.
   - Drizzle.
   - Storage via provider.
2. Criar um arquivo de exemplo de variaveis, como `.env.example`, sem segredos reais.
3. Incluir variaveis para:
   - `DATABASE_URL`
   - `PUBLIC_APP_URL`
   - `API_BASE_URL`
   - `CORS_ORIGINS`
   - `STORAGE_PROVIDER`
   - `STORAGE_BUCKET`
   - `STORAGE_ENDPOINT`
   - `STORAGE_ACCESS_KEY_ID`
   - `STORAGE_SECRET_ACCESS_KEY`
4. Definir pastas do novo backend, por exemplo `server-node/`.
5. Documentar que frontend publicado com backend local exige tunnel seguro ou endpoint publico HTTPS.
6. Registrar a politica de arquivo fechado:
   - nova responsabilidade cria novo modulo/arquivo;
   - arquivo existente so muda por correcao, refatoracao interna ou ponto oficial de composicao.

## Criterios de aceite

- Existe um `.env.example` claro.
- A stack Node/Fastify esta documentada como direcao.
- O backend nao depende de valores fixos para URL publica, CORS, banco ou storage.
- A decisao backend local versus cloud esta documentada.
- A regra append-only esta documentada antes de qualquer codigo novo.

## Fora do escopo

- Subir infraestrutura real.
- Configurar Cloudflare Tunnel ou VPS de verdade.
- Migrar o backend Deno atual.
