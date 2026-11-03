# 11 - Admin de Senha e Link de Envio

## Objetivo

Permitir ao administrador gerar, visualizar e desativar a senha/link de envio da sala.

## Escopo

- Gerar acesso de envio por sala.
- Mostrar link dedicado.
- Regenerar senha.
- Desativar acesso.
- Criar painel administrativo como extensao de sala, nao como edicao da tela base.

## Instrucoes de desenvolvimento

1. Criar rotas no modulo `submission-access`, carregadas por autoload.
2. Criar `POST /api/admin/memorial-rooms/:id/submission-access`.
3. Criar `GET /api/admin/memorial-rooms/:id/submission-access`.
4. Criar `DELETE` ou `PATCH` para desativar acesso.
5. Criar feature frontend nova, por exemplo `front/src/features/submission-access-panel`.
6. Registrar o painel pelo registry de paineis da sala criado na etapa 10.
7. O painel deve exibir:
   - link de envio
   - senha atual exibida apenas no momento de criacao ou regeneracao
   - botao copiar link
   - botao regenerar senha
   - botao desativar
8. Evitar mostrar hash de senha.
9. Informar que a senha deve ser compartilhada apenas com responsaveis autorizados.

## Criterios de aceite

- Link de envio existe por sala.
- Senha nao fica salva em texto puro.
- Acesso pode ser desativado.
- Admin consegue copiar o link.
- A tela base da sala nao recebe nova responsabilidade.

## Fora do escopo

- Tela publica de envio.
- Autenticacao administrativa completa.
