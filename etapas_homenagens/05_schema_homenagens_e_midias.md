# 05 - Schema de Homenagens e Midias

## Objetivo

Criar estrutura para armazenar homenagens enviadas e suas midias.

## Escopo

- Homenagem textual.
- Dados de quem enviou.
- Midia opcional.
- Legenda separada da mensagem.
- Status de moderacao.
- Schemas em modulo proprio.

## Instrucoes de desenvolvimento

1. Criar modulo `server-node/src/modules/tributes`.
2. Criar arquivo `server-node/src/modules/tributes/db/schema.ts`.
3. Criar tabela `tributes`.
4. Campos minimos:
   - `id`
   - `room_id`
   - `sender_name`
   - `sender_phone`
   - `relationship`
   - `message`
   - `status`
   - `approved_at`
   - `created_at`
   - `updated_at`
5. Definir status:
   - `pending`
   - `approved`
   - `rejected`
   - `archived`
6. Criar modulo `server-node/src/modules/tribute-media` ou subpasta autocontida dentro de `tributes`, desde que nao force edicao posterior do arquivo de homenagem textual.
7. Criar arquivo de schema proprio para midia.
8. Criar tabela `tribute_media`.
9. Campos minimos:
   - `id`
   - `tribute_id`
   - `type`
   - `url`
   - `caption`
   - `duration_seconds`
   - `size_bytes`
   - `processing_status`
   - `audio_policy`
   - `created_at`
10. Definir `type` como `image` ou `video`.
11. Definir `audio_policy` para video:
   - `once_with_audio`
   - `always_muted`
   - `always_with_audio`
12. A mensagem da homenagem deve ficar em `tributes.message`.
13. A legenda da midia deve ficar em `tribute_media.caption`.

## Criterios de aceite

- Mensagem e legenda estao em campos diferentes.
- Toda homenagem nova pode entrar como `pending`.
- Uma homenagem pode existir sem midia.
- A midia tem arquivo/schema proprio para permitir evolucao sem aumentar responsabilidade da homenagem textual.

## Fora do escopo

- Upload de arquivos.
- Moderacao no admin.
