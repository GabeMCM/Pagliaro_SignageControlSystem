# 24 - Auditoria da Ordem e da Arquitetura Append-Only

## Resultado

A ordem foi revisada para evitar que uma etapa dependa de algo que so seria criado em etapa posterior e para respeitar a regra de arquivo fechado para nova responsabilidade.

## Ajustes realizados

1. A etapa 03 removeu `audio_playlist_id` de `memorial_rooms`, porque a playlist de audio so nasce na etapa 06.
2. A etapa 06 passou a deixar claro que a playlist pertence a sala por `audio_playlists.room_id`.
3. A etapa 13 virou a base textual do formulario publico, sem campos de midia.
4. A etapa 14 passou a estender o formulario com midia e legenda, usando a base ja criada na etapa 13.
5. A etapa 18 passou a incluir API e interface administrativa minima de playlist de audio antes de o player tentar reproduzir audio de fundo.
6. A etapa 01 passou a assumir Node.js + TypeScript + Fastify com autoload, em vez de continuar presa ao backend Deno/Hono.
7. A etapa 02 passou a criar kernel, autoload, registries e providers cedo.
8. Etapas de frontend passaram a usar features, slots e registries, evitando edicoes futuras de telas base.
9. Etapas de player passaram a usar renderers, plugins, source handlers e politicas registraveis.
10. Etapas de storage e seguranca passaram a depender de providers/plugins criados cedo, nao de edicao posterior das rotas existentes.

## Ordem validada

1. Stack, arquitetura append-only e variaveis.
2. Kernel Node/Fastify, banco, ORM, autoload e registries.
3. Schema de homenageado e sala em modulos.
4. Schema de senha/link.
5. Schema de homenagem e midia.
6. Schema de playlist de audio.
7. Repositorios e servicos por modulo, com eventos.
8. Validacao e erros por modulo.
9. API admin por plugin/modulo.
10. Admin cadastro com slots de extensao.
11. Admin senha/link como painel novo.
12. Tela publica de senha com slot para conteudo autorizado.
13. Formulario textual com registry de campos.
14. Upload de midia e legenda como campo/modulo novo.
15. Moderacao como feature/modulo proprio.
16. Sala publica memorial como feature propria.
17. Player memorial visual com registries.
18. Audio de fundo como plugin/source handler.
19. Regra de video com audio uma vez como politica nova.
20. YouTube como audio como source handler novo.
21. API externa de integracao como modulo isolado.
22. Storage definitivo como provider novo.
23. Operacao, seguranca e acabamento como plugins/listeners/jobs.

## Observacoes

- A etapa 23 protege rotas administrativas depois do MVP. Isso e aceitavel para desenvolvimento local, mas em ambiente publico as rotas `/api/admin` devem ser protegidas antes de qualquer deploy externo.
- A etapa 22 troca o storage local pelo definitivo depois do upload MVP. Isso e uma evolucao planejada, nao uma dependencia invertida, porque o upload ja deve usar a interface de storage desde a etapa 14.
- Se uma etapa exigir editar arquivo antigo para adicionar responsabilidade, a etapa deve ser considerada reprovada e replanejada com plugin, slot, registry ou evento.
