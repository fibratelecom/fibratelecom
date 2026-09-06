# Provedor Plus — regras obrigatórias de manutenção

Estas regras existem para impedir duplicidades, remendos paralelos e alterações sem efeito no sistema real.

## Antes de alterar qualquer código

1. Rastrear o caminho real de carregamento a partir de `index.html` e `bootstrap.js`.
2. Confirmar qual arquivo é realmente executado no `main` antes de editar.
3. Procurar implementações existentes da mesma função antes de criar qualquer coisa nova.
4. Alterar somente o escopo solicitado pelo usuário e preservar tudo que já funciona.

## Proibições

- Não criar arquivos paralelos com sufixos como `-v2`, `-v3`, `-fix`, `-novo`, `-final`, `-old`, `-backup` ou equivalentes sem autorização explícita do usuário.
- Não recriar `cloud-client-store.js` nem `cloud-router-store.js`. Os arquivos ativos atuais são `cloud-client-store-v2.js` e `cloud-router-store-v2.js` até uma migração deliberada.
- Não adicionar outro `MutationObserver`, wrapper ou patch de DOM para corrigir uma tela quando a lógica pode ser corrigida no módulo autoritativo que já existe.
- Não duplicar persistência de banco, pagamentos, clientes, roteadores, estado ou cashback em módulos diferentes.
- Não alterar arquivos `packed/*` nem apagar esses arquivos sem primeiro provar que existe uma fonte substituta funcional e aprovada.
- Não apagar arquivos apenas por parecerem antigos. Confirmar ausência de referências no caminho real de execução.

## Arquivos autoritativos atuais

- Entrada do painel: `index.html` → `bootstrap.js`.
- Estado global: `cloud-state-store.js` + `api/cloud-state.js`.
- Clientes em nuvem: `cloud-client-store-v2.js`.
- Roteadores em nuvem: `cloud-router-store-v2.js`.
- Adaptação de integrações no navegador: `cloud-adapter.js`.
- Backend da Área do Cliente e pagamentos: `api/customer-portal.js`.
- Segredos bancários: `lib/bank-secret-store.js`.
- Roteamento de banco nas cobranças: `billing-bank-selector.js` e `billing-automation.js`; não criar um terceiro roteador paralelo.

## Regra para novas correções

Se uma função já existir, corrigir o arquivo autoritativo existente. Criar arquivo novo somente quando for uma função realmente nova e não houver um módulo adequado; nesse caso, explicar antes por que o novo arquivo é necessário.

Depois de qualquer mudança, verificar que não foi criada uma segunda implementação da mesma função e confirmar o build/deploy correspondente. Para alterações que envolvam painel e cliente, confirmar separadamente `Workers Builds: painel` e `Workers Builds: cliente`.
