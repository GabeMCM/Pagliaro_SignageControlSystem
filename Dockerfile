# Imagem oficial e otimizada do Deno
FROM denoland/deno:2.1.9

WORKDIR /app

# Copia todos os arquivos do projeto para o container
COPY . .

# Compila o frontend em React/Vite gerando front/dist
RUN deno task build:front

# Expõe a porta padrão da aplicação
EXPOSE 8001

# Comando de inicialização do servidor
CMD ["task", "start"]
