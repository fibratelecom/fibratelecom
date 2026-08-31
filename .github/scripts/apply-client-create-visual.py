from pathlib import Path

TARGET = Path('dashboard-transition-guard.js')
BOOT = Path('bootstrap.js')
INDEX = Path('index.html')

js = TARGET.read_text(encoding='utf-8')

css_marker = "`;document.head.appendChild(s)}"
if css_marker not in js:
    raise SystemExit('Marcador de estilos do cliente nao encontrado')

css = r'''
    .ppc-create-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:18px}.ppc-create-head-main{display:flex;align-items:flex-start;gap:13px}.ppc-create-head-icon{display:grid;place-items:center;flex:0 0 42px;width:42px;height:42px;border-radius:12px;background:#e7f6f1;color:#087866;font-size:18px;font-weight:900}.ppc-create-head h1{margin:3px 0 5px;color:#183e36;font-size:27px;line-height:1.15}.ppc-create-head p{margin:0;color:#71847f;font-size:11px;line-height:1.5}.ppc-create-contract{display:flex;align-items:center;gap:8px;margin-top:8px;color:#61756f;font-size:9px}.ppc-create-contract strong{color:#244940}.ppc-create-layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:14px;align-items:start}.ppc-create-aside{position:sticky;top:12px;display:grid;gap:10px}.ppc-create-progress,.ppc-create-help{padding:14px;background:#fff;border:1px solid #dce7e4;border-radius:13px;box-shadow:0 4px 16px rgba(30,72,63,.035)}.ppc-create-progress h3,.ppc-create-help h3{margin:0 0 10px;color:#244940;font-size:11px}.ppc-step-list{display:grid;gap:5px}.ppc-step-link{display:grid;grid-template-columns:28px 1fr;align-items:center;gap:8px;width:100%;padding:7px 8px;border:0;border-radius:9px;background:transparent;color:#61756f;text-align:left;cursor:pointer}.ppc-step-link:hover{background:#f0f8f5;color:#087866}.ppc-step-number{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:#eef5f3;color:#57716a;font-size:9px;font-weight:900}.ppc-step-link:hover .ppc-step-number{background:#dff3ed;color:#087866}.ppc-step-link strong{display:block;font-size:9px}.ppc-step-link small{display:block;margin-top:2px;color:#8a9995;font-size:7.5px}.ppc-create-help p{margin:0;color:#748681;font-size:8.5px;line-height:1.55}.ppc-create-help .ppc-help-badge{display:flex;align-items:center;gap:6px;margin-top:10px;padding:8px;border-radius:8px;background:#ecf8f4;color:#176e5d;font-size:8px;font-weight:800}.ppc-create-main{min-width:0}.ppc-create-form{display:grid;gap:12px}.ppc-create-card{scroll-margin-top:14px;padding:17px 18px;background:#fff;border:1px solid #dce7e4;border-radius:14px;box-shadow:0 4px 16px rgba(30,72,63,.035)}.ppc-create-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;padding-bottom:11px;border-bottom:1px solid #edf2f0}.ppc-create-card-title{display:flex;align-items:center;gap:10px}.ppc-create-card-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:#edf7f4;color:#087866;font-size:12px;font-weight:900}.ppc-create-card h2{margin:0;color:#244940;font-size:13px}.ppc-create-card p{margin:4px 0 0;color:#80918c;font-size:8.5px;line-height:1.45}.ppc-create-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:10px}.ppc-create-grid label{display:grid;grid-column:span 4;gap:5px;color:#526862;font-size:8.5px;font-weight:800}.ppc-create-grid label.col-6{grid-column:span 6}.ppc-create-grid label.col-8{grid-column:span 8}.ppc-create-grid label.col-12{grid-column:1/-1}.ppc-create-grid input,.ppc-create-grid select,.ppc-create-grid textarea{width:100%;border:1px solid #d2e0dd;border-radius:9px;background:#fff;color:#294b44;box-sizing:border-box;font:500 10.5px Segoe UI,Arial}.ppc-create-grid input,.ppc-create-grid select{height:39px;padding:0 10px}.ppc-create-grid textarea{min-height:86px;padding:9px 10px;resize:vertical}.ppc-create-grid input:focus,.ppc-create-grid select:focus,.ppc-create-grid textarea:focus{outline:0;border-color:#8bc8b9;box-shadow:0 0 0 3px rgba(11,143,123,.08)}.ppc-create-grid input:disabled,.ppc-create-grid select:disabled{background:#f4f7f6;color:#9aa8a4}.ppc-create-switch{display:flex!important;grid-column:span 6!important;align-items:center!important;justify-content:space-between!important;gap:12px;padding:10px 11px;border:1px solid #e2ebe8;border-radius:10px;background:#fafcfb}.ppc-create-switch span{display:grid;gap:2px}.ppc-create-switch strong{font-size:9px;color:#415d56}.ppc-create-switch small{font-size:7.5px;color:#83928e}.ppc-create-switch input{width:17px!important;height:17px!important;box-shadow:none!important}.ppc-create-mikrotik{display:grid;grid-template-columns:auto 1fr;gap:9px;align-items:start;margin-top:11px;padding:11px 12px;border:1px solid #d7eae4;border-radius:10px;background:#eff9f6;color:#176e5d}.ppc-create-mikrotik span{font-size:15px}.ppc-create-mikrotik strong{display:block;font-size:9px}.ppc-create-mikrotik small{display:block;margin-top:3px;font-size:8px;line-height:1.45;color:#5e7c73}.ppc-create-actions{position:sticky;bottom:10px;z-index:4;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:2px;padding:10px 12px;border:1px solid #dce7e4;border-radius:12px;background:rgba(255,255,255,.96);box-shadow:0 10px 30px rgba(25,62,54,.10);backdrop-filter:blur(8px)}.ppc-create-actions small{color:#7d8f8a;font-size:8px}.ppc-create-actions-buttons{display:flex;gap:8px}.ppc-create-required{color:#b14e3c}.ppc-create-message-slot:empty{display:none}.ppc-create-message-slot:not(:empty){margin-bottom:12px}
    @media(max-width:1080px){.ppc-create-layout{grid-template-columns:1fr}.ppc-create-aside{position:static;grid-template-columns:1fr 1fr}.ppc-step-list{grid-template-columns:repeat(5,minmax(0,1fr))}.ppc-step-link{grid-template-columns:28px 1fr}.ppc-step-link small{display:none}}
    @media(max-width:820px){.ppc-create-grid label,.ppc-create-grid label.col-6,.ppc-create-grid label.col-8{grid-column:span 6}.ppc-create-switch{grid-column:1/-1!important}.ppc-create-aside{grid-template-columns:1fr}.ppc-step-list{grid-template-columns:1fr 1fr}.ppc-create-head{display:block}.ppc-create-head-actions{margin-top:12px}}
    @media(max-width:580px){.ppc-create-grid label,.ppc-create-grid label.col-6,.ppc-create-grid label.col-8{grid-column:1/-1}.ppc-create-actions{align-items:stretch;flex-direction:column}.ppc-create-actions-buttons{display:grid;grid-template-columns:1fr 1fr;width:100%}.ppc-step-list{grid-template-columns:1fr}.ppc-create-head-main{display:block}.ppc-create-head-icon{margin-bottom:8px}}
'''

