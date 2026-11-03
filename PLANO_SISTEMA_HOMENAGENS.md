# Plano do Sistema de Gestao de Homenagens

## 1. Contexto Atual

O projeto atual e um sistema de digital signage com painel administrativo, player por sala e controle remoto em tempo real. Ele ja possui uma base util de produto para a nova proposta:

- Backend em Deno + Hono.
- Frontend administrativo em React/Vite.
- Player publico em HTML/JavaScript.
- Rotas REST para salas, playlists, estado e upload de midia.
- WebSocket para atualizar players conectados.
- Separacao entre playlist visual e playlist de audio.
- Suporte atual a imagem, video, audio local e YouTube como item visual.

O sistema ainda nao possui os conceitos de homenagem, homenageado, senha/link de envio, moderacao, legenda separada da mensagem, API externa protegida, banco relacional ou controle seguro de acesso.

## 2. Stack Recomendada

A stack recomendada considerando a regra de arquitetura append-only modular e:

1. Node.js + TypeScript + Fastify.
2. `@fastify/autoload` para plugins e modulos.
3. React/Vite.
4. PostgreSQL.
5. Drizzle ORM.
6. S3, MinIO ou Cloudflare R2 para midia.
7. WebSocket ou SSE para atualizacoes em tempo real.

### 2.1. Regra Arquitetural

Um arquivo pronto nao deve receber nova responsabilidade funcional. Ele so deve ser alterado para correcao, refatoracao da propria responsabilidade, ajuste tecnico ou regeneracao automatica de ferramenta.

Nova responsabilidade deve entrar como:

- novo modulo;
- novo plugin;
- nova migration;
- novo renderer;
- novo handler;
- novo provider;
- novo listener de evento;
- novo painel/campo registrado por registry.

O backend deve ter um kernel pequeno, carregando modulos por autoload. O frontend deve usar features, rotas por arquivo e registries para paineis, campos e renderers.

### 2.2. Backend Local e Frontend Publicado

E possivel manter o backend em uma maquina local e publicar somente o frontend, desde que o backend local esteja acessivel pelo frontend atraves de uma URL publica e segura.

Para isso, o backend local precisa de pelo menos uma das opcoes abaixo:

- IP publico fixo com redirecionamento de porta.
- Dominio apontando para a maquina local.
- Reverse proxy com HTTPS, como Nginx ou Caddy.
- Tunnel seguro, como Cloudflare Tunnel, Tailscale Funnel ou similar.
- Configuracao correta de CORS para permitir o dominio do frontend.
- Certificado HTTPS valido, principalmente para WebSocket seguro.

Se o backend ficar acessivel apenas pela rede local, um frontend hospedado na internet nao conseguira se comunicar com ele para usuarios externos.

Recomendacao pratica:

- Para operacao local em funeraria/cerimonial: backend local com Cloudflare Tunnel ou VPN/tunnel seguro.
- Para produto SaaS ou multiunidade: backend e banco hospedados em ambiente cloud.
- Para MVP controlado: publicar frontend e expor backend Node/Fastify local por tunnel seguro.

## 3. Objetivo do Novo Sistema

Transformar o projeto em um sistema de gestao de homenagens, no estilo de uma sala memorial digital, permitindo:

- Cadastrar homenageado.
- Criar sala de homenagem dedicada.
- Gerar senha/link para envio de homenagens.
- Receber texto, imagem e video.
- Separar mensagem de legenda de midia.
- Reproduzir video com audio apenas uma vez.
- Manter audio de fundo gerenciavel.
- Reproduzir YouTube como audio/musica, nao como video visual.
- Criar API para receber dados de falecidos/homenageados de sistemas externos.
- Exibir sala com moldura simples, sensivel e informacoes do homenageado.

## 4. Modelo de Dados Proposto

### 4.1. Homenageado

Campos principais:

- ID.
- Nome completo.
- Data de nascimento.
- Data de falecimento.
- Nome do responsavel.
- Telefone do responsavel.
- Data de criacao.

