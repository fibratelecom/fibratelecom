import { normalized, text } from './model.js';

const DEFAULT_MAX_DISTANCE_M=300;
const TILE_SIZE=256;
const MIN_ZOOM=3;
const MAX_ZOOM=20;

const finite=(value)=>Number.isFinite(Number(value))?Number(value):null;
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const rad=(value)=>Number(value)*Math.PI/180;
const deg=(value)=>Number(value)*180/Math.PI;

export function networkMapState(state={}){
  const source=state?.network_map&&typeof state.network_map==='object'?state.network_map:{};
  return {
    ...source,
    ctos:Array.isArray(source.ctos)?source.ctos:[],
    segments:Array.isArray(source.segments)?source.segments:[],
    max_distance_m:Math.max(50,Math.min(3000,Math.round(Number(source.max_distance_m)||DEFAULT_MAX_DISTANCE_M)))
  };
}

export function networkCtos(state={}){
  return networkMapState(state).ctos.filter((item)=>item&&text(item.id));
}

export function networkSegments(state={}){
  return networkMapState(state).segments.filter((item)=>item&&text(item.id)&&Array.isArray(item.points)&&item.points.length>=2);
}

export function parsePortList(value){
  const source=Array.isArray(value)?value:String(value??'').split(/[;,\s]+/);
  return [...new Set(source.map((item)=>Math.trunc(Number(item))).filter((item)=>Number.isInteger(item)&&item>0))].sort((a,b)=>a-b);
}

export function servicePoints(clients=[],contracts=[]){
  const primary=(Array.isArray(clients)?clients:[]).map((row)=>({...row,_serviceKey:`client:${Number(row?.id)||0}`,_serviceType:'client',_clientId:Number(row?.id)||0,_clientName:text(row?.name)||`Cliente #${row?.id||'—'}`}));
  const byClient=new Map((Array.isArray(clients)?clients:[]).map((row)=>[Number(row?.id)||0,row]));
  const extra=(Array.isArray(contracts)?contracts:[]).map((row)=>{const owner=byClient.get(Number(row?.client_id)||0)||{};return {...owner,...row,_serviceKey:`contract:${text(row?.id)}`,_serviceType:'contract',_clientId:Number(row?.client_id)||0,_clientName:text(owner?.name)||`Cliente #${row?.client_id||'—'}`,name:text(owner?.name)||text(row?.label)||'Contrato adicional'};});
  return [...primary,...extra].filter((row)=>row._serviceKey&&!row._serviceKey.endsWith(':0'));
}

export function assignmentMap(clients=[],contracts=[]){
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

export function portAvailable(cto={},port,clients=[],contracts=[],currentServiceKey=''){
  const n=Math.trunc(Number(port)||0),summary=ctoPortSummary(cto,clients,contracts,currentServiceKey);
  return n>0&&n<=summary.total&&summary.free.includes(n);
}

export function haversineMeters(a,b){
  const lat1=finite(a?.lat??a?.latitude),lng1=finite(a?.lng??a?.longitude),lat2=finite(b?.lat??b?.latitude),lng2=finite(b?.lng??b?.longitude);
  if([lat1,lng1,lat2,lng2].some((value)=>value===null))return Infinity;
  const dLat=rad(lat2-lat1),dLng=rad(lng2-lng1),s=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLng/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s));
}

function localMeters(point,origin){
  const lat=finite(point?.lat??point?.latitude),lng=finite(point?.lng??point?.longitude),olat=finite(origin?.lat??origin?.latitude),olng=finite(origin?.lng??origin?.longitude);
  if([lat,lng,olat,olng].some((value)=>value===null))return null;
  const y=rad(lat-olat)*6371000,x=rad(lng-olng)*6371000*Math.cos(rad((lat+olat)/2));
  return {x,y};
}

