import baseWorker from './negotiation-worker.js';
import {handleStoriesRequest,isStoriesPath} from './stories-worker.js';
import {handleStoryReactionsRequest,isStoryReactionsPath} from './story-reactions-worker.js';
import {neon} from '@neondatabase/serverless';

const STATE_KEY='web_state_v1017';
const text=value=>String(value??'').trim();
function parseState(value){if(value&&typeof value==='object'&&!Array.isArray(value))return value;if(typeof value==='string')try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{}return {}}
function balanceCents(client){const direct=Number(client?.cashback_balance_cents);if(Number.isFinite(direct))return Math.max(0,Math.round(direct));const amount=Number(client?.cashback_balance);return Number.isFinite(amount)?Math.max(0,Math.round(amount*100)):0}
function paidStatus(value){const status=text(value).toLowerCase();return ['pago','paid','baixado','recebido','quitado'].some(item=>status.includes(item))}
function conflictingBankStatus(value){const status=text(value).toLowerCase();return ['canceled','cancelled','cancelado','rejected','recusado','expired','expirado','removido','removida'].some(item=>status.includes(item))}

async function repairFinancialConsistency(env){
  if(!env?.DATABASE_URL)return false;
  const sql=neon(env.DATABASE_URL),rows=await sql`SELECT value FROM pp_settings WHERE key=${STATE_KEY} LIMIT 1`,state=parseState(rows?.[0]?.value);
  const invoices=Array.isArray(state.invoices)?state.invoices:[],clients=Array.isArray(state.clients)?state.clients:[];
  let transactions=Array.isArray(state.cashback_transactions)?state.cashback_transactions:[],changed=false;
  const now=new Date().toISOString();

  for(const invoice of invoices){
    const invoiceId=String(invoice?.id??''),clientId=Number(invoice?.client_id)||0,discount=Math.max(0,Math.round(Number(invoice?.cashback_discount_applied_cents)||0));
    if(discount>0&&text(invoice?.cashback_discount_status).toLowerCase()==='applied'){
      const legacy=transactions.filter(item=>text(item?.source)==='pix_discount'&&String(item?.invoice_id??'')===invoiceId);
      const clientIndex=clients.findIndex(item=>Number(item?.id)===clientId);
      if(legacy.length&&clientIndex>=0){
        const current=clients[clientIndex],next=balanceCents(current)+discount;
        clients[clientIndex]={...current,cashback_balance_cents:next,cashback_balance:next/100,cashback_updated_at:now};
        transactions=transactions.filter(item=>!(text(item?.source)==='pix_discount'&&String(item?.invoice_id??'')===invoiceId));
        Object.assign(invoice,{cashback_discount_transaction_id:'',cashback_discount_status:'reserved',cashback_discount_reserved_at:text(invoice?.cashback_discount_applied_at)||now,cashback_discount_migrated_at:now});
        changed=true;
      }
    }

    if(paidStatus(invoice?.status)&&text(invoice?.paid_at)&&conflictingBankStatus(invoice?.bank_status)){
      const remote=text(invoice?.bank_status);
      if(!text(invoice?.bank_remote_status))invoice.bank_remote_status=remote;
      Object.assign(invoice,{bank_status:'paid',bank_reconciliation_status:'confirmed_by_paid_at',bank_reconciled_at:now});
      changed=true;
    }
  }

  if(!changed)return false;
  state.invoices=invoices;state.clients=clients;state.cashback_transactions=transactions;
  const raw=JSON.stringify(state);
  await sql`UPDATE pp_settings SET value=${raw}::jsonb,updated_at=${now} WHERE key=${STATE_KEY}`;
  return true;
}

async function fetchWithFinancialConsistency(request,env,ctx){
  const path=new URL(request.url).pathname;
  if(path!== '/api/customer-portal'||request.method!=='POST')return baseWorker.fetch(request,env,ctx);
  try{await repairFinancialConsistency(env)}catch(error){console.error('Provedor Plus: falha ao revisar consistência financeira antes da ação.',error)}
  const response=await baseWorker.fetch(request,env,ctx);
  if(response?.ok)try{await repairFinancialConsistency(env)}catch(error){console.error('Provedor Plus: falha ao revisar consistência financeira após a ação.',error)}
  return response;
}

export default {
  fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    if(isStoryReactionsPath(path))return handleStoryReactionsRequest(request,env);
    if(isStoriesPath(path))return handleStoriesRequest(request,env);
    return fetchWithFinancialConsistency(request,env,ctx);
  },
  scheduled(controller,env,ctx){return baseWorker.scheduled(controller,env,ctx)}
};
