# Provedor Plus — arquitetura limpa e regras obrigatórias

Este repositório contém o novo painel administrativo do Provedor Plus e os backends que precisam permanecer compatíveis com a Área do Cliente.

## Antes de alterar qualquer código

1. Ler este `AGENTS.md` integralmente.
2. Rastrear o caminho real de carregamento a partir de `index.html` → `app.js` → módulos em `src/`.
3. Procurar uma implementação existente antes de criar qualquer arquivo, função, rota ou serviço novo.
4. Alterar somente o escopo solicitado e preservar tudo que já funciona.
5. Nunca alterar o Neon de forma destrutiva sem autorização explícita e validação dos dados existentes.
6. Preservar o contrato de `api/customer-portal.js`, consumido por `cliente-fibramais`.

## Proibições

- Não criar arquivos paralelos com sufixos `-v2`, `-v3`, `-fix`, `-novo`, `-final`, `-old`, `-backup` ou equivalentes.
- Não recriar diretórios `packed/` ou `parts/`.
- Não usar wrappers, patches de DOM ou `MutationObserver` para corrigir a interface.
- Não duplicar persistência, clientes, mensalidades, pagamentos, roteadores, cashback, chamados ou estado.
- Não criar um segundo endpoint para uma função que já possui endpoint autoritativo.
- Não alterar o repositório `fibratelecom/cliente-fibramais` a partir deste projeto.
- Não apagar nem migrar dados do Neon durante alterações de interface.

## Arquivos autoritativos

### Frontend administrativo
- Entrada: `index.html`.
- Inicialização: `app.js`.
- Comunicação HTTP: `src/api.js`.
- Regras de leitura/apresentação dos dados: `src/model.js`.
- Interface e navegação: `src/ui.js`.
- Estilos: `styles.css`.

### Backend preservado
- Autenticação e funcionários: `api/auth.js` + `lib/cloud-auth.js`.
- Estado do painel no Neon: `api/cloud-state.js`.
- Operações de dados: `api/cloud-data.js` + `lib/cloud-data-handler.js`.
- Área do Cliente e pagamentos: `api/customer-portal.js`.
- Segredos Mercado Pago: `lib/bank-secret-store.js`.
- MikroTik: `api/mikrotik-proxy.js` + `lib/mikrotik-proxy.js`.

## Regra de evolução

Cada funcionalidade deve ter uma única implementação definitiva. Se uma função já existir, corrija o arquivo autoritativo. Crie arquivo novo somente quando a responsabilidade for realmente nova e não houver módulo adequado.

Depois de qualquer alteração, confirmar que não foi criada duplicidade e verificar o build/deploy correspondente. Para mudanças que afetem contratos usados pela Área do Cliente, confirmar separadamente `Workers Builds: painel` e `Workers Builds: cliente`.