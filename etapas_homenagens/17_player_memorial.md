# 17 - Player Memorial

## Objetivo

Criar player especifico para exibicao continua das homenagens aprovadas.

## Escopo

- Player por sala.
- Exibir somente homenagens aprovadas.
- Alternar texto, imagem e video.
- Separar mensagem de legenda.
- Criar engine extensivel por renderers e politicas.

## Instrucoes de desenvolvimento

1. Criar feature `front/src/features/memorial-player`.
2. Criar rota de player, por exemplo `/player/memorial.html?room=:slug` ou rota equivalente em React.
3. Criar registry de renderers com `import.meta.glob`, por exemplo:
   - `player-renderers/text`
   - `player-renderers/image`
   - `player-renderers/video`
4. Criar registry de plugins de player para audio e tempo real, ainda que vazio nesta etapa.
5. Criar registry de politicas de midia, com politica default simples.
6. Criar endpoint publico ou protegido para player buscar:
   - dados da sala
   - dados do homenageado
   - homenagens aprovadas
   - midias aprovadas
7. Exibir moldura simples.
8. Exibir nome e datas do homenageado em area fixa ou de baixa interferencia.
9. Para homenagem textual, mostrar `message`.
10. Para imagem/video, mostrar midia e `caption` separadamente.
11. Definir duracao padrao para texto e imagem.
12. Avancar automaticamente pelos itens.
13. Preparar atualizacao por WebSocket ou SSE por plugin, sem editar o core do player depois.

## Criterios de aceite

- Player nao mostra homenagem pendente.
- Mensagem textual nao vira legenda.
- Legenda nao substitui mensagem.
- Player segue em loop com homenagens aprovadas.
- Audio, YouTube e novas politicas podem entrar depois por plugin/renderer/policy novos.

## Fora do escopo

- Regra de video com audio uma vez.
- YouTube como audio.
