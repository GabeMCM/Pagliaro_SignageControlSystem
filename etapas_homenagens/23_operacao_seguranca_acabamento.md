# 23 - Operacao, Seguranca e Acabamento

## Objetivo

Preparar o sistema para uso real com clientes.

## Escopo

- Login administrativo.
- Permissoes basicas.
- Logs.
- Backup.
- Monitoramento simples.
- Paginas de erro sensiveis.
- Plugins tecnicos novos carregados antes dos modulos.

## Instrucoes de desenvolvimento

1. Criar plugin de autenticacao administrativa em `server-node/src/plugins`, usando a ordem de autoload prevista na etapa 02.
2. Proteger rotas `/api/admin` por hook/plugin, sem editar cada rota administrativa.
3. Criar papeis basicos:
   - admin
   - operador
4. Criar modulo/plugin de auditoria por eventos de dominio, sem editar os servicos antigos.
5. Registrar logs para:
   - criacao de sala
   - geracao de senha
   - aprovacao/rejeicao de homenagem
   - alteracao de status da sala
6. Criar healthcheck do backend como plugin/rota tecnica propria.
7. Criar rotina de backup do banco em script novo.
8. Criar politica de retencao de midia em job novo.
9. Criar pagina para link invalido, expirado ou sala encerrada em feature propria.
10. Criar indicador de player online/offline via modulo de presença.
11. Revisar textos publicos para manter tom respeitoso.

## Criterios de aceite

- Admin exige login.
- Rotas administrativas nao ficam publicas.
- Acoes sensiveis ficam registradas.
- Cliente final recebe mensagens claras e respeitosas em erro.
- Seguranca e auditoria entram por plugins/listeners, nao editando cada modulo de negocio.

## Fora do escopo

- Permissoes complexas multiempresa.
- Billing.
- Automacoes externas avancadas.
