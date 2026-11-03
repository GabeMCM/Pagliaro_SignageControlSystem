# 02 - Criar Kernel Node/Fastify, PostgreSQL e ORM

## Objetivo

Criar o esqueleto tecnico append-only do backend Node/Fastify com PostgreSQL e Drizzle.

## Escopo

- Criar backend novo em pasta propria, sem misturar responsabilidades no backend Deno existente.
- Configurar Fastify com autoload.
- Configurar conexao com PostgreSQL.
- Configurar Drizzle.
- Preparar scripts de migration.
- Criar pontos oficiais de composicao.

## Instrucoes de desenvolvimento

1. Criar pasta `server-node/`.
2. Configurar Node.js, TypeScript e Fastify.
3. Instalar/configurar `@fastify/autoload`.
4. Criar kernel minimo:
   - `src/kernel/create-app.ts`
   - `src/kernel/config.ts`
   - `src/kernel/errors.ts`
   - `src/kernel/events.ts`
5. Criar pastas de autoload:
   - `src/plugins`
   - `src/modules`
6. Configurar plugin de banco em arquivo novo, por exemplo `src/plugins/01-db/index.ts`.
7. Configurar Drizzle com schema glob, por exemplo `src/modules/**/db/schema.ts`.
8. Criar script/task para rodar migrations.
9. Criar provider local de storage vazio ou minimo como ponto oficial de composicao.
10. Garantir que falha de conexao retorne erro claro no boot ou em healthcheck.

## Criterios de aceite

- O kernel nao contem regra de negocio.
- Novos plugins e modulos podem ser carregados sem editar `create-app.ts`.
- O projeto conecta em PostgreSQL usando `DATABASE_URL`.
- Existe uma forma documentada de criar/rodar migrations.
- Drizzle consegue encontrar schemas por glob de modulos.
- Nenhum arquivo do backend Deno atual precisa ser removido nesta etapa.

## Fora do escopo

- Migrar dados antigos.
- Criar todas as telas novas.
- Criar regras de negocio de homenagem.
