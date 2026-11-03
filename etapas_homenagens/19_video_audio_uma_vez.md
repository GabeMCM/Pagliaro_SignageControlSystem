# 19 - Video com Audio Apenas Uma Vez

## Objetivo

Implementar regra de video: reproduz com audio uma vez, depois mantem audio de fundo da pagina.

## Escopo

- Videos de homenagens.
- Estado por sessao/ciclo do player.
- Ducking ou pausa do audio de fundo.
- Politica de midia como modulo novo.

## Instrucoes de desenvolvimento

1. Criar modulo de politica de midia `once_with_audio` no registry criado na etapa 17.
2. Usar o campo `audio_policy` da midia.
3. Para `once_with_audio`, manter uma lista em memoria dos videos ja tocados com audio nesta sessao.
4. Na primeira reproducao:
   - tocar video com audio
   - pausar ou reduzir audio de fundo
5. Ao terminar:
   - marcar video como ja reproduzido com audio
   - retomar audio de fundo
   - avancar para proxima homenagem
6. Nas proximas repeticoes:
   - tocar video mudo
   - manter audio de fundo
7. Para `always_muted`, nunca pausar audio de fundo.
8. Para `always_with_audio`, sempre pausar ou reduzir audio de fundo durante o video.
9. Nao editar o renderer de video se ele ja consome politicas pelo registry; se nao consumir, replanejar a etapa anterior antes de implementar.

## Criterios de aceite

- Mesmo video toca com audio na primeira exibicao.
- Na repeticao, o mesmo video toca mudo.
- Audio de fundo retorna apos o video.
- A regra nao afeta imagens nem mensagens textuais.
- A politica entrou como arquivo novo no registry de politicas.

## Fora do escopo

- Persistir historico entre reinicios do player.
- Transcode de video.
