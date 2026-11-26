#!/usr/bin/env bash
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo "============================================================"
echo " 🐳 Configuração Persistente Docker - Pagliaro Signage (8001)"
echo "============================================================"

# Detecta se precisa de sudo para falar com o daemon do Docker
if docker info >/dev/null 2>&1; then
  DOCKER_CMD="docker"
else
  echo "🔑 Solicitando permissão de administrador (sudo) para gerenciar o Docker..."
  sudo -v
  DOCKER_CMD="sudo docker"
fi

# 1. Garante que o front/dist esteja compilado e atualizado
if [ ! -f "front/dist/index.html" ]; then
  echo "📦 Compilando frontend..."
  deno task build:front
fi

# 2. Compila a imagem antes de parar o processo atual para minimizar o tempo de troca (< 1 segundo)
echo "🔨 Construindo a imagem Docker do Pagliaro Signage..."
$DOCKER_CMD compose build

# 3. Encerra qualquer processo antigo do Deno (dev.ts / main.ts) que esteja segurando a porta 8001
echo "🔄 Liberando a porta 8001 do processo antigo em terminal para assumir via Docker..."
pkill -f "deno.*dev\.ts" 2>/dev/null || true
pkill -f "deno.*server/main\.ts" 2>/dev/null || true
OLD_PIDS=$(lsof -t -i:8001 2>/dev/null || true)
if [ -n "$OLD_PIDS" ]; then
  kill -9 $OLD_PIDS 2>/dev/null || sudo kill -9 $OLD_PIDS 2>/dev/null || true
fi
sleep 1

# 4. Sobe o container em background com restart: always
echo "🚀 Iniciando container 'pagliaro-signage' na porta 8001 (restart: always)..."
$DOCKER_CMD compose up -d

echo ""
echo "✅ SUCESSO! O serviço Pagliaro Signage agora está rodando no Docker na porta 8001."
echo "------------------------------------------------------------"
$DOCKER_CMD ps --filter "name=pagliaro-signage"
