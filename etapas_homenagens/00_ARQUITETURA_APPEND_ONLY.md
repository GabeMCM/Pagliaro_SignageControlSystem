# Arquitetura Append-Only Modular

## Principio principal

Um arquivo pronto nao deve receber nova responsabilidade funcional. Ele so deve ser alterado para:

- corrigir defeito;
- refatorar a propria responsabilidade original;
- ajustar tipagem, formatacao ou compatibilidade sem criar comportamento novo;
- regenerar arquivo automatico de ferramenta, quando aplicavel.

Nova responsabilidade deve entrar como novo arquivo, novo modulo, novo plugin, nova migration, novo renderer, novo handler ou novo provider.

## Stack recomendada

- Backend: Node.js + TypeScript + Fastify.
- Carregamento backend: `@fastify/autoload`.
- Frontend: React/Vite com organizacao por features e rotas por arquivo.
- Banco: PostgreSQL.
- ORM: Drizzle.
- Storage: interface propria com provider local no MVP e S3/R2/MinIO depois.
- Tempo real: WebSocket ou SSE por modulo/plugin.

## Contrato de backend

O backend deve ter um kernel pequeno e estavel:

```txt
server-node/
  src/
    kernel/
      create-app.ts
      config.ts
      errors.ts
      module-loader.ts
    plugins/
      00-env/
      01-db/
      02-storage/
    modules/
      tributees/
      memorial-rooms/
      submissions/
      moderation/
```

Regras:

- `kernel/*` nao recebe regra de negocio.
- `plugins/*` oferece capacidades tecnicas.
- `modules/*` contem regras de dominio.
- Cada modulo exposto pelo Fastify deve ser carregado por autoload.
- Novas rotas entram em novos arquivos `routes.ts` dentro do modulo.
- Novos schemas de banco entram em arquivos `db/schema.ts` dentro do modulo.
- Novas migrations sao sempre novos arquivos.
- Eventos de dominio devem ser usados para evitar editar modulo antigo quando outro modulo precisa reagir.

## Contrato de frontend

O frontend deve ser organizado por feature:

```txt
front/src/
  app-kernel/
    feature-loader.ts
    route-loader.ts
    panel-registry.ts
  features/
    tributee-create/
    submission-access-panel/
    public-submission-password/
    public-submission-form/
    tribute-media-field/
```

Regras:

- Uma tela base pode criar slots de extensao.
- Uma etapa posterior nao deve editar a tela base para adicionar painel/campo.
- Paineis, campos e acoes entram como arquivos novos descobertos por registry.
- O uso de `import.meta.glob` e aceitavel como ponto oficial de composicao.
- Arquivos gerados automaticamente por roteador podem mudar por ferramenta, mas nao devem receber edicao manual de responsabilidade.

## Pontos oficiais de composicao

Estes pontos podem existir desde o inicio para evitar edicoes futuras:

- Autoload de plugins Fastify.
- Autoload de modulos de dominio.
- Glob de schemas Drizzle.
- Registry de paineis administrativos por sala.
- Registry de campos do formulario publico.
- Registry de renderers do player.
- Registry de politicas de audio/video.
- Registry de fontes de audio.
- Event bus de dominio.

## Regra de aceite arquitetural

Ao finalizar cada etapa, responder:

1. Quais arquivos novos foram criados?
2. Algum arquivo existente recebeu nova responsabilidade?
3. Se sim, isso era um ponto oficial de composicao ja previsto?
4. Se nao era, a etapa deve ser replanejada.
