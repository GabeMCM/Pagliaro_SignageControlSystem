# 14 - Upload de Midia MVP

## Objetivo

Permitir upload inicial de imagem/video no envio de homenagem com validacoes basicas.

## Escopo

- Upload simples.
- Associar arquivo a homenagem.
- Validar tipo e tamanho.
- Adicionar campos de midia e legenda como modulos novos no registry criado na etapa 13.
- Ainda pode usar disco local no MVP, desde que preparado para migrar.

## Instrucoes de desenvolvimento

1. Criar modulo backend `tribute-media-upload` ou equivalente.
2. Criar rota de upload para envio publico ou acoplar upload ao endpoint de homenagem sem editar a rota textual original; se acoplar, usar handler/plugin de enriquecimento ja previsto.
3. Aceitar somente:
   - imagem
   - video
4. Definir limites iniciais:
   - imagem: limite configuravel
   - video: limite configuravel
5. Gerar nome de arquivo seguro e unico.
6. Salvar arquivo usando a interface de storage criada no kernel; no MVP o provider pode ser local.
7. Registrar metadados em `tribute_media`.
8. Retornar erro claro para arquivo invalido.
9. Nao permitir audio avulso nesse formulario.
10. Criar modulo de campo frontend, por exemplo `front/src/features/submission-form-fields/media/index.tsx`, contendo:
   - midia opcional, imagem ou video
   - legenda opcional da midia
11. Garantir que a mensagem principal continue separada da legenda da midia.
12. Nao editar o componente base do formulario.

## Criterios de aceite

- Imagem valida pode ser enviada.
- Video valido pode ser enviado.
- Arquivo invalido e recusado.
- Midia fica vinculada a homenagem correta.
- Legenda da midia fica em `tribute_media.caption`.
- Mensagem da homenagem continua em `tributes.message`.
- Formulario ganhou midia por modulo de campo novo, sem nova responsabilidade no arquivo base.

## Fora do escopo

- S3/R2 definitivo.
- Transcode de video.
- Thumbnail automatico.
