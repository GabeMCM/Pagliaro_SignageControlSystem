# 12 - Tela Publica de Senha

## Objetivo

Criar a primeira tela do link de envio, exigindo senha antes de mostrar o formulario.

## Escopo

- Rota publica de envio.
- Validacao da senha.
- Linguagem respeitosa.
- Feature frontend propria.
- Rotas backend em modulo proprio.

## Instrucoes de desenvolvimento

1. Criar feature `front/src/features/public-submission-password`.
2. Criar rota frontend publica, por exemplo `/enviar/:token`.
3. Ao abrir a rota, buscar dados minimos da sala pelo token:
   - nome do homenageado
   - se o link esta ativo
4. Exibir campo de senha antes de qualquer formulario.
5. Criar endpoint `POST /api/submissions/:token/verify` no modulo de submissao publica.
6. Ao validar senha, guardar permissao temporaria no estado da pagina ou em token curto de sessao.
7. Criar slot/registry para o conteudo autorizado de envio, para a etapa 13 plugar o formulario sem editar a tela de senha.
8. Se senha errada, mostrar mensagem simples e calma.
9. Se link expirado/inativo, mostrar pagina sensivel sem termos tecnicos.

## Criterios de aceite

- Formulario nao aparece antes da senha correta.
- Link inativo nao permite envio.
- A tela nao mostra dados administrativos.
- Linguagem evita tom frio ou excessivamente tecnico.
- O formulario futuro entra por slot/registry, nao por edicao da tela de senha.

## Fora do escopo

- Formulario completo de envio.
- Upload de midia.