function pointSegmentMeters(point,a,b){
  const p={x:0,y:0},aa=localMeters(a,point),bb=localMeters(b,point);
  if(!aa||!bb)return Infinity;
  const dx=bb.x-aa.x,dy=bb.y-aa.y,len=dx*dx+dy*dy;
  if(!len)return Math.hypot(aa.x,aa.y);
  const t=clamp(((p.x-aa.x)*dx+(p.y-aa.y)*dy)/len,0,1),x=aa.x+t*dx,y=aa.y+t*dy;
  return Math.hypot(x,y);
}

export function distanceToNetworkMeters(point,segments=[]){
  let best=Infinity;
  for(const segment of Array.isArray(segments)?segments:[]){
    const points=Array.isArray(segment?.points)?segment.points:[];
    for(let i=1;i<points.length;i++)best=Math.min(best,pointSegmentMeters(point,points[i-1],points[i]));
  }
  return best;
}

export function findViability({lat,lng,state={},clients=[],contracts=[],currentServiceKey=''}={}){
  const mapState=networkMapState(state),point={lat:Number(lat),lng:Number(lng)},segments=networkSegments(state),items=[];
  for(const cto of mapState.ctos){
    if(cto?.active===false)continue;
    const clat=finite(cto?.latitude),clng=finite(cto?.longitude);
    if(clat===null||clng===null)continue;
    const ports=ctoPortSummary(cto,clients,contracts,currentServiceKey),distance=Math.round(haversineMeters(point,{lat:clat,lng:clng})),networkDistance=segments.length?Math.round(distanceToNetworkMeters(point,segments)):null;
    items.push({cto,distance,networkDistance,ports,withinDistance:distance<=mapState.max_distance_m});
  }
  items.sort((a,b)=>a.distance-b.distance||text(a.cto?.name).localeCompare(text(b.cto?.name),'pt-BR'));
  const within=items.filter((item)=>item.withinDistance),recommendation=within.find((item)=>item.ports.available>0)||null,nearest=items[0]||null,nearestFree=items.find((item)=>item.ports.available>0)||null;
  return {maxDistanceM:mapState.max_distance_m,nearest,recommendation,nearestFree,items};
}

const geocodeCache=new Map();
export async function geocodeAddress(parts={}){
  const query=[text(parts.address||parts.street),text(parts.number||parts.address_number),text(parts.neighborhood),text(parts.city),text(parts.state),text(parts.zip_code||parts.cep),'Brasil'].filter(Boolean).join(', ');
  if(!query)throw new Error('Informe o endereço para localizar no mapa.');
  if(geocodeCache.has(query))return geocodeCache.get(query);
  const url=new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format','jsonv2');url.searchParams.set('limit','1');url.searchParams.set('countrycodes','br');url.searchParams.set('accept-language','pt-BR');url.searchParams.set('q',query);
  const response=await fetch(url,{method:'GET',headers:{Accept:'application/json'},cache:'no-store'});
  if(!response.ok)throw new Error(`Não foi possível localizar o endereço (HTTP ${response.status}).`);
  const rows=await response.json(),row=Array.isArray(rows)?rows[0]:null,lat=finite(row?.lat),lng=finite(row?.lon);
  if(lat===null||lng===null)throw new Error('Endereço não encontrado no mapa. Confira rua, número, cidade e UF.');
  const result={lat,lng,displayName:text(row?.display_name)||query};geocodeCache.set(query,result);return result;
}

export function connectionMapStatus(row={},live=null){
  const blocked=/bloque|suspens/.test(normalized(`${row?.status||''} ${row?.mikrotik_status||''}`));
  if(blocked)return 'blocked';
  const known=normalized(live?.state||row?.connection_last_state||row?.mikrotik_status);
  if(known==='online'||known.includes('online')||known.includes('conectado'))return 'online';
  if(known==='offline'||known.includes('offline'))return 'offline';
  return 'unknown';
}

