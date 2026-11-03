# 08 - Validacao e Erros da API

## Objetivo

Padronizar validacao de entrada e respostas de erro nas novas rotas.

## Escopo

- Validacao com Zod ou biblioteca equivalente.
- Erros previsiveis para frontend.
- Sanitizacao basica de campos publicos.
- Schemas de validacao por modulo, nao em arquivo central unico.

## Instrucoes de desenvolvimento

1. Adicionar Zod no backend Node se ainda nao existir.
2. Criar helper generico de erro no kernel, sem regra de dominio.
3. Criar schemas de validacao dentro de cada modulo:
   - cadastro de homenageado
   - atualizacao de sala
   - criacao de senha/link
   - validacao de senha
   - envio de homenagem
   - moderacao
4. Cada modulo deve exportar seus schemas para suas proprias rotas.
5. Padronizar formato:
   - `error`
   - `message`
   - `details`
6. Validar tamanho maximo de campos textuais.
7. Validar telefone como texto, sem tentar normalizacao agressiva no MVP.
8. Evitar retornar stack trace para cliente.

## Criterios de aceite

- Payload invalido retorna HTTP 400.
- Recurso inexistente retorna HTTP 404.
- Acesso negado retorna HTTP 401 ou 403.
- Frontend consegue mostrar mensagens claras.
- Nova feature consegue criar seu proprio schema sem editar um arquivo central de validacoes.

## Fora do escopo

- Autenticacao administrativa completa.
- Moderacao automatica de conteudo.
