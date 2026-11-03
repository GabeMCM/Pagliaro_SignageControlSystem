# 18 - Audio de Fundo Memorial

## Objetivo

Adicionar playlist de audio de fundo ao player memorial.

## Escopo

- API minima para configurar playlist de audio da sala.
- Interface administrativa minima para criar ou selecionar playlist.
- Audio local no MVP.
- Controle de volume.
- Loop.
- Pausar/retomar quando necessario.
- Plugin de player e source handler novos.

## Instrucoes de desenvolvimento

1. Criar modulo backend `audio-playlist-admin` ou rotas dentro de `audio-playlists`.
2. Criar endpoints minimos para playlist de audio da sala, usando o schema da etapa 06.
3. Criar feature/painel administrativo novo para adicionar audio local a playlist da sala via registry.
4. Criar plugin de player novo para audio de fundo, sem editar o core do player.
5. Criar source handler `audio_file` para arquivos locais.
6. Reaproveitar a ideia do `bgmPlayer` existente no player atual.
7. Buscar playlist de audio vinculada a sala.
8. Tocar audio em loop quando houver itens.
9. Respeitar volume por item e volume padrao da playlist.
10. Criar fallback visual quando autoplay for bloqueado pelo navegador.
11. Permitir que o player continue mostrando homenagens mesmo se o audio falhar.
12. Preparar funcoes no plugin:
   - `playNextAudio`
   - `pauseBackgroundAudio`
   - `resumeBackgroundAudio`
   - `setBackgroundVolume`

## Criterios de aceite

- Player toca musica de fundo quando permitido.
- Falha de audio nao quebra a exibicao visual.
- Volume e loop funcionam.
- Codigo fica separado da logica visual.
- A playlist consumida pelo player pode ser criada antes do teste do player.
- O core do player nao recebe nova responsabilidade de audio.

## Fora do escopo

- YouTube como audio.
- Controle remoto avancado.