export function networkOutageAlerts({state={},clients=[],contracts=[],liveByKey=new Map(),routers=[]}={}){
  const ctos=networkCtos(state),points=servicePoints(clients,contracts),alerts=[],ctoAlerts=[];
  for(const cto of ctos){
    const rows=points.filter((row)=>text(row?.cto_id)===text(cto.id)),eligible=rows.filter((row)=>connectionMapStatus(row,liveByKey.get(row._serviceKey))!=='blocked'),monitored=eligible.filter((row)=>connectionMapStatus(row,liveByKey.get(row._serviceKey))!=='unknown'),offline=monitored.filter((row)=>connectionMapStatus(row,liveByKey.get(row._serviceKey))==='offline');
    if(monitored.length>=2&&offline.length>=2&&offline.length/monitored.length>=0.5){
      const ratio=offline.length/monitored.length,alert={type:'cto',level:ratio>=0.8?'critical':'warning',title:`Possível falha na ${text(cto.name)||'CTO'}`,detail:`${offline.length} de ${monitored.length} clientes monitorados estão offline`,cto,offline:offline.length,monitored:monitored.length};alerts.push(alert);ctoAlerts.push(alert);
    }
  }
  const routerMap=new Map((Array.isArray(routers)?routers:[]).map((row)=>[Number(row?.id)||0,row]));
  for(const routerId of [...new Set(points.map((row)=>Number(row?.router_id)||0).filter(Boolean))]){
    const rows=points.filter((row)=>Number(row?.router_id)===routerId),eligible=rows.filter((row)=>connectionMapStatus(row,liveByKey.get(row._serviceKey))!=='blocked'),monitored=eligible.filter((row)=>connectionMapStatus(row,liveByKey.get(row._serviceKey))!=='unknown'),offline=monitored.filter((row)=>connectionMapStatus(row,liveByKey.get(row._serviceKey))==='offline');
    if(monitored.length>=3&&offline.length>=3&&offline.length/monitored.length>=0.6){const router=routerMap.get(routerId)||{};alerts.push({type:'router',level:offline.length/monitored.length>=0.85?'critical':'warning',title:`Possível falha no ${text(router.name)||'MikroTik'}`,detail:`${offline.length} de ${monitored.length} acessos deste roteador estão offline`,router,offline:offline.length,monitored:monitored.length});}
  }
  if(ctoAlerts.length>=2){
    for(let i=0;i<ctoAlerts.length;i++)for(let j=i+1;j<ctoAlerts.length;j++){
      const a=ctoAlerts[i],b=ctoAlerts[j],distance=haversineMeters({lat:a.cto.latitude,lng:a.cto.longitude},{lat:b.cto.latitude,lng:b.cto.longitude});
      if(distance<=1000){alerts.unshift({type:'regional',level:'critical',title:'Possível rompimento regional',detail:`${a.cto.name||'CTO'} e ${b.cto.name||'CTO'} apresentam quedas simultâneas a ${Math.round(distance)} m de distância`,ctos:[a.cto,b.cto]});i=ctoAlerts.length;j=ctoAlerts.length;}
    }
  }
  return alerts;
}

