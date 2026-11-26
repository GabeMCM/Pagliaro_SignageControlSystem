FROM docker.io/denoland/deno:latest

WORKDIR /app

# Copia todos os arquivos do projeto (com front/dist já compilado)
COPY . .

# Expõe a porta padrão da aplicação
EXPOSE 8001

# Comando de inicialização do servidor
CMD ["task", "start"]
