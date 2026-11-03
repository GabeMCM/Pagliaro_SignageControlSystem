# 21 - API de Integracao para Homenageados

## Objetivo

Criar API para sistemas externos enviarem dados de falecidos/homenageados e agilizar a criacao de salas.

## Escopo

- Endpoint protegido por API key.
- Criar ou atualizar homenageado.
- Criar sala automaticamente.
- Gerar link/senha de envio.
- Retornar URLs.
- Modulo de integracao isolado.

## Instrucoes de desenvolvimento

1. Criar modulo `server-node/src/modules/api-clients`.
2. Criar schema proprio para `api_clients`.
3. Criar tabela `api_clients`.
4. Campos minimos:
   - `id`
   - `name`
   - `api_key_hash`
   - `active`
   - `created_at`
5. Criar modulo `server-node/src/modules/tributee-integrations`.
6. Criar endpoint `POST /api/integrations/tributees`.
7. Exigir API key no header.
8. Payload minimo:

```json
{
  "externalId": "123",
  "name": "Nome do Homenageado",
  "birthDate": "1940-01-01",
  "deathDate": "2026-08-21",
  "responsibleName": "Nome do Responsavel",
  "responsiblePhone": "+5500000000000"
}
```

9. Nao exigir foto nem biografia.
10. Usar `externalId` para idempotencia.
11. Retornar:
   - `tributeeId`
   - `roomId`
   - `publicUrl`
   - `submissionUrl`
   - senha inicial quando criada
12. Reutilizar servicos publicos de criacao por contrato, sem editar o servico original de cadastro admin.

## Criterios de aceite

- Requisicao sem API key e bloqueada.
- Mesmo `externalId` nao cria duplicidade.
- Sala e link de envio sao criados automaticamente.
- Slug continua gerado pelo sistema.
- Integracao externa entra como modulo novo.

## Fora do escopo

- Webhook de retorno.
- Portal de parceiros.