function lngToWorldX(lng,zoom){return (Number(lng)+180)/360*TILE_SIZE*2**zoom;}
function latToWorldY(lat,zoom){const s=Math.sin(rad(clamp(Number(lat),-85.05112878,85.05112878)));return (0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*TILE_SIZE*2**zoom;}
function worldXToLng(x,zoom){return x/(TILE_SIZE*2**zoom)*360-180;}
function worldYToLat(y,zoom){const n=Math.PI-2*Math.PI*y/(TILE_SIZE*2**zoom);return deg(Math.atan(Math.sinh(n)));}

export function createNetworkMap(container,{onMapClick,onMarkerClick}={}){
  if(!(container instanceof HTMLElement))throw new Error('Área do mapa não encontrada.');
  container.innerHTML='<div class="network-map-tiles"></div><svg class="network-map-lines" aria-hidden="true"></svg><div class="network-map-markers"></div><div class="network-map-popup" hidden></div><div class="network-map-attribution">© OpenStreetMap contributors</div>';
  const tiles=container.querySelector('.network-map-tiles'),lines=container.querySelector('.network-map-lines'),markers=container.querySelector('.network-map-markers'),popup=container.querySelector('.network-map-popup');
  const view={lat:-14.235,lng:-51.9253,zoom:5,dragging:false,lastX:0,lastY:0,moved:false,data:{markers:[],segments:[],draft:[]}};

  function size(){return {w:Math.max(1,container.clientWidth),h:Math.max(1,container.clientHeight)};}
  function screenPoint(lat,lng){const {w,h}=size(),cx=lngToWorldX(view.lng,view.zoom),cy=latToWorldY(view.lat,view.zoom);return {x:w/2+(lngToWorldX(lng,view.zoom)-cx),y:h/2+(latToWorldY(lat,view.zoom)-cy)};}
  function latLngFromScreen(x,y){const {w,h}=size(),cx=lngToWorldX(view.lng,view.zoom),cy=latToWorldY(view.lat,view.zoom);return {lat:worldYToLat(cy+y-h/2,view.zoom),lng:worldXToLng(cx+x-w/2,view.zoom)};}
  function renderTiles(){
    const {w,h}=size(),world=TILE_SIZE*2**view.zoom,cx=lngToWorldX(view.lng,view.zoom),cy=latToWorldY(view.lat,view.zoom),left=cx-w/2,top=cy-h/2,minX=Math.floor(left/TILE_SIZE),maxX=Math.floor((left+w)/TILE_SIZE),minY=Math.floor(top/TILE_SIZE),maxY=Math.floor((top+h)/TILE_SIZE),count=2**view.zoom,html=[];
    for(let ty=minY;ty<=maxY;ty++){if(ty<0||ty>=count)continue;for(let tx=minX;tx<=maxX;tx++){const wrap=((tx%count)+count)%count,x=tx*TILE_SIZE-left,y=ty*TILE_SIZE-top;html.push(`<img src="https://tile.openstreetmap.org/${view.zoom}/${wrap}/${ty}.png" alt="" draggable="false" style="transform:translate(${Math.round(x)}px,${Math.round(y)}px)">`);}}
    tiles.innerHTML=html.join('');
  }
  function renderLines(){
    const all=[...(view.data.segments||[]),...(view.data.draft?.length>=2?[{id:'draft',points:view.data.draft,draft:true}]:[])],parts=[];
    for(const segment of all){const pts=(segment.points||[]).map((p)=>screenPoint(p.lat??p.latitude,p.lng??p.longitude)).filter((p)=>Number.isFinite(p.x)&&Number.isFinite(p.y));if(pts.length<2)continue;parts.push(`<polyline class="network-line${segment.draft?' draft':''}" points="${pts.map((p)=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}"></polyline>`);}
    lines.setAttribute('viewBox',`0 0 ${size().w} ${size().h}`);lines.innerHTML=parts.join('');
  }
  function renderMarkers(){
    markers.innerHTML=(view.data.markers||[]).map((m)=>{const p=screenPoint(m.lat,m.lng),hidden=p.x<-80||p.y<-80||p.x>size().w+80||p.y>size().h+80;return `<button type="button" class="map-marker ${m.type||'client'} ${m.status||'unknown'}" data-map-marker="${String(m.id).replace(/"/g,'&quot;')}" style="left:${p.x}px;top:${p.y}px" ${hidden?'hidden':''} aria-label="${String(m.label||'Ponto').replace(/"/g,'&quot;')}">${m.type==='cto'?`<strong>${m.shortLabel||'CTO'}</strong><small>${m.subLabel||''}</small>`:'<span></span>'}</button>`;}).join('');
  }
  function render(){renderTiles();renderLines();renderMarkers();popup.hidden=true;}
  function setView(lat,lng,zoom=view.zoom){if(Number.isFinite(Number(lat)))view.lat=clamp(Number(lat),-85,85);if(Number.isFinite(Number(lng)))view.lng=((Number(lng)+540)%360)-180;view.zoom=clamp(Math.round(Number(zoom)||view.zoom),MIN_ZOOM,MAX_ZOOM);render();}
  function fit(items=[]){const coords=items.filter((p)=>Number.isFinite(Number(p?.lat))&&Number.isFinite(Number(p?.lng)));if(!coords.length){render();return;}const minLat=Math.min(...coords.map((p)=>Number(p.lat))),maxLat=Math.max(...coords.map((p)=>Number(p.lat))),minLng=Math.min(...coords.map((p)=>Number(p.lng))),maxLng=Math.max(...coords.map((p)=>Number(p.lng))),centerLat=(minLat+maxLat)/2,centerLng=(minLng+maxLng)/2,{w,h}=size();let zoom=MAX_ZOOM;for(;zoom>MIN_ZOOM;zoom--){const dx=Math.abs(lngToWorldX(maxLng,zoom)-lngToWorldX(minLng,zoom)),dy=Math.abs(latToWorldY(maxLat,zoom)-latToWorldY(minLat,zoom));if(dx<=w*.75&&dy<=h*.75)break;}setView(centerLat,centerLng,zoom);}
  function showMarker(id){const marker=(view.data.markers||[]).find((item)=>String(item.id)===String(id));if(!marker)return;const p=screenPoint(marker.lat,marker.lng);popup.innerHTML=marker.popupHtml||`<strong>${marker.label||'Ponto'}</strong>`;popup.style.left=`${clamp(p.x,10,size().w-290)}px`;popup.style.top=`${clamp(p.y,10,size().h-180)}px`;popup.hidden=false;onMarkerClick?.(marker,popup);}

  container.addEventListener('pointerdown',(event)=>{if(event.target.closest('.map-marker,.network-map-popup'))return;view.dragging=true;view.lastX=event.clientX;view.lastY=event.clientY;view.moved=false;container.setPointerCapture?.(event.pointerId);});
  container.addEventListener('pointermove',(event)=>{if(!view.dragging)return;const dx=event.clientX-view.lastX,dy=event.clientY-view.lastY;if(Math.abs(dx)+Math.abs(dy)>2)view.moved=true;view.lastX=event.clientX;view.lastY=event.clientY;const cx=lngToWorldX(view.lng,view.zoom)-dx,cy=latToWorldY(view.lat,view.zoom)-dy;view.lng=worldXToLng(cx,view.zoom);view.lat=worldYToLat(cy,view.zoom);render();});
  container.addEventListener('pointerup',(event)=>{const moved=view.moved;view.dragging=false;container.releasePointerCapture?.(event.pointerId);if(!moved&&!event.target.closest('.map-marker,.network-map-popup')){const rect=container.getBoundingClientRect(),point=latLngFromScreen(event.clientX-rect.left,event.clientY-rect.top);onMapClick?.(point,event);}});
  container.addEventListener('wheel',(event)=>{event.preventDefault();const rect=container.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top,before=latLngFromScreen(x,y),next=clamp(view.zoom+(event.deltaY<0?1:-1),MIN_ZOOM,MAX_ZOOM);if(next===view.zoom)return;view.zoom=next;const after=latLngFromScreen(x,y),cx=lngToWorldX(view.lng,view.zoom)+(lngToWorldX(before.lng,view.zoom)-lngToWorldX(after.lng,view.zoom)),cy=latToWorldY(view.lat,view.zoom)+(latToWorldY(before.lat,view.zoom)-latToWorldY(after.lat,view.zoom));view.lng=worldXToLng(cx,view.zoom);view.lat=worldYToLat(cy,view.zoom);render();},{passive:false});
  container.addEventListener('click',(event)=>{const marker=event.target.closest('[data-map-marker]');if(marker)showMarker(marker.dataset.mapMarker);});
  const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>render()):null;observer?.observe(container);

  return {
    setData(data={}){view.data={markers:Array.isArray(data.markers)?data.markers:[],segments:Array.isArray(data.segments)?data.segments:[],draft:Array.isArray(data.draft)?data.draft:[]};render();},
    fit(items){fit(items);},
    setView,
    zoomIn(){setView(view.lat,view.lng,view.zoom+1);},
    zoomOut(){setView(view.lat,view.lng,view.zoom-1);},
    getView(){return {lat:view.lat,lng:view.lng,zoom:view.zoom};},
    destroy(){observer?.disconnect();container.innerHTML='';}
  };
}
