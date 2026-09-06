# Provedor Plus — regras obrigatórias de manutenção

Estas regras existem para impedir duplicidades, remendos paralelos e alterações sem efeito no sistema real.

## Antes de alterar qualquer código

1. Rastrear o caminho real de carregamento a partir de `index.html` e `bootstrap.js`.
2. Confirmar qual arquivo é realmente executado na branch ativa antes de editar.
3. Procurar implementações existentes da mesma função antes de criar qualquer coisa nova.
4. Alterar somente o escopo solicitado pelo usuário e preservar tudo que já funciona.

## Proibições

- Não criar arquivos paralelos com sufixos como `-v2`, `-v3`, `-fix`, `-novo`, `-final`, `-old`, `-backup`, `copy`, `copia` ou equivalentes sem autorização explícita do usuário.
- Não recriar `cloud-client-store.js` nem `cloud-router-store.js` enquanto os arquivos ativos atuais forem `cloud-client-store-v2.js` e `cloud-router-store-v2.js`; qualquer migração de nome deve ser deliberada, atômica e com atualização de todas as referências no mesmo commit.
- Não adicionar outro `MutationObserver`, wrapper ou patch de DOM para corrigir uma tela quando a lógica pode ser corrigida no módulo autoritativo que já existe.
- Não duplicar persistência de banco, pagamentos, clientes, roteadores, estado ou cashback em módulos diferentes.
- Não alterar nem apagar arquivos `packed/*` ou `parts/*` sem primeiro provar pelo caminho real de carregamento que são dispensáveis.
- Não apagar arquivos apenas por parecerem antigos. Confirmar ausência de referências no caminho real de execução.
- Antes de criar qualquer arquivo novo, registrar por que nenhum arquivo existente pode receber a alteração.

## Arquivos e caminho autoritativos da branch Cloudflare

- Entrada do painel: `index.html` → `bootstrap.js`.
- Estado global: `cloud-state-store.js`.
- Clientes em nuvem: `cloud-client-store-v2.js`.
- Roteadores em nuvem: `cloud-router-store-v2.js`.
- Adaptação de integrações no navegador: `cloud-adapter.js`.
- Roteamento bancário/tela de mensalidades: `billing-bank-selector.js` e `billing-automation.js`.
- Worker publicado: `wrangler.toml` → `notification-center-entry-worker.js`; os workers importados por essa cadeia são parte ativa do runtime e não devem ser tratados como cópias somente pelo nome.

## Regra para novas correções

Se uma função já existir, corrigir o arquivo autoritativo existente. Criar arquivo novo somente quando for uma função realmente nova e não houver um módulo adequado.

Depois de qualquer mudança, verificar que não foi criada uma segunda implementação da mesma função e confirmar o build/deploy correspondente. Para alterações que envolvam painel e cliente, confirmar separadamente `Workers Builds: painel` e `Workers Builds: cliente`.
