const STATE_KEY='web_state_v1017';
const OVERLAY_KEY='automation_state_v1';
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));

function activeTrust(client){
  const until=String(client?.trust_release_until||'').trim();
  if(!until)return false;
  const date=new Date(until);
  return !Number.isNaN(date.getTime())&&date>Date.now();
}

function applyAutomationOverlay(state,overlay){
  const out=clone(state&&typeof state==='object'?state:{}),ov=overlay&&typeof overlay==='object'?overlay:{};
  if(Array.isArray(out.invoices)&&ov.invoices&&typeof ov.invoices==='object'){
    out.invoices=out.invoices.map(invoice=>{const patch=ov.invoices[String(invoice?.id)];return patch&&typeof patch==='object'?{...invoice,...patch}:invoice});
  }
  if(Array.isArray(out.clients)&&ov.clients&&typeof ov.clients==='object'){
    out.clients=out.clients.map(client=>{
      const patch=ov.clients[String(client?.id)];
      if(!patch||typeof patch!=='object')return client;
      if(patch.automation_reason==='overdue_7d'&&activeTrust(client))return client;
      return {...client,...patch};
    });
  }
  return out;
}

module.exports={STATE_KEY,OVERLAY_KEY,applyAutomationOverlay};
