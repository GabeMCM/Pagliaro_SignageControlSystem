# 20 - YouTube Como Audio

## Objetivo

Permitir YouTube na camada de audio, sendo tratado como musica e nao como conteudo visual.

## Escopo

- Tipo `youtube_audio`.
- Player de YouTube fora da area visual.
- Controles integrados a playlist de audio.
- Source handler novo para o plugin de audio.

## Instrucoes de desenvolvimento

1. Criar painel/campo administrativo novo para adicionar link de YouTube em playlist de audio, usando registry existente.
2. Salvar o item com `type = youtube_audio`.
3. Criar source handler `youtube_audio` no registry de fontes de audio criado na etapa 18.
4. No player memorial, carregar YouTube IFrame API apenas quando houver item YouTube.
5. Renderizar o iframe fora da area principal de homenagem.
6. Impedir que o video do YouTube ocupe a tela.
7. Controlar:
   - play
   - pause
   - next
   - volume
8. Ao terminar um item YouTube, avancar para o proximo audio.
9. Manter observacao tecnica sobre limitacoes de autoplay e termos do YouTube.
10. Nao editar o plugin base de audio se ele ja consome source handlers por registry.

## Criterios de aceite

- Link de YouTube em playlist de audio nao aparece visualmente como video.
- Audio local e YouTube audio podem coexistir na mesma playlist.
- Player visual continua exibindo homenagens.
- YouTube entrou como source handler novo, nao como aumento do player visual.

## Fora do escopo

- Baixar audio do YouTube.
- Burlar restricoes de autoplay.
