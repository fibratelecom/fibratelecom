import {neon} from '@neondatabase/serverless';

const STATE_WRITE_LOCK_KEY='web_state_write_lock_v1';
const STATE_WRITE_LOCK_TTL_MS=60000;
const PAYMENT_PRIORITY_KEY='web_state_payment_priority_v1';
const PAYMENT_PRIORITY_TTL_MS=15000;
const PAYMENT_PRIORITY_RENEW_MS=5000;
const text=value=>String(value??'').trim();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function acquireStateWriteLock(env,maxWaitMs=20000){
  if(!env?.DATABASE_URL)return null;
  const totalWaitMs=Math.max(1000,Number(maxWaitMs)||20000),sql=neon(env.DATABASE_URL),token=crypto.randomUUID(),deadline=Date.now()+totalWaitMs;
  while(Date.now()<deadline){
    const expiresAt=new Date(Date.now()+STATE_WRITE_LOCK_TTL_MS).toISOString(),raw=JSON.stringify({token,expires_at:expiresAt});
    const rows=await sql`INSERT INTO pp_settings (key,value,updated_at) VALUES (${STATE_WRITE_LOCK_KEY},${raw}::jsonb,now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at WHERE COALESCE(NULLIF(pp_settings.value->>'expires_at','')::timestamptz,to_timestamp(0))<=now() RETURNING value`;
    if(text(rows?.[0]?.value?.token)===token){
      let stopped=false,renewTimer=null;
      const renew=async()=>{
        if(stopped)return;
        try{const nextExpiry=new Date(Date.now()+STATE_WRITE_LOCK_TTL_MS).toISOString(),nextRaw=JSON.stringify({token,expires_at:nextExpiry});await sql`UPDATE pp_settings SET value=${nextRaw}::jsonb,updated_at=now() WHERE key=${STATE_WRITE_LOCK_KEY} AND value->>'token'=${token}`}catch(error){console.error('Provedor Plus: não foi possível renovar a trava de estado.',error)}
        if(!stopped)renewTimer=setTimeout(renew,20000);
      };
      renewTimer=setTimeout(renew,20000);
      return async()=>{stopped=true;if(renewTimer)clearTimeout(renewTimer);try{await sql`DELETE FROM pp_settings WHERE key=${STATE_WRITE_LOCK_KEY} AND value->>'token'=${token}`}catch(error){console.error('Provedor Plus: não foi possível liberar a trava de estado.',error)}};
    }
    const remaining=deadline-Date.now();
    if(remaining>0)await wait(Math.min(250,remaining));
  }
  throw Object.assign(new Error('O Provedor Plus está concluindo outra atualização de dados. Tente novamente em alguns segundos.'),{statusCode:409});
}

async function withStateWriteLock(env,fn,maxWaitMs=20000){
  const release=await acquireStateWriteLock(env,maxWaitMs);
  try{return await fn()}finally{if(release)await release()}
}

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

async function tryBackgroundStateLock(env,fn,label='Provedor Plus: rotina de fundo adiou a gravação de estado.'){
  if(await paymentPriorityActive(env))return null;
  try{
    return await withStateWriteLock(env,async()=>{
      if(await paymentPriorityActive(env))return null;
      return fn();
    },1000);
  }catch(error){
    if(Number(error?.statusCode)===409)return null;
    console.error(label,error);
    return null;
  }
}

export {acquireStateWriteLock,withStateWriteLock,paymentPriorityActive,beginPaymentPriority,tryBackgroundStateLock};
