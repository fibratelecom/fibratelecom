const PAYMENT_PRIORITY_KEY='web_state_payment_priority_v1';
const PAYMENT_PRIORITY_TTL_MS=15000;
const PAYMENT_PRIORITY_RENEW_MS=5000;
const text=value=>String(value??'').trim();

function settingRecord(value){
  if(value&&typeof value==='object'&&!Array.isArray(value))return value;
  if(typeof value==='string')try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{}
  return {};
}

async function paymentPriorityActive(env){
  if(!env?.PROVEDOR_DB)return false;
  try{
    const result=await env.PROVEDOR_DB.prepare('SELECT value FROM pp_settings WHERE key=? LIMIT 1').bind(PAYMENT_PRIORITY_KEY).all(),row=Array.isArray(result?.results)?result.results[0]:null,expiresAt=text(settingRecord(row?.value)?.expires_at);
    return Boolean(expiresAt&&new Date(expiresAt).getTime()>Date.now());
  }catch(error){console.error('Provedor Plus: não foi possível consultar prioridade de pagamento no D1.',error);return false}
}

async function beginPaymentPriority(env){
  if(!env?.PROVEDOR_DB)return async()=>{};
  let stopped=false,renewTimer=null;
  const renew=async()=>{
    if(stopped)return;
    try{
      const expiresAt=new Date(Date.now()+PAYMENT_PRIORITY_TTL_MS).toISOString(),raw=JSON.stringify({expires_at:expiresAt}),updatedAt=new Date().toISOString();
      await env.PROVEDOR_DB.prepare('INSERT INTO pp_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(PAYMENT_PRIORITY_KEY,raw,updatedAt).run();
    }catch(error){console.error('Provedor Plus: não foi possível sinalizar prioridade de pagamento no D1.',error)}
    if(!stopped)renewTimer=setTimeout(renew,PAYMENT_PRIORITY_RENEW_MS);
  };
  await renew();
  return async()=>{stopped=true;if(renewTimer)clearTimeout(renewTimer)};
}

export {paymentPriorityActive,beginPaymentPriority};
