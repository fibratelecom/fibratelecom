# Provedor Plus — Registro de Homologação

Branch de teste: `homologacao`
Base inicial: commit `63711bcf2025aa88a2018233728c24c4157fc7f9`

## Objetivo
Usar esta branch como ambiente de teste para revisar, corrigir e modernizar o Provedor Plus antes de publicar na Vercel. A produção não deve ser alterada durante esta etapa.

## Regras de segurança
- Não publicar automaticamente na Vercel.
- Não alterar `main` durante os testes.
- Evitar funções duplicadas e arquivos duplicados.
- Não usar pacotes temporários ou workflows intermediários quando uma alteração direta e validável for possível.
- Antes de cada alteração, conferir o arquivo atual da branch.
- Após cada alteração, registrar aqui o que mudou.
- Não misturar arquivos temporários de teste com os arquivos que irão para produção.
- Quando a homologação for aprovada, aplicar somente as alterações funcionais aprovadas em um lote único e revisar o diff antes da publicação.

## Estado já incorporado nesta base
- Cloud17 e operação cloud/Neon.
- Auditoria geral e correções validadas.
- Correções de clientes, PPPoE e MikroTik.
- Correções de boletos, financeiro e conciliação.
- Ajuste visual das integrações bancárias.
- Melhorias do modal Status do cliente.
- Última conexão/queda, situação financeira e histórico de ações no acesso.
- Medição segura de qualidade PPPoE com fallback.

## Registro de alterações de homologação

### 2026-08-26 — Base criada
- Criada a branch `homologacao` a partir do estado atual de `desenvolvimento`.
- Nenhuma alteração foi aplicada à produção.
- Este arquivo existe somente para controle do ambiente de teste.

## Pendências de teste
- Conferir visual e responsividade das Integrações bancárias.
- Conferir modal Status do cliente com dados reais de PPPoE.
- Validar latência/perda de pacotes quando o MikroTik estiver acessível.
- Validar histórico de bloqueio, desbloqueio e confiança.
- Revisar telas antigas e remover/ajustar apenas o que estiver fora do padrão atual.
