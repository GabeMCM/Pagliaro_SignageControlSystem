# 10 - Admin de Cadastro de Homenageado

## Objetivo

Criar a tela administrativa para cadastrar homenageado e visualizar a sala gerada.

## Escopo

- Tela simples no admin.
- Formulario sem campo de slug.
- Sem foto e biografia no MVP.
- Criar slots de extensao do admin para etapas futuras.

## Instrucoes de desenvolvimento

1. Criar feature `front/src/features/tributee-create`.
2. Criar rota no frontend para novo cadastro, por exemplo `/admin/homenageados/novo`.
3. Campos do formulario:
   - nome completo
   - data de nascimento
   - data de falecimento
   - nome do responsavel
   - telefone do responsavel
4. Remover qualquer campo manual de slug.
5. Ao salvar, chamar `POST /api/admin/tributees`.
6. Apos sucesso, exibir:
   - nome do homenageado
   - status da sala
   - URL publica
   - URL do player
7. Criar ou usar registry de paineis de sala, por exemplo `room-detail-panels`, usando `import.meta.glob`.
8. Criar shell de detalhes da sala com slot de paineis, sem conhecer paineis futuros.
9. Incluir estado de loading, erro e sucesso.
10. Usar linguagem sobria e direta.

## Criterios de aceite

- Admin consegue cadastrar sem preencher slug.
- Tela nao pede foto.
- Tela nao pede biografia.
- Sala criada aparece com links.
- Etapas futuras conseguem adicionar paineis a sala sem editar a tela base.

## Fora do escopo

- Moderacao.
- Senha/link de envio.
