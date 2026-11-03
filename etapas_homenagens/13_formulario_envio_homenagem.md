# 13 - Formulario de Envio de Homenagem

## Objetivo

Criar a base do formulario publico simples para envio de homenagens, ainda sem upload de midia.

## Escopo

- Exibir somente apos senha correta.
- Pedir poucos campos.
- Preparar a separacao entre mensagem e legenda para a etapa de midia.
- Enviar homenagem textual pendente.
- Preparar a tela para receber a extensao de midia na etapa 14.
- Criar registry de campos do formulario.

## Instrucoes de desenvolvimento

1. Criar feature `front/src/features/public-submission-form`.
2. Plugar o formulario no slot autorizado criado na etapa 12.
3. Criar registry de campos do formulario com `import.meta.glob`, por exemplo `front/src/features/submission-form-fields/*/index.tsx`.
4. Criar campos base como modulos de campo:
   - mensagem principal
   - nome de quem esta enviando
   - telefone de quem esta enviando
   - grau de proximidade ou parentesco
5. Nao exibir campos de midia ou legenda nesta etapa.
6. Usar textos curtos e acolhedores.
7. Nao pedir cadastro de usuario.
8. Nao pedir email no MVP.
9. Criar endpoint `POST /api/submissions/:token/tributes`.
10. Salvar homenagem como `pending`.
11. Nao exibir a homenagem automaticamente.
12. Mostrar confirmacao apos envio.

## Criterios de aceite

- Formulario tem apenas os campos definidos.
- Nenhum campo de midia aparece nesta etapa.
- A etapa funciona sem depender do upload que sera implementado depois.
- Envio cria homenagem pendente.
- A etapa 14 consegue adicionar midia criando um novo modulo de campo.

## Fora do escopo

- Moderacao no admin.
- Upload de midia.
- Legenda de midia.
- Processamento definitivo de video.
