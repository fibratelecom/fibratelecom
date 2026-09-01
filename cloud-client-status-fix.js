(()=>{
  if(!window.__ProvedorPlusLegacyClientMarkerInstalled){
    window.__ProvedorPlusLegacyClientMarkerInstalled=true;
    window.__ProvedorPlusClientHubInstalled=true;
    const normalizeLabel=value=>String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
    const removeClientPdfButton=()=>{
      document.querySelectorAll('button,a,[role="button"]').forEach(node=>{
        if(normalizeLabel(node.textContent)==='baixar pdf')node.remove();
      });
    };
    const markLegacyClient=()=>{
      removeClientPdfButton();
      const nav=document.querySelector('.app-shell .sidebar nav[aria-label="Menu principal"],.app-shell .sidebar nav,.app-shell aside nav[aria-label="Menu principal"],.app-shell aside nav,.sidebar nav,aside nav');
      if(!nav)return;
      const item=[...nav.querySelectorAll('button,a,[role="button"]')].find(node=>{
        const label=normalizeLabel(node.textContent);
        return label.includes('clientes')||label==='cliente';
      });
      if(item){
        item.dataset.ppClientHub='1';
        return;
      }
      let marker=nav.querySelector('[data-pp-client-hub="1"][data-pp-legacy-client-marker="1"]');
      if(!marker){
        marker=document.createElement('span');
        marker.hidden=true;
        marker.setAttribute('aria-hidden','true');
        marker.dataset.ppClientHub='1';
        marker.dataset.ppLegacyClientMarker='1';
        nav.appendChild(marker);
      }
    };
    const observer=new MutationObserver(markLegacyClient);
    observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
    window.addEventListener('DOMContentLoaded',markLegacyClient,{once:true});
    markLegacyClient();
  }

  if(!window.__ProvedorPlusPaymentRefreshInstalled){
    window.__ProvedorPlusPaymentRefreshInstalled=true;
    const STATE_KEY='provedor_plus_web_1_0_17';
    const NOTICE_KEY='provedor_plus_payment_confirmed_v1';
    const nativeGet=Storage.prototype.getItem;
    const nativeSet=Storage.prototype.setItem;
    const text=value=>String(value??'').trim();
    const paidInvoice=row=>{
      const status=text(row?.status||row?.bank_status).toLowerCase();
      return Boolean(text(row?.paid_at))||['pago','paid','baixado','settled','concluido','concluído','concluida','concluída'].some(value=>status.includes(value));
    };
    const invoiceCents=row=>{
      for(const key of ['amount_cents','total_cents','value_cents','price_cents']){const n=Number(row?.[key]);if(Number.isFinite(n))return Math.max(0,Math.round(n))}
      for(const key of ['amount','total','value','price']){const n=Number(row?.[key]);if(Number.isFinite(n))return Math.max(0,Math.round(n*100))}
      return 0;
    };
    const paymentLabel=row=>{
      const method=text(row?.payment_method),detail=text(row?.bank_status_detail).toLowerCase();
      if(method)return method;
      if(detail.includes('pix')||text(row?.bank_pix_code||row?.pix_copy_paste))return 'PIX';
      return 'Boleto';
    };
    const noticeInfo=(row,count=1)=>({
      title:'Pagamento confirmado',
      message:`${paymentLabel(row)} da fatura ${text(row?.reference||row?.competency||row?.due_date||row?.id)||'-'} reconhecido${count>1?` · ${count} pagamentos atualizados`:''}.`,
      amountCents:invoiceCents(row)
    });
    const showPaymentNotice=info=>{
      if(!info||!document.body)return;
      document.querySelector('.pp-payment-confirmed-notice')?.remove();
      const node=document.createElement('div');node.className='pp-payment-confirmed-notice';
      node.style.cssText='position:fixed;right:22px;top:22px;z-index:2147483647;width:min(390px,calc(100vw - 28px));padding:17px 18px;border-radius:14px;background:#123f34;color:#fff;border:1px solid rgba(88,225,171,.48);box-shadow:0 18px 48px rgba(0,0,0,.28);font-family:Segoe UI,Arial,sans-serif';
      const title=document.createElement('strong');title.textContent=info.title||'Pagamento confirmado';title.style.cssText='display:block;font-size:16px;margin-bottom:5px';
      const message=document.createElement('span');message.textContent=info.message||'O pagamento foi reconhecido e a situação da fatura foi atualizada.';message.style.cssText='display:block;font-size:13px;line-height:1.45;color:#d8f7eb';
      node.append(title,message);
      if(Number(info.amountCents)>0){const amount=document.createElement('b');amount.textContent=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(info.amountCents)/100);amount.style.cssText='display:block;margin-top:8px;font-size:15px';node.appendChild(amount)}
      document.body.appendChild(node);setTimeout(()=>node.remove(),7000);
    };
    const consumeNotice=()=>{
      let raw='';try{raw=sessionStorage.getItem(NOTICE_KEY)||'';sessionStorage.removeItem(NOTICE_KEY)}catch{}
      if(!raw)return;let info=null;try{info=JSON.parse(raw)}catch{};if(info)setTimeout(()=>showPaymentNotice(info),450);
    };
    let pollTimer=null,polling=false;
    const schedulePoll=(delay=3000)=>{clearTimeout(pollTimer);pollTimer=setTimeout(pollPayments,delay)};
    async function pollPayments(){
      if(document.hidden||polling){schedulePoll();return}
      const localRaw=nativeGet.call(window.localStorage,STATE_KEY)||'';
      if(!localRaw){schedulePoll();return}
      let localState=null;try{localState=JSON.parse(localRaw)}catch{schedulePoll();return}
      polling=true;
      try{
        const response=await fetch('/api/cloud-state',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'state.get',data:{}})});
        let body={};try{body=await response.json()}catch{}
        const remoteState=body?.data?.state;
        if(!response.ok||!body?.ok||!remoteState||typeof remoteState!=='object')return;
        const localInvoices=Array.isArray(localState?.invoices)?localState.invoices:[],remoteInvoices=Array.isArray(remoteState?.invoices)?remoteState.invoices:[],byId=new Map(localInvoices.map(row=>[String(row?.id),row]));
        const paidChanges=remoteInvoices.filter(row=>{const before=byId.get(String(row?.id));return before&&!paidInvoice(before)&&paidInvoice(row)});
        if(!paidChanges.length)return;
        const remoteById=new Map(remoteInvoices.map(row=>[String(row?.id),row]));
        localState.invoices=localInvoices.map(row=>{
          const remote=remoteById.get(String(row?.id));if(!remote||!paidInvoice(remote))return row;
          const merged={...row,...remote};if(!text(merged.status)||!paidInvoice({status:merged.status,paid_at:merged.paid_at,bank_status:''}))merged.status='Pago';return merged;
        });
        nativeSet.call(window.localStorage,STATE_KEY,JSON.stringify(localState));
        const info=noticeInfo(paidChanges[paidChanges.length-1],paidChanges.length);
        try{sessionStorage.setItem(NOTICE_KEY,JSON.stringify(info))}catch{}
        setTimeout(()=>location.reload(),120);
      }catch{}
      finally{polling=false;schedulePoll()}
    }
    window.addEventListener('focus',()=>schedulePoll(250));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedulePoll(250)});
    consumeNotice();schedulePoll(2500);
  }

  const api=window.provedor;
  if(!api?.clients||api.clients.__cloudStatusFixInstalled||typeof api.clients.status!=='function')return;
  const originalStatus=api.clients.status.bind(api.clients);

  const number=v=>Number.isFinite(Number(v))?Number(v):0;
  const localMonthKey=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
  const emptyCurrent=()=>({month:localMonthKey(),download_bytes:0,upload_bytes:0});

  function normalizeStatus(value,client){
    const out=value&&typeof value==='object'?{...value}:{};
    const resolvedClient=out.client||client||null;
    const traffic=out.traffic&&typeof out.traffic==='object'?out.traffic:{};
    const current=traffic.current&&typeof traffic.current==='object'?traffic.current:emptyCurrent();
    out.client=resolvedClient;
    out.connectionState=out.connectionState||(
      resolvedClient?.connection_type==='PPPoE'?'unavailable':'not_applicable'
    );
    out.connectionError=String(out.connectionError||'');
    out.liveRatesAvailable=Boolean(out.liveRatesAvailable||traffic.liveRatesAvailable);
    out.downloadBps=number(out.downloadBps||traffic.downloadBps);
    out.uploadBps=number(out.uploadBps||traffic.uploadBps);
    out.traffic={
      ...traffic,
      downloadBps:number(traffic.downloadBps||out.downloadBps),
      uploadBps:number(traffic.uploadBps||out.uploadBps),
      current:{
        ...emptyCurrent(),
        ...current,
        download_bytes:number(current.download_bytes),
        upload_bytes:number(current.upload_bytes)
      },
      history:Array.isArray(traffic.history)?traffic.history:[]
    };
    if(!out.trust||typeof out.trust!=='object')out.trust={active:false,usedThisMonth:false};
    return out;
  }

  api.clients.status=async id=>{
    try{
      const result=await originalStatus(id);
      return normalizeStatus(result,result?.client||null);
    }catch(error){
      const message=String(error?.message||error||'');
      if(!/Cliente não encontrado/i.test(message))throw error;

      let listedClient=null;
      try{
        const rows=await api.clients.list();
        listedClient=(Array.isArray(rows)?rows:[]).find(x=>Number(x?.id)===Number(id))||null;
      }catch{}
      if(!listedClient)throw error;

      return normalizeStatus({
        client:listedClient,
        connectionState:listedClient.connection_type==='PPPoE'?'unavailable':'not_applicable',
        connectionError:'',
        liveRatesAvailable:false
      },listedClient);
    }
  };

  Object.defineProperty(api.clients,'__cloudStatusFixInstalled',{value:true,enumerable:false});
})();
