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
function pixPaidEvidence(invoice){const method=text(invoice?.payment_method).toLowerCase(),detail=text(invoice?.bank_status_detail).toLowerCase();if(method.includes('cashback')||method.includes('cart'))return false;return method.includes('pix')||detail.includes('pix')}
function brl(cents){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100)}
function cashbackRules(state){const settings=state?.settings||{},mode=text(settings.cashback_mode).toLowerCase()==='fixed'?'fixed':'percent';return {enabled:settings.cashback_enabled===true||text(settings.cashback_enabled).toLowerCase()==='true',mode,rate:Math.max(0,Math.min(100,Number(settings.cashback_rate)||0)),fixedCents:Math.max(0,Math.round(Number(settings.cashback_fixed_cents)||0))}}

async function repairFinancialConsistency(env){
  if(!env?.DATABASE_URL)return false;
  const sql=neon(env.DATABASE_URL),rows=await sql`SELECT value FROM pp_settings WHERE key=${STATE_KEY} LIMIT 1`,state=parseState(rows?.[0]?.value);
  const invoices=Array.isArray(state.invoices)?state.invoices:[],clients=Array.isArray(state.clients)?state.clients:[];
  let transactions=Array.isArray(state.cashback_transactions)?state.cashback_transactions:[],changed=false;
  const now=new Date().toISOString(),rules=cashbackRules(state);

  state.settings={...(state.settings||{})};
  if(Number(state.settings.negotiation_policy_version)!==2){state.settings.negotiation_policy_version=2;changed=true}

  for(const invoice of invoices){
    const invoiceId=String(invoice?.id??''),clientId=Number(invoice?.client_id)||0,discount=Math.max(0,Math.round(Number(invoice?.cashback_discount_applied_cents)||0)),discountStatus=text(invoice?.cashback_discount_status).toLowerCase();
    const matchingDiscounts=transactions.filter(item=>text(item?.source)==='pix_discount'&&String(item?.invoice_id??'')===invoiceId);

    if(discount>0&&discountStatus==='applied'){
      const clientIndex=clients.findIndex(item=>Number(item?.id)===clientId);
      if(matchingDiscounts.length&&clientIndex>=0){
        const current=clients[clientIndex],next=balanceCents(current)+discount;
        clients[clientIndex]={...current,cashback_balance_cents:next,cashback_balance:next/100,cashback_updated_at:now};
        transactions=transactions.filter(item=>!(text(item?.source)==='pix_discount'&&String(item?.invoice_id??'')===invoiceId));
        Object.assign(invoice,{cashback_discount_transaction_id:'',cashback_discount_status:'reserved',cashback_discount_reserved_at:text(invoice?.cashback_discount_applied_at)||now,cashback_discount_migrated_at:now});
        changed=true;
      }
    }else if(discount>0&&discountStatus==='used'&&matchingDiscounts.length>1){
      const linkedId=text(invoice?.cashback_discount_transaction_id),keep=matchingDiscounts.find(item=>linkedId&&text(item?.id)===linkedId)||[...matchingDiscounts].sort((a,b)=>String(b?.created_at||'').localeCompare(String(a?.created_at||'')))[0],keepId=text(keep?.id);
      let kept=false;
      transactions=transactions.filter(item=>{
        const same=text(item?.source)==='pix_discount'&&String(item?.invoice_id??'')===invoiceId;
        if(!same)return true;
        if(!kept&&((keepId&&text(item?.id)===keepId)||(!keepId&&item===keep))){kept=true;return true}
        return false;
      });
      if(keepId&&linkedId!==keepId)invoice.cashback_discount_transaction_id=keepId;
      changed=true;
    }

    if(paidStatus(invoice?.status)&&text(invoice?.paid_at)&&conflictingBankStatus(invoice?.bank_status)){
      const remote=text(invoice?.bank_status);
      if(!text(invoice?.bank_remote_status))invoice.bank_remote_status=remote;
      Object.assign(invoice,{bank_status:'paid',bank_reconciliation_status:'confirmed_by_paid_at',bank_reconciled_at:now});
      changed=true;
    }

    const combinedBase=Math.max(0,Math.round(Number(invoice?.cashback_base_cents)||0)),alreadyCredit=transactions.some(item=>text(item?.source)==='pix_paid'&&String(item?.invoice_id??'')===invoiceId);
    if(invoice?.combined_billing===true&&combinedBase>0&&rules.enabled&&paidStatus(invoice?.status)&&pixPaidEvidence(invoice)&&!invoice?.cashback_credited_at&&!alreadyCredit){
      const clientIndex=clients.findIndex(item=>Number(item?.id)===clientId),paidBase=Math.max(0,combinedBase-Math.min(combinedBase,discount)),credit=rules.mode==='fixed'?rules.fixedCents:Math.max(0,Math.round(paidBase*rules.rate/100));
      if(clientIndex>=0&&credit>0){
        const current=clients[clientIndex],before=balanceCents(current),after=before+credit,transactionId=crypto.randomUUID(),part=Math.max(2,Math.round(Number(invoice?.installment_number)||2)),total=Math.max(part,Math.round(Number(invoice?.installment_total)||part));
        clients[clientIndex]={...current,cashback_balance_cents:after,cashback_balance:after/100,cashback_updated_at:now};
        transactions.push({id:transactionId,client_id:clientId,invoice_id:invoice.id,type:'credit',source:'pix_paid',amount_cents:credit,balance_before_cents:before,balance_after_cents:after,reason:`Cashback do Pix da mensalidade; parcela ${part}/${total} do acordo não participa do cálculo`,created_at:now,payment_at:text(invoice?.paid_at)||now,created_by_name:'Pagamento Pix automático'});
        Object.assign(invoice,{cashback_credited_at:now,cashback_credit_cents:credit,cashback_transaction_id:transactionId,cashback_mode:rules.mode,cashback_rate:rules.mode==='fixed'?rules.fixedCents:rules.rate,cashback_calculation_base_cents:paidBase});
        changed=true;
      }
    }
  }

  if(!changed)return false;
  state.invoices=invoices;state.clients=clients;state.cashback_transactions=transactions.slice(-5000);
  const raw=JSON.stringify(state);
  await sql`UPDATE pp_settings SET value=${raw}::jsonb,updated_at=${now} WHERE key=${STATE_KEY}`;
  return true;
}