### 4.2. Sala de Homenagem

Campos principais:

- ID.
- Homenageado vinculado.
- Slug da sala, gerado automaticamente pelo sistema.
- Tema visual.
- Moldura.
- Playlist de audio.
- Configuracoes de volume.
- Status: rascunho, ativa, encerrada, arquivada.
- URL publica.
- URL do player.

### 4.3. Token ou Senha de Envio

Campos principais:

- ID.
- Sala vinculada.
- Senha ou token.
- Link dedicado.
- Validade.
- Limite de envios, se necessario.
- Status ativo/inativo.
- Data de criacao.

### 4.4. Homenagem

Campos principais:

- ID.
- Sala vinculada.
- Nome de quem enviou.
- Telefone de quem enviou.
- Grau de proximidade ou parentesco.
- Mensagem principal.
- Status: pendente, aprovada, rejeitada, arquivada.
- Data de envio.
- Data de aprovacao.

### 4.5. Midia da Homenagem

Campos principais:

- ID.
- Homenagem vinculada.
- Tipo: imagem ou video.
- URL do arquivo.
- Legenda da midia.
- Duracao.
- Tamanho.
- Status de processamento.
- Politica de audio para video: tocar audio uma vez, sempre mudo ou sempre com audio.

### 4.6. Playlist de Audio

Campos principais:

- ID.
- Sala vinculada.
- Nome.
- Itens de audio local.
- Itens YouTube tratados como audio.
- Volume padrao.
- Loop.
- Ordem de reproducao.

## 5. Prioridade 1 - Fundacao Tecnica

Objetivo: preparar o sistema para deixar de ser apenas signage e virar uma aplicacao com dados confiaveis.

Etapas:

1. Criar banco PostgreSQL.
2. Configurar ORM: Drizzle.
3. Criar migrations para homenageados, salas, tokens, homenagens, midias e playlists.
4. Migrar gradualmente os JSONs atuais para tabelas.
5. Criar camada de repositorios/servicos por modulo no backend.
6. Adicionar validacao de payloads com Zod.
7. Padronizar respostas de erro da API.
8. Configurar variaveis de ambiente para banco, storage, CORS e URL publica.
9. Definir estrategia de deploy local ou tunnel seguro.

Entregavel:

- Backend Node/Fastify com dados persistidos em PostgreSQL.
- Estrutura pronta para sala memorial, sem depender de arquivos JSON como banco principal.

## 6. Prioridade 2 - Cadastro de Homenageado e Sala

Objetivo: criar o fluxo administrativo principal.

Etapas:

1. Criar tela de cadastro de homenageado.
2. Solicitar nome, datas e dados do responsavel.
3. Gerar slug automaticamente pelo sistema, sem campo manual para o administrador.
4. Criar sala de homenagem automaticamente ao salvar homenageado.
5. Permitir editar informacoes da sala.
6. Exibir link publico da sala.
7. Exibir link do player da sala.
8. Definir status na sala: rascunho, ativa, encerrada ou arquivada.

Entregavel:

- Admin capaz de cadastrar homenageado e gerar sala dedicada.

## 7. Prioridade 3 - Senha e Link de Envio

Objetivo: permitir que familiares e amigos enviem homenagens com acesso controlado.

Etapas:

1. Criar gerador de senha/token por sala.
2. Criar URL dedicada de envio.
3. Exigir senha antes de liberar o formulario.
4. Validar senha/token no backend.
5. Registrar tentativas invalidas, se necessario.
6. Permitir expirar, regenerar ou desativar senha.
7. Mostrar no admin o link de envio da sala.

Comportamento desejado:

- A tela de envio deve abrir primeiro pedindo a senha.
- Apos senha correta, o formulario simples deve ser exibido.
- O formulario deve respeitar o momento dos clientes, evitando excesso de campos e linguagem fria.

Campos do formulario:

