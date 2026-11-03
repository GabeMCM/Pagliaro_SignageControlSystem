# 22 - Storage Definitivo

## Objetivo

Migrar midias para storage adequado, como S3, MinIO ou Cloudflare R2.

## Escopo

- Abstrair provedor de storage.
- Salvar midias fora do disco da aplicacao.
- Preparar URLs publicas ou assinadas.
- Provider novo de storage, sem reescrever upload.

## Instrucoes de desenvolvimento

1. Confirmar que a interface de storage ja existe desde a etapa 02 e e usada pelo upload da etapa 14.
2. Criar provider novo de storage:
   - `upload`
   - `delete`
   - `getPublicUrl`
   - `getSignedUrl`, se necessario
3. Implementar provider:
   - S3/R2/MinIO, conforme decisao do ambiente
4. Organizar paths:
   - `rooms/{roomId}/tributes/{tributeId}/{fileId}`
5. Trocar provider por variavel `STORAGE_PROVIDER`, sem editar a regra de upload.
6. Criar migracao ou script novo para mover arquivos locais existentes, se necessario.
7. Manter limites de tipo e tamanho.

## Criterios de aceite

- Upload novo nao depende de `media/uploads`.
- Midia fica organizada por sala/homenagem.
- Player consegue reproduzir arquivos do storage.
- Provider pode ser trocado por configuracao.
- Upload existente usa interface, entao nao precisa receber nova responsabilidade.

## Fora do escopo

- CDN avancado.
- Transcode automatico completo.
