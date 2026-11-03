# 07 - Repositorios e Servicos

## Objetivo

Criar uma camada de acesso a dados e regras de negocio para evitar logica pesada dentro das rotas.

## Escopo

- Repositorios para tabelas novas.
- Servicos para criacao de sala, token e homenagem.
- Contratos compartilhados criados cedo para evitar edicoes futuras.
- Implementacoes dentro de cada modulo de dominio.

## Instrucoes de desenvolvimento

1. Criar contratos tecnicos no kernel apenas se forem genericos:
   - transacao de banco;
   - event bus;
   - logger;
   - storage.
2. Criar repositorio de homenageados dentro de `modules/tributees`.
3. Criar repositorio de salas dentro de `modules/memorial-rooms`.
4. Criar repositorio de senhas/tokens dentro de `modules/submission-access`.
5. Criar repositorio de homenagens dentro de `modules/tributes`.
6. Criar repositorio de midias dentro de `modules/tribute-media`.
7. Criar servico `createTributeeWithRoom` em um modulo de caso de uso proprio, por exemplo `modules/create-tributee-room`.
8. Criar servico `generateSubmissionAccess` dentro do modulo `submission-access`.
9. Criar servico `submitTribute` dentro de `modules/tributes`.
10. Criar servico `approveTribute` dentro de `modules/moderation` ou `modules/tribute-moderation`.
11. Criar servico `rejectTribute` no mesmo modulo de moderacao.
12. Se um novo fluxo precisar reagir a um evento antigo, criar listener novo em vez de editar o servico antigo.

## Criterios de aceite

- Rotas novas chamam servicos, nao SQL direto.
- Criacao de homenageado e sala acontece em transacao.
- Criacao de homenagem e midia acontece de forma consistente.
- Nenhum servico vira "servico geral" com varias responsabilidades.
- Novas reacoes de negocio usam eventos/listeners novos.

## Fora do escopo

- Criar UI.
- Migrar player antigo.
