import {neon} from '@neondatabase/serverless';

const PAYMENT_PRIORITY_KEY='web_state_payment_priority_v1';
const PAYMENT_PRIORITY_TTL_MS=15000;
const PAYMENT_PRIORITY_RENEW_MS=5000;
const text=value=>String(value??'').trim();

async function paymentPriorityActive(env,sqlArg=null){
  if(!env?.DATABASE_URL)return false;
  try{
    const sql=sqlArg||neon(env.DATABASE_URL),rows=await sql`SELECT value FROM pp_settings WHERE key=${PAYMENT_PRIORITY_KEY} LIMIT 1`,expiresAt=text(rows?.[0]?.value?.expires_at);
    return Boolean(expiresAt&&new Date(expiresAt).getTime()>Date.now());
  }catch{return false}
}

async function beginPaymentPriority(env){
  if(!env?.DATABASE_URL)return async()=>{};
  const sql=neon(env.DATABASE_URL);let stopped=false,renewTimer=null;
  const renew=async()=>{
    if(stopped)return;
    try{const expiresAt=new Date(Date.now()+PAYMENT_PRIORITY_TTL_MS).toISOString(),raw=JSON.stringify({expires_at:expiresAt});await sql`INSERT INTO pp_settings (key,value,updated_at) VALUES (${PAYMENT_PRIORITY_KEY},${raw}::jsonb,now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`}catch(error){console.error('Provedor Plus: não foi possível sinalizar prioridade de pagamento.',error)}
    if(!stopped)renewTimer=setTimeout(renew,PAYMENT_PRIORITY_RENEW_MS);
  };
  await renew();
  return async()=>{stopped=true;if(renewTimer)clearTimeout(renewTimer)};
}

export {paymentPriorityActive,beginPaymentPriority};
