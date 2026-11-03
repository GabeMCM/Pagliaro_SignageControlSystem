# 09 - API Admin de Homenageado e Sala

## Objetivo

Criar rotas administrativas para cadastrar homenageado e gerar sala automaticamente.

## Escopo

- CRUD basico de homenageado.
- Criacao automatica da sala.
- Atualizacao de status da sala.
- Slug sempre gerado pelo sistema.
- Rotas criadas como plugins Fastify nos modulos.

## Instrucoes de desenvolvimento

1. Criar arquivo de rotas no modulo apropriado, carregado por autoload.
2. Criar `POST /api/admin/tributees`.
3. Receber apenas:
   - nome completo
   - data de nascimento
   - data de falecimento
   - nome do responsavel
   - telefone do responsavel
4. Nao aceitar slug vindo do frontend.
5. Ao criar homenageado, criar sala em transacao.
6. Criar `GET /api/admin/tributees`.
7. Criar `GET /api/admin/tributees/:id`.
8. Criar `PUT /api/admin/tributees/:id`.
9. Criar `PUT /api/admin/memorial-rooms/:id/status`.
10. Retornar URLs calculadas:
   - URL publica da sala
   - URL do player
11. Nao editar arquivo central de rotas. O autoload deve registrar o modulo.

## Criterios de aceite

- Um cadastro cria homenageado e sala.
- O admin nao envia nem edita slug.
- Status e alterado apenas na sala.
- Foto e biografia nao aparecem no payload.
- Rotas aparecem por modulo novo, sem registro manual em arquivo pronto.

## Fora do escopo

- Login administrativo.
- Tela React.
