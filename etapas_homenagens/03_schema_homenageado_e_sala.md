# 03 - Schema de Homenageado e Sala

## Objetivo

Criar as tabelas iniciais para homenageado e sala de homenagem.

## Escopo

- Tabela de homenageados.
- Tabela de salas de homenagem.
- Slug gerado pelo sistema.
- Status na sala.
- Sem foto e sem biografia no MVP.
- Schemas em modulos separados, sem arquivo central de schema manual.

## Instrucoes de desenvolvimento

1. Criar modulo `server-node/src/modules/tributees`.
2. Criar arquivo `server-node/src/modules/tributees/db/schema.ts`.
3. Criar tabela `tributees`.
4. Campos minimos:
   - `id`
   - `full_name`
   - `birth_date`
   - `death_date`
   - `responsible_name`
   - `responsible_phone`
   - `created_at`
   - `updated_at`
5. Criar modulo `server-node/src/modules/memorial-rooms`.
6. Criar arquivo `server-node/src/modules/memorial-rooms/db/schema.ts`.
7. Criar tabela `memorial_rooms`.
8. Campos minimos:
   - `id`
   - `tributee_id`
   - `slug`
   - `status`
   - `theme`
   - `frame_style`
   - `created_at`
   - `updated_at`
9. Definir status possiveis:
   - `draft`
   - `active`
   - `closed`
   - `archived`
10. Criar indice unico para `memorial_rooms.slug`.
11. Implementar funcao utilitaria para gerar slug a partir do nome do homenageado em arquivo novo do modulo `memorial-rooms`.
12. Garantir resolucao de conflito de slug com sufixo incremental ou trecho curto do ID.
13. Nao criar vinculo com playlist de audio nesta etapa. A playlist sera criada e vinculada na etapa 06.

## Estrutura esperada

```txt
server-node/src/modules/
  tributees/
    db/schema.ts
  memorial-rooms/
    db/schema.ts
    slug.ts
```

## Criterios de aceite

- Homenageado nao tem campo de status da sala.
- Sala tem campo `status`.
- Admin nao precisa informar slug.
- Migrations criam tabelas e indices corretamente.
- Nenhum campo depende de tabela criada em etapa posterior.
- Nenhum schema novo exige editar um arquivo central de schema.

## Fora do escopo

- Foto do homenageado.
- Biografia do homenageado.
- Tela administrativa.
