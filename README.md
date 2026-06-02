# Signage Control System

Um sistema de Digital Signage (Sinalização Digital) leve, rápido e em tempo real, construído com **Deno**, **React** e **WebSockets**.

Este projeto permite gerenciar e controlar telas (Players/Kiosks) de forma remota a partir de um painel de administração centralizado. Ele suporta a separação de playlists de áudio e vídeo, e sincroniza comandos (como Play/Pause) em tempo real entre o painel de administração e as telas.

## 🚀 Tecnologias Utilizadas

- **Backend:** Deno + Hono (API REST e WebSockets)
- **Frontend (Admin):** React, Vite, TailwindCSS, React Query, Lucide Icons, Tanstack Router
- **Frontend (Player):** HTML, CSS, e Vanilla JavaScript (via WebSocket)
- **Armazenamento:** Arquivos JSON locais (simples, sem necessidade de banco de dados complexo)

## ✨ Principais Funcionalidades

- **Sincronização em Tempo Real:** Se alguém pausar o vídeo direto na TV, o painel do administrador reflete o status de imediato.
- **Salas Independentes:** Crie "Rooms" (Telas) ilimitadas. O sistema gera os "slugs" automaticamente a partir do nome.
- **Trilhas Separadas:** Controle o vídeo (Visual) e a música (Áudio) separadamente. É possível pausar o vídeo sem cortar a música ambiente.
- **Gestão de Playlists:** Crie e edite playlists de forma dinâmica.
- **Atualização Forçada:** Botão de "Force Reload" no painel de controle que atualiza a TV remotamente.

## 📦 Como Rodar Localmente

### Pré-requisitos
- [Deno](https://deno.land/) instalado na máquina.

### Executando em Modo de Desenvolvimento
O projeto possui atalhos configurados no `deno.json`. Para rodar tanto o backend quanto o frontend em modo de desenvolvimento (com Hot Module Replacement):

```bash
deno task dev
```
O painel de administração ficará disponível via Vite e o Deno subirá o servidor da API.

### Executando em Modo de Produção
Para compilar o frontend e rodar o servidor em modo de produção:

1. Gere o build do painel Admin:
```bash
deno task build:front
```

2. Inicie o servidor Deno:
```bash
deno task start
```
O servidor será exposto na porta `8000`.

## 📂 Estrutura de Pastas

- `/config` - Banco de dados em arquivos JSON (`rooms.json`, `playlists.json`, `state.json`).
- `/front` - Aplicação React do Painel de Administração.
- `/public/player` - Código Vanilla JS que roda nas TVs (Kiosk).
- `/server` - Lógica do servidor Deno, rotas da API e gerenciamento de WebSockets.