- Midia opcional: imagem ou video.
- Legenda opcional da midia.
- Mensagem principal.
- Nome de quem esta enviando.
- Telefone de quem esta enviando.
- Grau de proximidade ou parentesco.

Entregavel:

- Link de envio funcional, protegido por senha, com formulario simples e sensivel.

## 8. Prioridade 4 - Recebimento e Moderacao de Homenagens

Objetivo: proteger a sala e permitir curadoria antes de exibir conteudos.

Etapas:

1. Salvar homenagem como pendente por padrao.
2. Separar mensagem principal de legenda de midia.
3. Criar tela administrativa de revisao.
4. Permitir aprovar, rejeitar, editar texto e remover midia.
5. Permitir ordenar homenagens aprovadas.
6. Exibir alerta de novas homenagens pendentes.
7. Guardar historico basico de moderacao.

Regras:

- Mensagem deve ser tratada como homenagem textual.
- Legenda deve aparecer apenas vinculada a imagem/video.
- Nome, telefone e parentesco ficam disponiveis para administracao, mas nao precisam aparecer publicamente por padrao.

Entregavel:

- Fluxo completo de envio, revisao e aprovacao.

## 9. Prioridade 5 - Storage e Processamento de Midia

Objetivo: tornar upload de imagem/video mais seguro e escalavel.

Etapas:

1. Escolher storage: S3, MinIO ou Cloudflare R2.
2. Salvar arquivos por sala/homenageado.
3. Validar tipo MIME e extensao.
4. Definir limite de tamanho para imagem e video.
5. Criar nomes de arquivo seguros e unicos.
6. Gerar thumbnails para imagens/videos.
7. Preparar processamento/transcode de video, se necessario.
8. Remover midias rejeitadas ou expiradas, conforme regra do negocio.

Entregavel:

- Midia organizada, segura e independente do disco local da aplicacao.

## 10. Prioridade 6 - Player da Sala de Homenagem

Objetivo: criar uma experiencia visual propria para a homenagem, diferente do player generico de signage.

Etapas:

1. Criar rota publica da sala: `/homenagem/:slug`.
2. Criar rota de player: `/player/homenagem/:slug` ou equivalente.
3. Exibir informacoes do homenageado: nome e datas.
4. Criar moldura visual simples, respeitosa e sensivel.
5. Reproduzir homenagens aprovadas.
6. Exibir mensagem textual em layout proprio.
7. Exibir imagem/video com legenda separada.
8. Manter playlist de audio de fundo.
9. Atualizar player em tempo real quando novas homenagens forem aprovadas.

Entregavel:

- Sala memorial com identidade propria e exibicao continua de homenagens.

## 11. Prioridade 7 - Regras de Audio e Video

Objetivo: ajustar comportamento de audio conforme solicitado.

Etapas:

1. Adicionar politica de audio em videos de homenagem.
2. Quando um video aparecer pela primeira vez, reproduzir com audio.
3. Durante esse video, pausar ou reduzir audio de fundo.
4. Ao terminar o video, retomar audio de fundo.
5. Nas proximas repeticoes do mesmo video, manter video sem audio.
6. Guardar estado de reproducao por sessao/ciclo do player.
7. Permitir configuracao global no admin.

Politicas possiveis:

- `once_with_audio`: toca audio uma vez e depois fica mudo.
- `always_muted`: nunca toca audio do video.
- `always_with_audio`: sempre toca audio do video.

Entregavel:

- Video respeita a regra de tocar com audio apenas uma vez e depois preservar a musica de fundo.

## 12. Prioridade 8 - YouTube Como Audio

Objetivo: tratar YouTube como musica, nao como video visual.

Etapas:

1. Criar tipo de item `youtube_audio`.
2. Permitir adicionar link de YouTube na playlist de audio.
3. Renderizar YouTube fora da area visual.
4. Controlar volume, play, pause, next e prev junto com audios locais.
5. Impedir que YouTube apareca como video na sala, quando estiver na camada de audio.
6. Atualizar admin para separar claramente YouTube visual de YouTube audio.