function cashbackPortalFromState(state,clientId,current={}){
  const client=(Array.isArray(state?.clients)?state.clients:[]).find(item=>Number(item?.id)===Number(clientId))||{},balance=balanceCents(client),reserved=Math.max(0,Math.round(Number(current?.reservedCents)||0)),statement=(Array.isArray(state?.cashback_transactions)?state.cashback_transactions:[]).filter(item=>Number(item?.client_id)===Number(clientId)).sort((a,b)=>String(b?.created_at||'').localeCompare(String(a?.created_at||''))).slice(0,200).map(item=>({id:text(item?.id),invoiceId:item?.invoice_id??null,type:item?.type==='debit'?'debit':'credit',source:text(item?.source),description:text(item?.reason)||'Movimentação de cashback',amountCents:Math.max(0,Math.round(Number(item?.amount_cents)||0)),balanceAfterCents:Math.max(0,Math.round(Number(item?.balance_after_cents)||0)),createdAt:text(item?.created_at),createdBy:text(item?.created_by_name)}));
  return {...current,balanceCents:balance,balance:balance/100,availableCents:Math.max(0,balance-reserved),available:Math.max(0,balance-reserved)/100,statement,totalCreditsCents:statement.filter(item=>item.type==='credit').reduce((sum,item)=>sum+item.amountCents,0),totalDebitsCents:statement.filter(item=>item.type==='debit').reduce((sum,item)=>sum+item.amountCents,0)};
}

