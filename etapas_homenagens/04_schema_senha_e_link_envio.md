# 04 - Schema de Senha e Link de Envio

## Objetivo

Criar a estrutura de acesso para envio de homenagens por senha/token.

## Escopo

- Token ou senha por sala.
- Link dedicado de envio.
- Controle de validade e ativacao.
- Schema em modulo proprio.

## Instrucoes de desenvolvimento

1. Criar modulo `server-node/src/modules/submission-access`.
2. Criar arquivo `server-node/src/modules/submission-access/db/schema.ts`.
3. Criar tabela `submission_access`.
4. Campos minimos:
   - `id`
   - `room_id`
   - `token`
   - `password_hash`
   - `active`
   - `expires_at`
   - `max_submissions`
   - `created_at`
   - `updated_at`
5. O token deve ser usado na URL.
6. A senha nunca deve ser salva em texto puro.
7. Criar utilitario para gerar senha curta legivel em arquivo novo do modulo.
8. Criar utilitario para gerar token seguro para URL em arquivo novo do modulo.

## Criterios de aceite

- Link e senha sao entidades separadas.
- Senha e validada por hash.
- Registro pode ser desativado sem apagar historico.
- A etapa nao exige editar schema central.

## Fora do escopo

- Tela publica de senha.
- Formulario de homenagem.
