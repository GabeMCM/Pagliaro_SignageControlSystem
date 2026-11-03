# 16 - Sala Publica Memorial

## Objetivo

Criar a pagina publica da sala de homenagem.

## Escopo

- Rota publica por slug.
- Exibir nome e datas do homenageado.
- Mostrar estado da sala.
- Sem foto e sem biografia no MVP.
- Feature publica propria.

## Instrucoes de desenvolvimento

1. Criar feature `front/src/features/public-memorial-room`.
2. Criar rota `/homenagem/:slug`.
3. Criar endpoint publico em modulo backend proprio para buscar dados da sala ativa.
4. Exibir:
   - nome do homenageado
   - data de nascimento
   - data de falecimento
   - status publico quando sala estiver encerrada ou indisponivel
5. Criar layout simples, sensivel e com moldura discreta.
6. Se sala estiver `draft`, `closed` ou `archived`, exibir mensagem apropriada.
7. Evitar textos longos explicativos na primeira versao.

## Criterios de aceite

- URL publica funciona pelo slug da sala.
- Slug nao depende de preenchimento manual.
- Pagina nao tenta mostrar foto ou biografia.
- Sala inativa nao exibe conteudo indevido.
- Rota/pagina foi criada por feature, sem expandir responsabilidade de tela antiga.

## Fora do escopo

- Player em tela cheia.
- Formulario de envio.
