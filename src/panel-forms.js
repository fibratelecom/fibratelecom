import { invoiceCents, money, nextContract, text } from './model.js';
import { attr, checkbox, field, formMoney, option, PERMISSIONS, selectField, textareaField } from './ui-kit.js';

export function createForms(ctx){
  const {state,clients,routers,data,byPlan,bankSafe,employees}=ctx;
  const activeStaff=(employees||[]).filter((x)=>x.active!==false);
  const efiReady=Boolean(bankSafe?.efi?.enabled&&bankSafe?.efi?.clientIdConfigured&&bankSafe?.efi?.clientSecretConfigured);
  const today=()=>new Date().toISOString().slice(0,10);
  const futureDate=(days=7)=>{const d=new Date();d.setDate(d.getDate()+days);return d.toISOString().slice(0,10)};
  function nextClientIp(items=[]){
    const groups=new Map();
    for(const client of items||[]){
      const parts=text(client?.ip).split('.'),nums=parts.map(Number);
      if(parts.length!==4||nums.some((n,i)=>!Number.isInteger(n)||n<0||n>255||(i===3&&(n===0||n===255))))continue;
      const prefix=nums.slice(0,3).join('.'),hosts=groups.get(prefix)||[];hosts.push(nums[3]);groups.set(prefix,hosts);
    }
    if(!groups.size)return '';
    const [prefix,hosts]=[...groups.entries()].sort((a,b)=>b[1].length-a[1].length||Math.max(...b[1])-Math.max(...a[1]))[0],used=new Set(hosts),max=Math.max(...hosts);
    if(max<254&&!used.has(max+1))return `${prefix}.${max+1}`;
    for(let host=2;host<=254;host+=1)if(!used.has(host))return `${prefix}.${host}`;
    return '';
  }

  function clientForm(item={}){
    const planOpts=`<option value="">Sem plano</option>${data.plans.map((p)=>option(p.id,`${p.name} · ${money(p.price_cents,true)}`,item.plan_id)).join('')}`;
    const routerOpts=`<option value="">Sem MikroTik</option>${routers.map((r)=>option(r.id,r.name||r.host,item.router_id)).join('')}`;
    const contract=item.contract_number||nextContract(clients),billingMode=text(item.billing_mode)||'boleto',pixStatus=text(item.pix_auto_status)||'Não configurado';
    const fixedIp=text(item.ip)||(!item.id?nextClientIp(clients):''),deviceIp=text(item.device_ip)||fixedIp,mikrotikProfile=text(item.mikrotik_profile)||text(byPlan(item.plan_id)?.mikrotik_profile)||'default';
    const billingOptions=`${option('boleto','Boleto bancário',billingMode)}${option('pix_due','Pix com vencimento — Efí',billingMode)}${option('pix_auto','Pix Automático — Efí',billingMode)}`;
    const efiOperations=item.id?`<fieldset class="form-section span-2"><legend>Efí — recorrência e carnê</legend><div class="form-actions"><button class="btn secondary" type="button" data-action="client-pix-auto" data-id="${attr(item.id)}" ${efiReady?'':'disabled'}>Pix Automático</button><button class="btn secondary" type="button" data-action="client-carnet" data-id="${attr(item.id)}" ${efiReady?'':'disabled'}>Gerar carnê</button></div><p class="hint">Pix Automático: <strong>${attr(pixStatus)}</strong>. ${efiReady?'Efí pronta para estas operações.':'Configure e ative a Efí Bank para liberar estas operações.'}</p></fieldset>`:'';
    return `<form id="client-form" class="form-grid">
      <input type="hidden" name="id" value="${attr(item.id||'')}">
      <fieldset class="form-section span-2"><legend>Identificação e contrato</legend><div class="form-grid inner-grid">
        ${field('Nome completo / Razão social','name',item.name,'text','required')}
        ${field('CPF/CNPJ','document',item.document,'text','inputmode="numeric"')}
        ${field('Contrato','contract_number',contract,'text','required readonly aria-readonly="true"')}
        ${field('Data de instalação','installation_date',text(item.installation_date||item.activation_date).slice(0,10),'date')}
        ${field('E-mail','email',item.email,'email')}${field('Telefone / WhatsApp','phone',item.phone)}
      </div><p class="hint">O número do contrato é gerado automaticamente pelo Provedor Plus e não pode ser alterado no cadastro.</p></fieldset>
      <fieldset class="form-section span-2"><legend>Endereço</legend><div class="form-grid inner-grid">
        ${field('CEP','zip_code',item.zip_code||item.cep,'text','inputmode="numeric" maxlength="9" autocomplete="postal-code"')}${field('Endereço','address',item.address||item.street)}${field('Número','address_number',item.address_number)}${field('Bairro','neighborhood',item.neighborhood)}${field('Complemento','complement',item.complement)}${field('Cidade','city',item.city)}${field('UF','state',item.state,'text','maxlength="2"')}
      </div></fieldset>
      <fieldset class="form-section span-2"><legend>Plano e cobrança</legend><div class="form-grid inner-grid">
        ${selectField('Plano','plan_id',planOpts)}${field('Dia do vencimento','due_day',item.due_day||10,'number','min="1" max="31"')}
        ${selectField('Status','status',['Ativo','Em atraso','Bloqueado','Suspenso','Cancelado'].map((v)=>option(v,v,item.status||'Ativo')).join(''))}
        ${selectField('Banco preferencial','billing_bank_provider',`<option value="">Padrão do sistema</option>${option('efi','Efí Bank',item.billing_bank_provider)}${option('mercadoPago','Mercado Pago',item.billing_bank_provider)}`)}
        ${selectField('Cobrança automática','billing_mode',billingOptions)}
        <label class="check"><input type="checkbox" name="auto_block" ${checkbox(item.auto_block)?'checked':''}>Bloqueio automático por atraso</label>
        ${field('Dias para bloquear','block_after_days',item.block_after_days||7,'number','min="1" max="90"')}
      </div><p class="hint">Pix com vencimento e Pix Automático usam exclusivamente a Efí. No Pix Automático, a recorrência precisa estar APROVADA antes da cobrança mensal automática.</p></fieldset>
      ${efiOperations}
      <fieldset class="form-section span-2"><legend>Acesso PPPoE / MikroTik</legend><div class="form-grid inner-grid">
        ${selectField('MikroTik','router_id',routerOpts)}${selectField('Tipo de conexão','connection_type',['PPPoE','IPoE','Estático'].map((v)=>option(v,v,item.connection_type||'PPPoE')).join(''))}
        ${field('Usuário PPPoE','pppoe_username',item.pppoe_username||item.pppoe_user)}${field('Senha PPPoE','pppoe_password','','password','placeholder="Informe para criar ou trocar; vazio mantém a atual"')}
        ${field('Perfil MikroTik','mikrotik_profile',mikrotikProfile,'text','readonly aria-readonly="true"')}${field('IP fixo / remoto','ip',fixedIp,'text',`${item.id?'':'required '}inputmode="decimal" autocomplete="off" spellcheck="false"`)}${field('MAC / Caller-ID','mac_address',item.mac_address)}
        ${field('IP do roteador/ONU do cliente','device_ip',deviceIp,'text','readonly aria-readonly="true"')}${field('Porta do roteador/ONU','device_port',item.device_port||'','number','min="1" max="65535"')}
      </div><p class="hint">O Perfil MikroTik segue o plano selecionado. O IP do roteador/ONU acompanha automaticamente o IP fixo/remoto. Ao salvar um cliente PPPoE configurado, o Provedor Plus sincroniza o acesso real no MikroTik.</p></fieldset>
      ${textareaField('Observações','notes',item.notes)}
      <div class="form-actions span-2">${item.id?'<button class="btn danger" type="button" data-action="delete-client" data-id="'+attr(item.id)+'">Excluir cliente</button>':''}<span class="form-spacer"></span><button class="btn secondary" type="button" data-action="close-modal">Cancelar</button><button class="btn primary" type="submit">Salvar e sincronizar</button></div>
    </form>`;
  }

  function pixAutoForm(item={}){
    const p=byPlan(item.plan_id),amount=item.pix_auto_amount_cents||p?.price_cents||0,status=text(item.pix_auto_status)||'Não configurado';
    return `<form id="pix-auto-form" class="form-grid"><input type="hidden" name="client_id" value="${attr(item.id||'')}">
      ${field('Cliente','client_name',item.name,'text','readonly')}${field('Status atual','current_status',status,'text','readonly')}
      ${field('Início da recorrência','start_date',text(item.pix_auto_start_date).slice(0,10)||today(),'date','required')}${field('Fim da recorrência','end_date',text(item.pix_auto_end_date).slice(0,10),'date')}
      ${field('Valor mensal (R$)','amount',formMoney(amount),'text','required inputmode="decimal"')}${field('ID da recorrência Efí','id_rec',item.pix_auto_id_rec||'','text','readonly')}
      ${item.pix_auto_qr?textareaField('PIX copia e cola da autorização','authorization_pix',item.pix_auto_qr,'readonly'):''}
      <p class="hint span-2">A Efí cria uma autorização mensal. Depois que o cliente aprovar o Pix, use “Consultar aprovação”. A cobrança automática só usa a recorrência quando o status retornar APROVADA.</p>
      <div class="form-actions span-2">${item.pix_auto_id_rec?`<button class="btn secondary" type="button" data-action="refresh-pix-auto" data-id="${attr(item.id)}">Consultar aprovação</button>`:''}<span class="form-spacer"></span><button class="btn secondary" type="button" data-action="close-modal">Cancelar</button><button class="btn primary" type="submit">${item.pix_auto_id_rec?'Criar nova autorização':'Criar autorização'}</button></div>
    </form>`;
  }

  function carnetForm(item={}){
    const p=byPlan(item.plan_id),amount=p?.price_cents||0;
    return `<form id="carnet-form" class="form-grid"><input type="hidden" name="client_id" value="${attr(item.id||'')}">
      ${field('Cliente','client_name',item.name,'text','readonly')}${field('Contrato','contract_number',item.contract_number||'','text','readonly')}
      ${field('Quantidade de parcelas','installments',6,'number','required min="2" max="24"')}${field('Primeiro vencimento','first_due',futureDate(7),'date','required')}
      ${field('Valor de cada parcela (R$)','amount',formMoney(amount),'text','required inputmode="decimal"')}${field('Descrição','description',`Mensalidades · ${item.name||''}`,'text','required')}
      <p class="hint span-2">O carnê é emitido pela Efí e cada parcela fica registrada nas Mensalidades com o mesmo grupo. Parcelas já existentes no mesmo vencimento impedem a emissão para evitar duplicidade.</p>
      <div class="form-actions span-2"><button class="btn secondary" type="button" data-action="close-modal">Cancelar</button><button class="btn primary" type="submit">Gerar carnê Efí</button></div>
    </form>`;
  }

  function planForm(item={}){
    return `<form id="plan-form" class="form-grid"><input type="hidden" name="id" value="${attr(item.id||'')}">
      ${field('Nome do plano','name',item.name,'text','required')}${field('Velocidade comercial','speed',item.speed,'text','placeholder="Ex.: 500 Mega"')}
      ${field('Valor mensal','price',formMoney(item.price_cents),'text','required inputmode="decimal"')}${field('Taxa de instalação','installation_fee',formMoney(item.installation_fee_cents),'text','inputmode="decimal"')}
      ${field('Perfil PPP MikroTik','mikrotik_profile',item.mikrotik_profile||'default')}${field('Download (Mbps)','download_mbps',item.download_mbps||'','number','min="0"')}${field('Upload (Mbps)','upload_mbps',item.upload_mbps||'','number','min="0"')}
      <label class="check"><input type="checkbox" name="active" ${item.active===false?'':'checked'}>Plano ativo</label>
      <label class="check"><input type="checkbox" name="portal_visible" ${item.portal_visible===false?'':'checked'}>Mostrar na Área do Cliente</label>
      <label class="check"><input type="checkbox" name="highlighted" ${checkbox(item.highlighted)?'checked':''}>Destacar como oferta</label>
      ${textareaField('Descrição comercial','description',item.description)}
      <div class="form-actions span-2"><button class="btn secondary" type="button" data-action="close-modal">Cancelar</button><button class="btn primary" type="submit">Salvar plano</button></div>
    </form>`;
  }

  function invoiceForm(item={}){
    const clientOpts=`<option value="">Selecione</option>${clients.map((c)=>option(c.id,`${c.name} · ${c.contract_number||c.document||''}`,item.client_id)).join('')}`;
    return `<form id="invoice-form" class="form-grid"><input type="hidden" name="id" value="${attr(item.id||'')}">
      ${selectField('Cliente','client_id',clientOpts,'required')}${field('Vencimento','due_date',text(item.due_date).slice(0,10),'date','required')}
      ${field('Valor','amount',formMoney(invoiceCents(item)),'text','required inputmode="decimal"')}${field('Referência','reference',item.reference||item.competency||'','text','placeholder="2026-09"')}
      ${selectField('Tipo','billing_type',['Mensalidade','Primeira mensalidade proporcional','Pix com vencimento','Pix Automático','Boleto','Ajuste','Renegociação'].map((v)=>option(v,v,item.billing_type||'Mensalidade')).join(''))}
      ${selectField('Banco emissor','bank_provider',`<option value="">Padrão do sistema</option>${option('efi','Efí Bank',item.bank_provider)}${option('mercadoPago','Mercado Pago',item.bank_provider)}`)}
      ${selectField('Status','status',['Pendente','Agendada','Vencida','Pago','Cancelado'].map((v)=>option(v,v,item.status||'Pendente')).join(''))}
      <label class="check"><input type="checkbox" name="discount_until_due" ${checkbox(item.discount_until_due)?'checked':''}>Desconto se pagar até o vencimento</label>
      ${field('Valor do desconto (R$)','discount',formMoney(item.discount_cents||item.discount_value_cents),'text','inputmode="decimal"')}
      <p class="hint span-2">Desconto condicional até o vencimento é emitido pela Efí. O boleto Mercado Pago não aplica este desconto.</p>
      <label class="check"><input type="checkbox" name="cashback_eligible" ${item.cashback_eligible===false?'':'checked'}>Esta cobrança pode gerar cashback</label>
      ${textareaField('Descrição','description',item.description||'Mensalidade de internet')}
      <div class="form-actions span-2"><button class="btn secondary" type="button" data-action="close-modal">Cancelar</button><button class="btn primary" type="submit">Salvar mensalidade</button></div>
    </form>`;
  }

  function manualPaymentForm(item={}){
    return `<form id="manual-payment-form" class="form-grid"><input type="hidden" name="id" value="${attr(item.id||'')}">
      ${selectField('Forma de pagamento','payment_method',['Pix','Dinheiro','Cartão','Transferência','Boleto','Outro'].map((v)=>option(v,v,'Pix')).join(''))}
      ${field('Data/hora da baixa','paid_at',new Date().toISOString().slice(0,16),'datetime-local','required')}
      ${textareaField('Observação da baixa','payment_note','')}
      <div class="form-actions span-2"><button class="btn secondary" type="button" data-action="close-modal">Cancelar</button><button class="btn success" type="submit">Confirmar baixa</button></div>
    </form>`;
  }

  function cashbackRulesForm(){const s=state.settings||{};return `<form id="cashback-rules-form" class="form-grid"><label class="check span-2"><input type="checkbox" name="cashback_enabled" ${checkbox(s.cashback_enabled)?'checked':''}>Ativar cashback após pagamento PIX</label>${selectField('Cálculo','cashback_mode',`${option('percent','Percentual',s.cashback_mode||'percent')}${option('fixed','Valor fixo',s.cashback_mode)}`)}${field('Percentual (%)','cashback_rate',Number(s.cashback_rate)||0,'number','min="0" max="100" step="0.01"')}${field('Valor fixo (R$)','cashback_fixed',formMoney(s.cashback_fixed_cents),'text','inputmode="decimal"')}<div class="form-actions span-2"><button class="btn secondary" type="button" data-action="close-modal">Cancelar</button><button class="btn primary" type="submit">Salvar regras</button></div></form>`;}
  function cashbackAdjustForm(){return `<form id="cashback-adjust-form" class="form-grid">${selectField('Cliente','client_id',`<option value="">Selecione</option>${clients.map((c)=>{const cents=Number.isFinite(Number(c.cashback_balance_cents))?Math.max(0,Math.round(Number(c.cashback_balance_cents))):Math.max(0,Math.round((Number(c.cashback_balance)||0)*100));return option(c.id,`${c.name} · Saldo ${money(cents,true)}`,'')}).join('')}`,'required')}${selectField('Operação','operation',`${option('add','Adicionar saldo','add')}${option('remove','Retirar saldo','')}`)}${field('Valor (R$)','amount','','text','required inputmode="decimal"')}${field('Motivo','reason','','text','required minlength="3"')}<p class="hint span-2">O saldo exibido vem da carteira atual do cliente. Ao retirar, o sistema impede que o saldo fique negativo.</p><div class="form-actions span-2"><button class="btn secondary" type="button" data-action="close-modal">Cancelar</button><button class="btn primary" type="submit">Confirmar movimentação</button></div></form>`;}

  function routerForm(item={}){return `<form id="router-form" class="form-grid"><input type="hidden" name="id" value="${attr(item.id||'')}">${field('Nome','name',item.name||'MikroTik','text','required')}${field('Host público / DDNS','host',item.host,'text','required')}${field('Porta HTTPS','port',item.port||443,'number','min="1" max="65535"')}${field('Usuário','username',item.username,'text','required')}${field('Senha do MikroTik','password','','password',item.id?'placeholder="Deixe em branco para manter"':'required')}${field('Método','connection_method','REST HTTPS','text','readonly')}<label class="check"><input type="checkbox" name="active" ${item.active===false?'':'checked'}>Roteador ativo</label><label class="check"><input type="checkbox" name="allow_self_signed" ${checkbox(item.allow_self_signed)?'checked':''}>Certificado próprio cadastrado</label><p class="hint span-2">A Cloudflare exige acesso HTTPS público ao RouterOS 7. A credencial é armazenada separadamente e não aparece no estado do painel.</p><div class="form-actions span-2"><button class="btn secondary" type="button" data-action="close-modal">Cancelar</button><button class="btn primary" type="submit">Salvar MikroTik</button></div></form>`;}

  function protocolForm(){
    const staffOpts=`<option value="">Não atribuído</option>${activeStaff.map((x)=>option(x.id,`${x.name} · ${x.role}`,'' )).join('')}`;
    return `<form id="protocol-form" class="form-grid">${selectField('Cliente','clientId',`<option value="">Sem cliente específico</option>${clients.map((c)=>option(c.id,c.name,'')).join('')}`)}${selectField('Categoria','category',['Sem internet','Internet lenta','Queda constante','Wi-Fi','Financeiro','Mudança de endereço','Troca de equipamento','Instalação','Cancelamento','Outros'].map((v)=>option(v,v,'')).join(''))}${field('Assunto','subject','','text','required')}${selectField('Prioridade','priority',['Baixa','Normal','Alta','Urgente'].map((v)=>option(v,v,'Normal')).join(''))}${selectField('Status','status',['Aberto','Em atendimento','Aguardando cliente','Aguardando técnico'].map((v)=>option(v,v,'Aberto')).join(''))}${selectField('Responsável','assigned_user_id',staffOpts)}${field('Agendar visita','scheduled_at','','datetime-local')}${textareaField('Detalhes','details','','required placeholder="Descreva o problema, testes e observações"')}<div class="form-actions span-2"><button class="btn secondary" type="button" data-action="close-modal">Cancelar</button><button class="btn primary" type="submit">Abrir chamado</button></div></form>`;
  }

  function employeeForm(item={}){return `<form id="employee-form" class="form-grid"><input type="hidden" name="id" value="${attr(item.id||'')}">${field('Nome','name',item.name,'text','required')}${field('Usuário / e-mail','login',item.email,'text','required')}${field(item.id?'Nova senha':'Senha inicial','password','','password',item.id?'placeholder="Deixe em branco para manter"':'required minlength="8"')}${field('Telefone','phone',item.phone)}${selectField('Perfil','role',['admin','atendente','tecnico'].map((v)=>option(v,v,item.role||'atendente')).join(''))}<label class="check"><input type="checkbox" name="active" ${item.active===false?'':'checked'}>Usuário ativo</label><fieldset class="span-2"><legend>Permissões</legend><div class="check-grid">${PERMISSIONS.map((p)=>`<label class="check"><input type="checkbox" name="permissions" value="${p}" ${(item.role==='admin'||(item.permissions||[]).includes(p))?'checked':''}>${p}</label>`).join('')}</div></fieldset><div class="form-actions span-2"><button class="btn secondary" type="button" data-action="close-modal">Cancelar</button><button class="btn primary" type="submit">Salvar funcionário</button></div></form>`;}

  function storyForm(item={}){return `<form id="story-form" class="form-grid"><input type="hidden" name="id" value="${attr(item.id||'')}">${field('Título','title',item.title,'text','required maxlength="80"')}${selectField('Formato','mediaType',['text','image','video'].map((v)=>option(v,v,item.mediaType||'text')).join(''))}${field('URL da mídia (HTTPS)','mediaUrl',item.mediaUrl,'url')}${field('Texto do botão','actionLabel',item.actionLabel)}${field('URL do botão (HTTPS)','actionUrl',item.actionUrl,'url')}${selectField('Público','audience',`${option('all','Todos',item.audience||'all')}${option('active','Clientes ativos',item.audience)}${option('blocked','Clientes bloqueados',item.audience)}`)}${selectField('Plano específico','planId',`<option value="">Todos os planos</option>${data.plans.map((p)=>option(p.id,p.name,item.planId)).join('')}`)}${field('Cidade específica','city',item.city)}${field('Início','startAt',text(item.startAt).slice(0,16),'datetime-local')}${field('Fim','endAt',text(item.endAt).slice(0,16),'datetime-local')}<label class="check"><input type="checkbox" name="active" ${item.active===false?'':'checked'}>Publicidade ativa</label>${textareaField('Mensagem','message',item.message,'maxlength="400"')}<div class="form-actions span-2"><button class="btn secondary" type="button" data-action="close-modal">Cancelar</button><button class="btn primary" type="submit">Salvar publicidade</button></div></form>`;}

  function efiForm(){const e=bankSafe.efi||{},configured=Boolean(e.clientIdConfigured||e.clientSecretConfigured||e.certificateConfigured||e.pixKey);return `<form id="efi-form" class="form-grid"><label class="check span-2"><input type="checkbox" name="enabled" ${e.enabled?'checked':''}>Ativar Efí</label>${selectField('Ambiente','environment',`${option('production','Produção',e.environment)}${option('sandbox','Homologação',e.environment)}`)}${field('Client ID','clientId','','text',`placeholder="${e.clientIdConfigured?'Configurado — deixe vazio para manter':'Informe o Client ID'}"`)}${field('Client Secret','clientSecret','','password',`placeholder="${e.clientSecretConfigured?'Configurado — deixe vazio para manter':'Informe o Client Secret'}"`)}${field('Senha do certificado','certificatePassword','','password',`placeholder="${e.certificatePasswordConfigured?'Configurada — deixe vazio para manter':'Senha do P12/PFX'}"`)}<label>Certificado P12/PFX<input name="certificate" type="file" accept=".p12,.pfx,application/x-pkcs12"></label>${field('Chave PIX','pixKey',e.pixKey)}${field('Agência recebedora','pixAutoReceiverAgency',e.pixAutoReceiverAgency)}${field('Conta recebedora','pixAutoReceiverAccount',e.pixAutoReceiverAccount)}${field('Webhook URL','webhookUrl',e.webhookUrl,'url')}<div class="form-actions span-2">${configured?'<button class="btn danger" type="button" data-action="delete-efi">Remover integração</button>':''}<span class="form-spacer"></span><button class="btn secondary" type="button" data-action="close-modal">Cancelar</button><button class="btn primary" type="submit">Salvar Efí</button></div></form>`;}
  function mpForm(){const m=bankSafe.mercadoPago||{},configured=Boolean(m.accessTokenConfigured||m.publicKey||m.webhookSecretConfigured);return `<form id="mp-form" class="form-grid"><label class="check span-2"><input type="checkbox" name="enabled" ${m.enabled?'checked':''}>Ativar Mercado Pago</label>${selectField('Ambiente','environment',`${option('production','Produção',m.environment)}${option('sandbox','Teste',m.environment)}`)}${field('Public Key','publicKey',m.publicKey||'')}${field('Access Token','accessToken','','password',`placeholder="${m.accessTokenConfigured?'Configurado — deixe vazio para manter':'Informe o Access Token'}"`)}${field('Chave secreta do Webhook','webhookSecret','','password',`placeholder="${m.webhookSecretConfigured?'Configurada — deixe vazio para manter':'Informe se já possuir'}"`)}<div class="form-actions span-2">${m.webhookSecretConfigured?'<button class="btn secondary" type="button" data-action="delete-mp-webhook">Remover chave Webhook</button>':''}${configured?'<button class="btn danger" type="button" data-action="delete-mp">Remover integração</button>':''}<span class="form-spacer"></span><button class="btn secondary" type="button" data-action="close-modal">Cancelar</button><button class="btn primary" type="submit">Salvar Mercado Pago</button></div></form>`;}

  return {clientForm,pixAutoForm,carnetForm,planForm,invoiceForm,manualPaymentForm,cashbackRulesForm,cashbackAdjustForm,routerForm,protocolForm,employeeForm,storyForm,efiForm,mpForm};
}
