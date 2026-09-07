# Provedor Plus — arquitetura limpa e regras obrigatórias

Este repositório contém o novo painel administrativo do Provedor Plus e o runtime Cloudflare que preserva as integrações e os contratos usados pela Área do Cliente.

## Antes de alterar qualquer código

1. Ler este `AGENTS.md` integralmente antes de qualquer alteração.
2. Rastrear o frontend por `index.html` → `app.js` → módulos em `src/`.
3. Rastrear APIs a partir de `wrangler.toml` → `notification-center-entry-worker.js` antes de alterar backend.
4. Procurar uma implementação existente antes de criar arquivo, função, rota ou serviço.
5. Alterar somente o escopo solicitado e preservar tudo que já funciona.
6. Nunca alterar o Neon de forma destrutiva sem autorização explícita e validação dos dados existentes.
7. Preservar os contratos `/api/*` consumidos por `fibratelecom/cliente-fibramais`, principalmente `/api/customer-portal`.
8. Manter `main` e `cloudflare-provedor-plus` apontando para a mesma árvore/commit sempre que uma alteração for destinada à produção.

## Proibições

- Não criar arquivos paralelos com sufixos `-v2`, `-v3`, `-fix`, `-novo`, `-final`, `-old`, `-backup` ou equivalentes.
- Não recriar `packed/`, `parts/` ou qualquer formato de código fragmentado/compactado como fonte do sistema.
- Não usar wrappers de interface, patches de DOM ou `MutationObserver` para corrigir telas.
- Não duplicar persistência, clientes, planos, mensalidades, pagamentos, roteadores, cashback, chamados, funcionários ou estado.
- Não criar segundo endpoint para uma responsabilidade já atendida pelo runtime Cloudflare.
- Não reintroduzir backend Vercel paralelo ao backend Cloudflare.
- Não alterar o repositório `fibratelecom/cliente-fibramais` a partir deste projeto.
- Não apagar nem migrar dados do Neon durante alterações de interface.

## Arquivos autoritativos

### Frontend administrativo
- Entrada: `index.html`.
- Inicialização: `app.js`.
- Comunicação HTTP: `src/api.js`.
- Modelo de leitura/apresentação: `src/model.js`.
- Interface e navegação: `src/ui.js`.
- Estilos: `styles.css`.

### Produção Cloudflare
- Configuração: `wrangler.toml`.
- Worker publicado: `painel`.
- Entrada do runtime: `notification-center-entry-worker.js`.
- Runtime base e APIs: `worker.js` + `worker-native-api.js`.
- Bancos Mercado Pago/Efí: `worker-bank-native.js`.
- MikroTik: `worker-mikrotik-native.js`.
- Mensalidades automáticas: `billing-cron.js`.
- Área do Cliente e serviços associados: `customer-service-worker.js`, `trust-release-worker.js`, `negotiation-worker.js`.
- Push/stories existentes da Área do Cliente: `push-worker.js`, `stories-worker.js`, `story-reactions-worker.js`, `stories-entry-worker.js`, `operations-entry-worker.js`, `notification-center-entry-worker.js`.

Os arquivos do runtime acima são compatibilidade operacional existente e devem ser consolidados no futuro por responsabilidade, nunca por adição de novas camadas ou cópias paralelas.

## Regra de evolução

Cada funcionalidade deve ter uma única implementação definitiva. Se uma função já existir, corrigir o arquivo autoritativo. Criar arquivo novo somente quando a responsabilidade for realmente nova e não houver módulo adequado.

Depois de qualquer alteração:
1. confirmar que não surgiram `packed/`, `parts/`, sufixos de cópia ou implementações duplicadas;
2. confirmar `Workers Builds: painel`;
3. se algum contrato da Área do Cliente tiver sido alterado, confirmar separadamente `Workers Builds: cliente`; caso contrário, não modificar nem disparar build do cliente.
