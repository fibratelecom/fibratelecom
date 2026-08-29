const STATE_KEY='web_state_v1017';
const OVERLAY_KEY='automation_state_v1';
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));

function applyAutomationOverlay(state,overlay){
  const out=clone(state&&typeof state==='object'?state:{}),ov=overlay&&typeof overlay==='object'?overlay:{};
  if(Array.isArray(out.invoices)&&ov.invoices&&typeof ov.invoices==='object'){
    out.invoices=out.invoices.map(invoice=>{const patch=ov.invoices[String(invoice?.id)];return patch&&typeof patch==='object'?{...invoice,...patch}:invoice});
  }
  if(Array.isArray(out.clients)&&ov.clients&&typeof ov.clients==='object'){
    out.clients=out.clients.map(client=>{const patch=ov.clients[String(client?.id)];return patch&&typeof patch==='object'?{...client,...patch}:client});
  }
  return out;
}

module.exports={STATE_KEY,OVERLAY_KEY,applyAutomationOverlay};