if '.ppc-create-layout{' not in js:
    js = js.replace(css_marker, css + css_marker, 1)

start = js.find('  async function renderClientCreate(){')
end = js.find('\n  function ensureClientButton()', start)
if start < 0 or end < 0:
    raise SystemExit('Funcao renderClientCreate nao encontrada')

new_func = r'''  async function renderClientCreate(){
    const h=openClientHost();if(!h)return;
    h.innerHTML='<div class="ppc-loading"><span></span><strong>Preparando cadastro...</strong></div>';
    try{
      await loadClientData();
      let next='';try{next=String(await api()?.clients?.nextContract?.()||'')}catch{}
      const planOptions=clientData.plans.filter(p=>p?.active!==0&&p?.active!==false).map(p=>`<option value="${Number(p.id)||0}">${esc(p.name||'Plano')}${p.speed?` · ${esc(p.speed)}`:''}</option>`).join('');
      const routerOptions=clientData.routers.map(r=>`<option value="${Number(r.id)||0}">${esc(r.name||'MikroTik')} · ${esc(r.host||'sem endereço')}</option>`).join('');
      h.innerHTML=`
        <div class="ppc-create-head">
          <div class="ppc-create-head-main"><span class="ppc-create-head-icon">＋</span><div><span class="ppc-eyebrow">GESTÃO DE ASSINANTES · NOVO CADASTRO</span><h1>Cadastrar cliente</h1><p>Cadastre o assinante, defina o plano e, se necessário, provisione o acesso PPPoE no mesmo fluxo.</p><div class="ppc-create-contract"><span>Contrato sugerido</span><strong>${esc(next||'será definido ao salvar')}</strong></div></div></div>
          <div class="ppc-head-actions ppc-create-head-actions"><button type="button" class="ppc-button" id="ppc-back-consult">← Voltar para clientes</button></div>
        </div>
        <div id="ppc-create-message" class="ppc-create-message-slot"></div>
        <div class="ppc-create-layout">
          <aside class="ppc-create-aside">
            <section class="ppc-create-progress"><h3>Etapas do cadastro</h3><div class="ppc-step-list">
              <button type="button" class="ppc-step-link" data-create-target="ppc-create-ident"><span class="ppc-step-number">01</span><span><strong>Identificação</strong><small>Cliente e contrato</small></span></button>
              <button type="button" class="ppc-step-link" data-create-target="ppc-create-address"><span class="ppc-step-number">02</span><span><strong>Contato e endereço</strong><small>Instalação e cobrança</small></span></button>
              <button type="button" class="ppc-step-link" data-create-target="ppc-create-billing"><span class="ppc-step-number">03</span><span><strong>Plano e cobrança</strong><small>Plano, vencimento e status</small></span></button>
              <button type="button" class="ppc-step-link" data-create-target="ppc-create-network"><span class="ppc-step-number">04</span><span><strong>Conexão</strong><small>MikroTik e PPPoE</small></span></button>
              <button type="button" class="ppc-step-link" data-create-target="ppc-create-device"><span class="ppc-step-number">05</span><span><strong>Equipamento</strong><small>ONU, roteador e notas</small></span></button>
            </div></section>
            <section class="ppc-create-help"><h3>Cadastro integrado</h3><p>Os dados são gravados no mesmo cadastro de clientes usado pelo financeiro e pela consulta. Não existe base paralela.</p><div class="ppc-help-badge">◆ PPPoE só é provisionado depois de salvar</div></section>
          </aside>
          <main class="ppc-create-main">
            <form id="ppc-create-form" class="ppc-create-form">
              <section class="ppc-create-card" id="ppc-create-ident"><div class="ppc-create-card-head"><div class="ppc-create-card-title"><span class="ppc-create-card-icon">01</span><div><h2>Identificação</h2><p>Dados principais do assinante e identificação contratual.</p></div></div></div><div class="ppc-create-grid">
                <label>Tipo de pessoa<select name="person_type"><option>Pessoa física</option><option>Pessoa jurídica</option></select></label>
                <label class="col-8">Nome / Razão social <span class="ppc-create-required">*</span><input name="name" required autofocus placeholder="Nome completo ou razão social"></label>
                <label class="col-6">Nome fantasia<input name="trade_name" placeholder="Opcional"></label>
                <label class="col-6">CPF / CNPJ<input name="document" placeholder="Documento do assinante"></label>
                <label>RG / Inscrição estadual<input name="rg_ie"></label>
                <label>Data de nascimento / abertura<input name="birth_date" type="date"></label>
                <label>Número do contrato<input name="contract_number" value="${esc(next)}"></label>
                <label>Data de instalação<input name="installation_date" type="date"></label>
              </div></section>
              <section class="ppc-create-card" id="ppc-create-address"><div class="ppc-create-card-head"><div class="ppc-create-card-title"><span class="ppc-create-card-icon">02</span><div><h2>Contato e endereço</h2><p>Informações de comunicação, instalação e referência de cobrança.</p></div></div></div><div class="ppc-create-grid">
                <label>Telefone<input name="phone" placeholder="(00) 0000-0000"></label>
                <label>WhatsApp<input name="whatsapp" placeholder="(00) 00000-0000"></label>
                <label class="col-6">E-mail<input name="email" type="email" placeholder="cliente@exemplo.com"></label>
                <label>CEP<input name="cep" inputmode="numeric" maxlength="9" placeholder="00000-000"></label>
                <label class="col-8">Rua / Logradouro<input name="street"></label>
                <label>Número<input name="address_number"></label>
                <label>Complemento<input name="complement"></label>
                <label>Bairro<input name="neighborhood"></label>
                <label class="col-6">Cidade<input name="city"></label>
                <label>UF<input name="state" maxlength="2" placeholder="UF"></label>
                <label class="col-12">Referência do endereço<input name="address_reference" placeholder="Ponto de referência para instalação"></label>
              </div></section>
              <section class="ppc-create-card" id="ppc-create-billing"><div class="ppc-create-card-head"><div class="ppc-create-card-title"><span class="ppc-create-card-icon">03</span><div><h2>Plano e cobrança</h2><p>Defina o serviço contratado, vencimento e situação inicial do cliente.</p></div></div></div><div class="ppc-create-grid">
                <label class="col-8">Plano contratado <span class="ppc-create-required">*</span><select name="plan_id" required><option value="">Selecione o plano</option>${planOptions}</select></label>
                <label>Dia do vencimento <span class="ppc-create-required">*</span><input name="due_day" type="number" min="1" max="31" value="10" required></label>
                <label>Status<select name="status"><option>Ativo</option><option>Em atraso</option><option>Bloqueado</option></select></label>
                <label class="ppc-create-switch"><span><strong>Bloqueio automático</strong><small>Permitir bloqueio por inadimplência</small></span><input name="auto_block" type="checkbox"></label>
              </div></section>
              <section class="ppc-create-card" id="ppc-create-network"><div class="ppc-create-card-head"><div class="ppc-create-card-title"><span class="ppc-create-card-icon">04</span><div><h2>Conexão e MikroTik</h2><p>Vincule o assinante ao roteador e prepare o provisionamento PPPoE.</p></div></div></div><div class="ppc-create-grid">
                <label>Tipo de conexão<select name="connection_type"><option value="PPPoE">PPPoE</option><option value="">Sem integração</option></select></label>
                <label class="col-8">MikroTik responsável <span class="ppc-create-required">*</span><select name="router_id"><option value="">Selecione o MikroTik</option>${routerOptions}</select></label>
                <label class="col-6">Usuário PPPoE<input name="pppoe_username" placeholder="login do assinante"></label>
                <label class="col-6">Senha PPPoE<input name="pppoe_password" type="password" placeholder="senha de acesso"></label>
                <label class="col-6">Profile no MikroTik<select name="mikrotik_profile"><option value="">Selecione o MikroTik primeiro</option></select></label>
                <label>IP fixo / remoto<input name="ip" placeholder="Opcional"></label>
                <label>MAC / Caller ID<input name="mac_address" placeholder="AA:BB:CC:DD:EE:FF"></label>
              </div><div class="ppc-create-mikrotik"><span>↻</span><div><strong>Provisionamento protegido</strong><small>Ao salvar, o sistema cria ou atualiza o secret PPPoE no MikroTik selecionado e registra o estado de sincronização no mesmo cliente.</small></div></div></section>
              <section class="ppc-create-card" id="ppc-create-device"><div class="ppc-create-card-head"><div class="ppc-create-card-title"><span class="ppc-create-card-icon">05</span><div><h2>Equipamento e observações</h2><p>Dados opcionais do equipamento instalado e anotações operacionais.</p></div></div></div><div class="ppc-create-grid">
                <label class="col-8">IP do roteador / ONU<input name="device_ip" placeholder="Ex.: 192.168.1.1"></label>
                <label>Porta<input name="device_port" type="number" min="0" max="65535" value="80"></label>
                <label class="col-12">Observações<textarea name="notes" placeholder="Informações importantes sobre instalação, acesso ou atendimento"></textarea></label>
              </div></section>
              <div class="ppc-create-actions"><small><span class="ppc-create-required">*</span> Campos obrigatórios. Os demais podem ser preenchidos depois.</small><div class="ppc-create-actions-buttons"><button type="button" class="ppc-button" id="ppc-cancel-create">Cancelar</button><button type="submit" class="ppc-button primary">Salvar cliente</button></div></div>
            </form>
          </main>
        </div>`;
      const form=h.querySelector('#ppc-create-form');
      h.querySelector('#ppc-back-consult').onclick=()=>renderClientConsult();
      h.querySelector('#ppc-cancel-create').onclick=()=>renderClientConsult();
      h.querySelectorAll('[data-create-target]').forEach(button=>button.onclick=()=>document.getElementById(button.dataset.createTarget)?.scrollIntoView({behavior:'smooth',block:'start'}));
      toggleConnectionFields(form);
      form.elements.connection_type.onchange=()=>toggleConnectionFields(form);
      form.elements.router_id.onchange=()=>{const id=Number(form.elements.router_id.value)||0;if(id&&form.elements.connection_type.value==='PPPoE')loadProfiles(id,form.elements.mikrotik_profile);else form.elements.mikrotik_profile.innerHTML='<option value="">Selecione o MikroTik primeiro</option>'};
      form.elements.cep.addEventListener('blur',async()=>{const raw=String(form.elements.cep.value||'').replace(/\D/g,'');if(raw.length!==8||!api()?.address?.lookupCep)return;try{const a=await api().address.lookupCep(raw);for(const [name,val] of [['cep',a.cep],['street',a.street],['neighborhood',a.neighborhood],['city',a.city],['state',a.state],['complement',a.complement]])if(val&&form.elements[name])form.elements[name].value=val}catch{}});
      form.onsubmit=async e=>{e.preventDefault();showCreateMessage('');const submit=form.querySelector('[type="submit"]');submit.disabled=true;submit.textContent='Salvando...';try{const fd=new FormData(form),get=n=>String(fd.get(n)||'').trim(),connection=get('connection_type'),routerId=Number(fd.get('router_id'))||null;if(connection==='PPPoE'&&!routerId)throw new Error('Selecione o MikroTik responsável pelo cliente.');const planId=Number(fd.get('plan_id'))||null,plan=clientData.plans.find(p=>Number(p?.id)===planId),street=get('street'),number=get('address_number'),neighborhood=get('neighborhood'),city=get('city'),state=get('state');const payload={person_type:get('person_type'),name:get('name'),trade_name:get('trade_name'),document:get('document'),rg_ie:get('rg_ie'),birth_date:get('birth_date'),phone:get('phone'),whatsapp:get('whatsapp'),email:get('email'),cep:get('cep'),zip_code:get('cep'),street,address:[street,number,neighborhood,city,state].filter(Boolean).join(', '),address_number:number,complement:get('complement'),neighborhood,city,state,address_reference:get('address_reference'),contract_number:get('contract_number'),installation_date:get('installation_date'),plan_id:planId,plan:plan?.name||'',plan_name:plan?.name||'',due_day:Number(fd.get('due_day'))||10,status:get('status')||'Ativo',auto_block:fd.get('auto_block')==='on',connection_type:connection||null,router_id:routerId,pppoe_username:get('pppoe_username'),pppoe_password:get('pppoe_password'),mikrotik_profile:get('mikrotik_profile'),ip:get('ip'),mac_address:get('mac_address'),device_ip:get('device_ip'),device_port:Number(fd.get('device_port'))||0,notes:get('notes')};const p=api();let saved=await p.clients.save(payload),message='Cliente cadastrado com sucesso.';if(saved?.connection_type==='PPPoE'&&saved?.router_id){try{const mk=await p.mikrotik.savePppoe(saved.router_id,{...saved,...payload});if(p.clients.setMikrotikState)await p.clients.setMikrotikState(saved.id,{secretId:mk.secretId,status:'Sincronizado',lastSync:new Date().toISOString()});message=`Cliente cadastrado e acesso PPPoE ${mk.action==='created'?'criado':'atualizado'} no ${mk.routerName||'MikroTik'}.`}catch(err){if(p.clients.setMikrotikState)try{await p.clients.setMikrotikState(saved.id,{secretId:saved.mikrotik_secret_id||'',status:'Falha na sincronização',lastSync:new Date().toISOString()})}catch{}showCreateMessage(`Cliente salvo, porém o MikroTik não sincronizou: ${err?.message||err}`,true);submit.disabled=false;submit.textContent='Salvar cliente';return}}await renderClientConsult(message)}catch(err){showCreateMessage(err?.message||String(err),true);submit.disabled=false;submit.textContent='Salvar cliente'}};
    }catch(e){h.innerHTML=`<div class="ppc-message error">${esc(e?.message||e)}</div>`}
  }
'''

js = js[:start] + new_func + js[end:]
TARGET.write_text(js, encoding='utf-8')

boot = BOOT.read_text(encoding='utf-8')
import re
boot, n1 = re.subn(r"const BUILD_TOKEN='[^']+'", "const BUILD_TOKEN='20260831-client-create1'", boot, count=1)
boot, n2 = re.subn(r"/dashboard-transition-guard\.js\?v=[^']+", "/dashboard-transition-guard.js?v=20260831-client-create1", boot, count=1)
if n1 != 1 or n2 != 1:
    raise SystemExit(f'Falha ao atualizar tokens do bootstrap: {n1}, {n2}')
BOOT.write_text(boot, encoding='utf-8')

index = INDEX.read_text(encoding='utf-8')
index, n3 = re.subn(r'/bootstrap\.js\?v=[^\"]+', '/bootstrap.js?v=20260831-client-create1', index, count=1)
if n3 != 1:
    raise SystemExit('Falha ao atualizar token do index')
INDEX.write_text(index, encoding='utf-8')

print('Novo visual do cadastro de clientes aplicado.')
