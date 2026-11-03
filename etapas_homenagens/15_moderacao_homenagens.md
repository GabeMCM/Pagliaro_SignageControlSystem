# 15 - Moderacao de Homenagens

## Objetivo

Criar fluxo administrativo para aprovar ou rejeitar homenagens antes de exibir na sala.

## Escopo

- Listar pendentes.
- Aprovar.
- Rejeitar.
- Editar texto e legenda.
- Remover midia.
- Feature administrativa propria.
- Nav/painel via registry.

## Instrucoes de desenvolvimento

1. Criar modulo backend `tribute-moderation`.
2. Criar endpoints administrativos no modulo:
   - `GET /api/admin/memorial-rooms/:id/tributes?status=pending`
   - `PATCH /api/admin/tributes/:id/approve`
   - `PATCH /api/admin/tributes/:id/reject`
   - `PUT /api/admin/tributes/:id`
3. Criar feature frontend `front/src/features/tribute-moderation`.
4. Criar rota propria ou painel via registry, sem editar tela base da sala.
5. Mostrar:
   - mensagem
   - legenda da midia, quando existir
   - preview da midia
   - nome, telefone e parentesco de quem enviou
6. Permitir aprovar/rejeitar individualmente.
7. Permitir corrigir mensagem e legenda antes de aprovar. Esta correcao altera dados, nao aumenta responsabilidade de arquivo.
8. Publicar evento `tribute.approved` ao aprovar.
9. Garantir que apenas `approved` aparece no player.

## Criterios de aceite

- Homenagem pendente nao aparece publicamente.
- Admin consegue aprovar.
- Admin consegue rejeitar.
- Mensagem e legenda podem ser revisadas separadamente.
- Moderacao foi adicionada como modulo/feature propria.

## Fora do escopo

- Moderacao automatica por IA.
- Permissoes granulares por usuario.
