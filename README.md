# Signage Control System

Um sistema de Digital Signage (Sinalização Digital) leve, rápido e em tempo real, construído com **Deno**, **React** e **WebSockets**.

Este projeto permite gerenciar e controlar telas (Players/Kiosks) de forma remota a partir de um painel de administração centralizado. Ele suporta tanto a **exibição remota de Websites e Dashboards** quanto playlists de imagens e vídeos, Web Rádio ao vivo e integração com Dropbox para músicas, mantendo sempre o áudio de fundo (BGM) sincronizado e com volume ajustável remotamente.

## 🚀 Tecnologias Utilizadas

- **Backend:** Deno + Hono (API REST e WebSockets nativos)
- **Frontend (Admin):** React, Vite, TailwindCSS, TanStack Router & React Query, Lucide Icons
- **Frontend (Player Kiosk):** HTML5, CSS3, e Vanilla JavaScript (zero dependências pesadas, compatível com Smart TVs e TV Boxes)
- **Armazenamento:** Arquivos JSON locais protegidos em `/config` (`rooms.json`, `playlists.json`, `state.json`)

## ✨ Principais Funcionalidades

- 🌐 **Exibição e Controle de Sites Remotos (Novo!):** Defina qualquer URL externa ou dashboard (Grafana, PowerBI, intranet, sites públicos) para rodar em tela cheia no display. Possui botão de recarregar site remoto sem reiniciar a TV e opção de alternar entre modo site e modo playlist a qualquer momento.
- 🎵 **Áudio de Fundo Ininterrupto (BGM):** Enquanto a página web ou dashboard está na tela, a trilha sonora de áudio continua tocando de fundo sem interrupções (Web Rádio ao vivo ou faixas da nuvem via Dropbox).
- 🔊 **Controle Remoto de Volume Master:** Ajuste o volume das TVs diretamente pelo painel administrativo em tempo real via slider e botões mute/unmute.
- 🟢 **Status Online/Offline das Telas:** Indicador em tempo real no painel que mostra quais salas estão conectadas e a quantidade de TVs ativas.
- 📺 **Multi-formato de Mídia:** Suporte a websites/URLs, vídeos MP4/WebM e imagens com tempo de exibição configurável.
- 📁 **Galeria de Mídias do Servidor:** Visualize e reutilize arquivos de imagem, vídeo e áudio já enviados ao servidor sem precisar fazer upload repetido.
- ✏️ **Edição Ágil de Playlists:** Botão de edição direta nos cards, reordenação de itens por arrastar e soltar (drag & drop) e miniaturas visuais na fila.
- 🔄 **Hot-Reload e Sincronização em Tempo Real:** Atualizações feitas no painel refletem imediatamente nas TVs via WebSocket, com botão de "Force Reload TV" caso precise forçar um recarregamento completo da página.

## 📦 Como Rodar Localmente

### Pré-requisitos
- [Deno](https://deno.land/) (ou ambiente Nix com direnv: `direnv allow`).

### Executando em Modo de Desenvolvimento
Para rodar tanto o servidor backend quanto o frontend Vite com Hot Module Replacement (HMR) e proxy configurado:

```bash
deno task dev
```
- **Painel Admin:** [http://localhost:5173](http://localhost:5173) (ou via porta 8000)
- **Servidor da API:** [http://localhost:8000](http://localhost:8000)
- **Player Kiosk:** `http://localhost:8000/player/index.html?room=<slug>`

### Executando em Modo de Produção
Para compilar o frontend e rodar o servidor em produção (servindo a API, o Player e a SPA tudo na mesma porta):

1. Gere o build do painel Admin:
```bash
deno task build:front
```

2. Inicie o servidor unificado:
```bash
deno task start
```
O servidor estará disponível em [http://localhost:8000](http://localhost:8000).

## 📂 Estrutura de Pastas

- `/config` - Banco de dados em arquivos JSON (`rooms.json`, `playlists.json`, `state.json`).
- `/front` - Aplicação React do Painel de Administração.
- `/media/uploads` - Arquivos de vídeo, imagem e áudio enviados ao sistema.
- `/public/player` - Código Vanilla JS que roda nas TVs (Kiosk).
- `/server` - Servidor Deno, rotas da API, gestão de mídias e conexões WebSockets.