function enhanceInvoiceDto(dto,state){
  if(!dto||typeof dto!=='object')return dto;
  const raw=(Array.isArray(state?.invoices)?state.invoices:[]).find(item=>String(item?.id)===String(dto.id));if(!raw)return dto;
  const part=Math.max(0,Math.round(Number(raw?.installment_number)||0)),total=Math.max(0,Math.round(Number(raw?.installment_total)||0)),monthly=Math.max(0,Math.round(Number(raw?.monthly_amount_cents)||0)),agreement=Math.max(0,Math.round(Number(raw?.negotiation_installment_amount_cents)||0)),combined=raw?.combined_billing===true&&monthly>0&&agreement>0,scheduled=raw?.bank_issue_deferred===true;
  const next={...dto,billingType:text(raw?.billing_type),billingDescription:text(raw?.description),combinedBilling:combined,scheduled,installmentNumber:part||null,installmentTotal:total||null,installmentGroup:text(raw?.installment_group),monthlyAmountCents:monthly,negotiationInstallmentAmountCents:agreement,billingItems:Array.isArray(raw?.billing_items)?raw.billing_items:[]};
  if(combined){
    const rules=cashbackRules(state),discount=Math.max(0,Math.round(Number(raw?.cashback_discount_applied_cents)||0)),paidBase=Math.max(0,monthly-Math.min(monthly,discount)),pending=raw?.cashback_credited_at?0:(rules.mode==='fixed'?rules.fixedCents:Math.max(0,Math.round(paidBase*rules.rate/100)));
    next.serviceName=`Mensalidade ${brl(monthly)} • Parcela ${part}/${total} do acordo ${brl(agreement)}`;
    next.quantity='2 itens';next.unitAmount='Ver composição';next.servicePeriod=text(dto.reference||raw.reference);next.cashbackEnabled=rules.enabled;next.cashbackMode=rules.mode;next.cashbackRate=rules.rate;next.cashbackFixed=rules.fixedCents/100;next.cashbackPending=pending/100;next.cashbackRuleLabel=rules.mode==='fixed'?`${brl(rules.fixedCents)} por Pix`:`${rules.rate}% da mensalidade`;
  }else if(part&&total){next.serviceName=`Parcela ${part}/${total} do acordo`}
  return next;
}

function enhancePortalObject(portal,state){
  if(!portal||typeof portal!=='object')return portal;
  if(portal.invoice)portal.invoice=enhanceInvoiceDto(portal.invoice,state);
  if(Array.isArray(portal.invoices))portal.invoices=portal.invoices.map(item=>enhanceInvoiceDto(item,state));
  const clientId=Number(portal?.client?.id)||0;if(clientId)portal.cashback=cashbackPortalFromState(state,clientId,portal.cashback||{});
  return portal;
}

async function enhancePortalResponse(response,env){
  if(!response?.ok||!env?.DATABASE_URL)return response;
  let body={};try{body=await response.clone().json()}catch{return response}
  if(!body?.ok||!body?.data)return response;
  try{
    const sql=neon(env.DATABASE_URL),rows=await sql`SELECT value FROM pp_settings WHERE key=${STATE_KEY} LIMIT 1`,state=parseState(rows?.[0]?.value),data=body.data;
    if(data?.client||data?.invoices)enhancePortalObject(data,state);
    if(data?.portal)enhancePortalObject(data.portal,state);
    const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=utf-8');headers.set('Cache-Control','no-store, max-age=0');
    return new Response(JSON.stringify(body),{status:response.status,statusText:response.statusText,headers});
  }catch(error){console.error('Provedor Plus: falha ao detalhar cobrança unificada no portal.',error);return response}
}

async function fetchWithFinancialConsistency(request,env,ctx){
  const path=new URL(request.url).pathname,reviewPath=path==='/api/customer-portal'||path==='/api/cloud-state';
  if(!reviewPath||request.method!=='POST')return baseWorker.fetch(request,env,ctx);
  try{await repairFinancialConsistency(env)}catch(error){console.error('Provedor Plus: falha ao revisar consistência financeira antes da ação.',error)}
  let response=await baseWorker.fetch(request,env,ctx);
  if(response?.ok)try{await repairFinancialConsistency(env)}catch(error){console.error('Provedor Plus: falha ao revisar consistência financeira após a ação.',error)}
  if(path==='/api/customer-portal'&&response?.ok)response=await enhancePortalResponse(response,env);
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
