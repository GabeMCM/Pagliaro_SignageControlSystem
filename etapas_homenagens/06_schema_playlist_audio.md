# 06 - Schema de Playlist de Audio

## Objetivo

Preparar a playlist de audio da sala memorial, incluindo audio local e YouTube tratado como musica.

## Escopo

- Playlist de audio por sala.
- Itens locais e YouTube audio.
- Ordem, volume e loop.
- Schema em modulo proprio.

## Instrucoes de desenvolvimento

1. Criar modulo `server-node/src/modules/audio-playlists`.
2. Criar arquivo `server-node/src/modules/audio-playlists/db/schema.ts`.
3. Criar tabela `audio_playlists`.
4. Campos minimos:
   - `id`
   - `room_id`
   - `name`
   - `loop`
   - `default_volume`
   - `created_at`
   - `updated_at`
5. Criar tabela `audio_playlist_items`.
6. Campos minimos:
   - `id`
   - `playlist_id`
   - `type`
   - `url`
   - `title`
   - `volume`
   - `sort_order`
   - `created_at`
7. Definir `type`:
   - `audio_file`
   - `youtube_audio`
8. Garantir ordenacao estavel por `sort_order`.
9. Vincular playlist a sala usando `audio_playlists.room_id`.
10. Nao exigir `audio_playlist_id` em `memorial_rooms`; a playlist pertence a sala e pode ser buscada por `room_id`.

## Criterios de aceite

- YouTube como audio tem tipo proprio.
- Itens de audio nao dependem da playlist visual.
- A playlist de audio fica associada a sala por `room_id`.
- A relacao sala-playlist nao depende de campo criado em etapa anterior de forma incompleta.
- A etapa cria arquivos novos dentro do modulo `audio-playlists`.

## Fora do escopo

- Player reproduzindo YouTube audio.
- Interface de playlist.