Observacao:

- O YouTube pode impor limitacoes de autoplay, visibilidade e termos de uso. Para operacao mais estavel, e recomendavel usar arquivos de audio licenciados no storage.

Entregavel:

- YouTube passa a ser operado como musica de fundo, nao como conteudo visual.

## 13. Prioridade 9 - API Externa Para Cadastro de Falecidos/Homenageados

Objetivo: agilizar a criacao de salas a partir de sistemas externos.

Etapas:

1. Criar API protegida por chave.
2. Criar endpoint `POST /api/integrations/tributees`.
3. Receber dados do homenageado/falecido.
4. Criar ou atualizar homenageado.
5. Criar sala automaticamente.
6. Gerar senha e link de envio.
7. Retornar URLs importantes no response.
8. Implementar idempotencia para evitar duplicidade.
9. Registrar logs de integracao.

Payload minimo sugerido:

```json
{
  "externalId": "123",
  "name": "Nome do Homenageado",
  "birthDate": "1940-01-01",
  "deathDate": "2026-08-21",
  "responsibleName": "Nome do Responsavel",
  "responsiblePhone": "+5500000000000",
  "shortBio": "Texto curto opcional"
}
```

Resposta minima sugerida:

```json
{
  "tributeeId": "uuid",
  "roomId": "uuid",
  "publicUrl": "https://dominio.com/homenagem/nome",
  "submissionUrl": "https://dominio.com/enviar/token",
  "submissionPassword": "123456"
}
```

Entregavel:

- API pronta para receber dados de funerarias, sistemas internos ou parceiros.

## 14. Prioridade 10 - Operacao, Seguranca e Acabamento

Objetivo: preparar o sistema para uso real.

Etapas:

1. Criar login administrativo.
2. Criar permissoes por usuario.
3. Criar painel de salas ativas.
4. Criar tela de pendencias de moderacao.
5. Criar logs de auditoria.
6. Criar backup do banco.
7. Criar politicas de retencao de midia.
8. Criar pagina de erro sensivel para link invalido ou sala encerrada.
9. Criar monitoramento de player online/offline.
10. Criar rotina de exportacao de homenagens.

Entregavel:

- Sistema pronto para operacao com clientes reais.

## 15. Ordem Recomendada de Execucao

1. Definir deploy: backend local com tunnel seguro ou backend cloud.
2. Criar kernel Node/Fastify com autoload e registries.
3. Configurar PostgreSQL e Drizzle.
4. Criar modelos de homenageado, sala e token por modulo.
5. Criar cadastro administrativo de homenageado como feature propria.
6. Criar tela de senha e formulario de envio com slots/registries.
7. Criar moderacao de homenagens como modulo proprio.
8. Criar novo player memorial com renderers e plugins.
9. Implementar regra de video com audio uma vez como politica nova.
10. Migrar YouTube para camada de audio como source handler.
11. Criar API externa de cadastro como modulo isolado.
12. Adicionar seguranca, logs, backup e refinamentos operacionais por plugins/listeners/jobs.

## 16. MVP Sugerido

Para entregar valor rapidamente, o MVP deve conter:

- Cadastro de homenageado.
- Criacao automatica da sala.
- Slug gerado automaticamente, sem preenchimento manual pelo administrador.
- Senha/link de envio.
- Formulario simples de homenagem.
- Upload de imagem/video com legenda opcional.
- Mensagem, nome, telefone e parentesco.
- Moderacao manual.
- Sala publica com nome e datas do homenageado.
- Player exibindo homenagens aprovadas.
- Playlist de audio de fundo.

Depois do MVP, implementar:

- Foto e biografia do homenageado.
- Video com audio apenas uma vez.
- YouTube como audio.
- API externa.
- Storage definitivo.
- Monitoramento e controles avancados.
