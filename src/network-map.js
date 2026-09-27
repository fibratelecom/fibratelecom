import { text } from './model.js';

const DEFAULT_MAX_DISTANCE_M=300;
const finite=(value)=>Number.isFinite(Number(value))?Number(value):null;
const rad=(value)=>Number(value)*Math.PI/180;

function networkMapState(state={}){
  const source=state?.network_map&&typeof state.network_map==='object'?state.network_map:{};
  return {
    ...source,
    ctos:Array.isArray(source.ctos)?source.ctos:[],
    max_distance_m:Math.max(50,Math.min(3000,Math.round(Number(source.max_distance_m)||DEFAULT_MAX_DISTANCE_M)))
  };
}

export function networkCtos(state={}){
  return networkMapState(state).ctos.filter((item)=>item&&text(item.id));
}

function parsePortList(value){
  const source=Array.isArray(value)?value:String(value??'').split(/[;,\s]+/);
  return [...new Set(source.map((item)=>Math.trunc(Number(item))).filter((item)=>Number.isInteger(item)&&item>0))].sort((a,b)=>a-b);
}

function servicePoints(clients=[],contracts=[]){
  const primary=(Array.isArray(clients)?clients:[]).map((row)=>({...row,_serviceKey:`client:${Number(row?.id)||0}`}));
  const byClient=new Map((Array.isArray(clients)?clients:[]).map((row)=>[Number(row?.id)||0,row]));
  const extra=(Array.isArray(contracts)?contracts:[]).map((row)=>{const owner=byClient.get(Number(row?.client_id)||0)||{};return {...owner,...row,_serviceKey:`contract:${text(row?.id)}`};});
  return [...primary,...extra].filter((row)=>row._serviceKey&&!row._serviceKey.endsWith(':0'));
}

function assignmentMap(clients=[],contracts=[]){
  const map=new Map();
  for(const row of servicePoints(clients,contracts)){
    const ctoId=text(row?.cto_id),port=Math.trunc(Number(row?.cto_port)||0);
    if(!ctoId||!port)continue;
    map.set(`${ctoId}:${port}`,row);
  }
  return map;
}

export function ctoPortSummary(cto={},clients=[],contracts=[],currentServiceKey=''){
  const total=Math.max(1,Math.min(512,Math.trunc(Number(cto?.total_ports)||8))),reserved=new Set(parsePortList(cto?.reserved_ports)),defect=new Set(parsePortList(cto?.defect_ports)),assignments=assignmentMap(clients,contracts),occupied=[],free=[],reservedPorts=[],defectPorts=[];
  for(let port=1;port<=total;port++){
    const assigned=assignments.get(`${text(cto?.id)}:${port}`);
    if(assigned&&assigned._serviceKey!==currentServiceKey){occupied.push(port);continue;}
    if(defect.has(port)){defectPorts.push(port);continue;}
    if(reserved.has(port)){reservedPorts.push(port);continue;}
    free.push(port);
  }
  return {total,occupied,free,reserved:reservedPorts,defect:defectPorts,used:occupied.length,available:free.length};
}

function haversineMeters(a,b){
  const lat1=finite(a?.lat??a?.latitude),lng1=finite(a?.lng??a?.longitude),lat2=finite(b?.lat??b?.latitude),lng2=finite(b?.lng??b?.longitude);
  if([lat1,lng1,lat2,lng2].some((value)=>value===null))return Infinity;
  const dLat=rad(lat2-lat1),dLng=rad(lng2-lng1),s=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLng/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s));
}

export function findViability({lat,lng,state={},clients=[],contracts=[],currentServiceKey=''}={}){
  const mapState=networkMapState(state),point={lat:Number(lat),lng:Number(lng)},items=[];
  for(const cto of mapState.ctos){
    if(cto?.active===false)continue;
    const clat=finite(cto?.latitude),clng=finite(cto?.longitude);
    if(clat===null||clng===null)continue;
    const ports=ctoPortSummary(cto,clients,contracts,currentServiceKey),distance=Math.round(haversineMeters(point,{lat:clat,lng:clng}));
    items.push({cto,distance,networkDistance:null,ports,withinDistance:distance<=mapState.max_distance_m});
  }
  items.sort((a,b)=>a.distance-b.distance||text(a.cto?.name).localeCompare(text(b.cto?.name),'pt-BR'));
  const within=items.filter((item)=>item.withinDistance),recommendation=within.find((item)=>item.ports.available>0)||null,nearest=items[0]||null,nearestFree=items.find((item)=>item.ports.available>0)||null;
  return {maxDistanceM:mapState.max_distance_m,nearest,recommendation,nearestFree,items};
}

const geocodeCache=new Map();
export async function geocodeAddress(parts={}){
  const query=[text(parts.address||parts.street),text(parts.number||parts.address_number),text(parts.neighborhood),text(parts.city),text(parts.state),text(parts.zip_code||parts.cep),'Brasil'].filter(Boolean).join(', ');
  if(!query)throw new Error('Informe o endereço para localizar.');
  if(geocodeCache.has(query))return geocodeCache.get(query);
  const url=new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format','jsonv2');url.searchParams.set('limit','1');url.searchParams.set('countrycodes','br');url.searchParams.set('accept-language','pt-BR');url.searchParams.set('q',query);
  const response=await fetch(url,{method:'GET',headers:{Accept:'application/json'},cache:'no-store'});
  if(!response.ok)throw new Error(`Não foi possível localizar o endereço (HTTP ${response.status}).`);
  const rows=await response.json(),row=Array.isArray(rows)?rows[0]:null,lat=finite(row?.lat),lng=finite(row?.lon);
  if(lat===null||lng===null)throw new Error('Endereço não encontrado. Confira rua, número, cidade e UF.');
  const result={lat,lng,displayName:text(row?.display_name)||query};geocodeCache.set(query,result);return result;
}
