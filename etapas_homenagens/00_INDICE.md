# Etapas de Desenvolvimento - Sistema de Homenagens

Esta pasta divide o plano em etapas pequenas e isoladas. A ideia e implementar uma etapa por vez, validando os criterios de aceite antes de seguir.

## Arquitetura obrigatoria

- [00_ARQUITETURA_APPEND_ONLY.md](00_ARQUITETURA_APPEND_ONLY.md)

## Ordem recomendada

1. [01_definir_deploy_e_variaveis.md](01_definir_deploy_e_variaveis.md)
2. [02_configurar_postgresql_e_orm.md](02_configurar_postgresql_e_orm.md)
3. [03_schema_homenageado_e_sala.md](03_schema_homenageado_e_sala.md)
4. [04_schema_senha_e_link_envio.md](04_schema_senha_e_link_envio.md)
5. [05_schema_homenagens_e_midias.md](05_schema_homenagens_e_midias.md)
6. [06_schema_playlist_audio.md](06_schema_playlist_audio.md)
7. [07_repositorios_e_servicos.md](07_repositorios_e_servicos.md)
8. [08_validacao_e_erros_api.md](08_validacao_e_erros_api.md)
9. [09_api_admin_homenageado_sala.md](09_api_admin_homenageado_sala.md)
10. [10_admin_cadastro_homenageado.md](10_admin_cadastro_homenageado.md)
11. [11_admin_senha_link_envio.md](11_admin_senha_link_envio.md)
12. [12_tela_publica_senha.md](12_tela_publica_senha.md)
13. [13_formulario_envio_homenagem.md](13_formulario_envio_homenagem.md)
14. [14_upload_midia_mvp.md](14_upload_midia_mvp.md)
15. [15_moderacao_homenagens.md](15_moderacao_homenagens.md)
16. [16_sala_publica_memorial.md](16_sala_publica_memorial.md)
17. [17_player_memorial.md](17_player_memorial.md)
18. [18_audio_fundo_memorial.md](18_audio_fundo_memorial.md)
19. [19_video_audio_uma_vez.md](19_video_audio_uma_vez.md)
20. [20_youtube_como_audio.md](20_youtube_como_audio.md)
21. [21_api_integracao_homenageados.md](21_api_integracao_homenageados.md)
22. [22_storage_definitivo.md](22_storage_definitivo.md)
23. [23_operacao_seguranca_acabamento.md](23_operacao_seguranca_acabamento.md)

## Auditoria

- [24_AUDITORIA_ORDEM.md](24_AUDITORIA_ORDEM.md)

## Regras gerais

- Nao pedir slug para o administrador. O slug da sala deve ser gerado automaticamente.
- Foto e biografia do homenageado ficam fora do MVP.
- O status pertence a sala, nao ao homenageado.
- A mensagem da homenagem e diferente da legenda da midia.
- A tela de envio deve ser simples, respeitosa e sem excesso de campos.
- Toda rota publica de envio deve exigir senha antes do formulario.
- Toda homenagem enviada deve entrar como pendente ate aprovacao.
- Evitar grandes refactors fora do escopo da etapa atual.
- Arquivo pronto nao deve receber nova responsabilidade funcional.
- Nova responsabilidade deve entrar por modulo, plugin, registry, migration, renderer, handler ou provider novo.
- Pontos oficiais de composicao devem ser criados cedo para evitar edicoes futuras.
