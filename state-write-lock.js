import {neon} from '@neondatabase/serverless';

const PAYMENT_PRIORITY_KEY='web_state_payment_priority_v1';
const PAYMENT_PRIORITY_TTL_MS=15000;
const PAYMENT_PRIORITY_RENEW_MS=5000;
const text=value=>String(value??'').trim();

function settingRecord(value){
  if(value&&typeof value==='object'&&!Array.isArray(value))return value;
  if(typeof value==='string')try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{}
  return {};
}

async function paymentPriorityActive(env,sqlArg=null){
  if(env?.PROVEDOR_DB){
    try{
      const result=await env.PROVEDOR_DB.prepare('SELECT value FROM pp_settings WHERE key=? LIMIT 1').bind(PAYMENT_PRIORITY_KEY).all(),row=Array.isArray(result?.results)?result.results[0]:null,expiresAt=text(settingRecord(row?.value)?.expires_at);
      return Boolean(expiresAt&&new Date(expiresAt).getTime()>Date.now());
    }catch(error){console.error('Provedor Plus: não foi possível consultar prioridade de pagamento no D1.',error)}
  }
  if(!env?.DATABASE_URL)return false;
  try{
    const sql=sqlArg||neon(env.DATABASE_URL),rows=await sql`SELECT value FROM pp_settings WHERE key=${PAYMENT_PRIORITY_KEY} LIMIT 1`,expiresAt=text(rows?.[0]?.value?.expires_at);
    return Boolean(expiresAt&&new Date(expiresAt).getTime()>Date.now());
  }catch{return false}
}

async function beginPaymentPriority(env){
  if(!env?.PROVEDOR_DB&&!env?.DATABASE_URL)return async()=>{};
  const sql=!env?.PROVEDOR_DB&&env?.DATABASE_URL?neon(env.DATABASE_URL):null;let stopped=false,renewTimer=null;
  const renew=async()=>{
    if(stopped)return;
    try{
      const expiresAt=new Date(Date.now()+PAYMENT_PRIORITY_TTL_MS).toISOString(),raw=JSON.stringify({expires_at:expiresAt}),updatedAt=new Date().toISOString();
      if(env?.PROVEDOR_DB)await env.PROVEDOR_DB.prepare('INSERT INTO pp_settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(PAYMENT_PRIORITY_KEY,raw,updatedAt).run();
      else await sql`INSERT INTO pp_settings (key,value,updated_at) VALUES (${PAYMENT_PRIORITY_KEY},${raw}::jsonb,now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`;
    }catch(error){console.error('Provedor Plus: não foi possível sinalizar prioridade de pagamento.',error)}
    if(!stopped)renewTimer=setTimeout(renew,PAYMENT_PRIORITY_RENEW_MS);
  };
  await renew();
  return async()=>{stopped=true;if(renewTimer)clearTimeout(renewTimer)};
}

export {paymentPriorityActive,beginPaymentPriority};
