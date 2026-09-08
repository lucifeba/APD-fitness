export const SALES_UI_JS = String.raw`
let salesClientOptions=[];
function salesSearchKey(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').replace(/\s+/g,' ').trim()}
function visualChart(rows,label,value,format=money,forced){
  const type=forced||$('#sales-chart').value,items=rows.map(x=>({label:String(label(x)),value:Number(value(x)||0)}));
  if(!items.length)return'<p class="muted">Sin datos.</p>';
  if(type==='bar')return bars(rows,label,value,format);
  if(type==='donut'){const total=items.reduce((n,x)=>n+Math.max(0,x.value),0)||1,c=2*Math.PI*72;let offset=0;const circles=items.map((x,i)=>{const part=Math.max(0,x.value)/total*c,tag='<circle cx="110" cy="110" r="72" fill="none" stroke="'+chartColors[i%chartColors.length]+'" stroke-width="34" stroke-dasharray="'+part+' '+(c-part)+'" stroke-dashoffset="'+(-offset)+'" transform="rotate(-90 110 110)"/>';offset+=part;return tag}).join('');return'<div class="donut-layout"><svg class="chart-svg" viewBox="0 0 220 220" role="img">'+circles+'<text x="110" y="107" fill="currentColor" text-anchor="middle" font-size="14">Total</text><text x="110" y="130" fill="currentColor" text-anchor="middle" font-size="20">'+format(total)+'</text></svg><div class="chart-legend">'+items.map((x,i)=>'<span><i class="legend-dot" style="background:'+chartColors[i%chartColors.length]+'"></i>'+esc(x.label)+' · '+format(x.value)+'</span>').join('')+'</div></div>'}
  const max=Math.max(...items.map(x=>x.value),1),min=Math.min(...items.map(x=>x.value),0),span=max-min||1,points=items.map((x,i)=>({x:items.length===1?320:48+i*(544/(items.length-1)),y:176-(x.value-min)/span*124,...x})),line=points.map(p=>p.x+','+p.y).join(' '),area='48,176 '+line+' 592,176';
  return'<svg class="chart-svg quarter-line-chart" viewBox="0 0 640 230" role="img" aria-label="Evolución por trimestres"><defs><linearGradient id="aravitas-line-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5DD3F0" stop-opacity=".34"/><stop offset="100%" stop-color="#5DD3F0" stop-opacity="0"/></linearGradient></defs><line x1="48" y1="52" x2="592" y2="52" stroke="#2A3150" stroke-dasharray="4 5"/><line x1="48" y1="114" x2="592" y2="114" stroke="#2A3150" stroke-dasharray="4 5"/><line x1="48" y1="176" x2="592" y2="176" stroke="#2A3150"/><polygon points="'+area+'" fill="url(#aravitas-line-area)"/><polyline points="'+line+'" fill="none" stroke="#5DD3F0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'+points.map((p,i)=>'<circle cx="'+p.x+'" cy="'+p.y+'" r="6" fill="#171c31" stroke="'+chartColors[i%chartColors.length]+'" stroke-width="4"/><text x="'+p.x+'" y="'+Math.max(20,p.y-14)+'" fill="currentColor" text-anchor="middle" font-size="11" font-weight="600">'+esc(format(p.value))+'</text><text x="'+p.x+'" y="207" fill="#9AA3BF" text-anchor="middle" font-size="11">'+esc(p.label.slice(0,16))+'</text>').join('')+'</svg>'
}
function enhanceSalesDashboardFilters(){
  const select=$('#sales-client');
  if(!select||$('#sales-client-search'))return;
  select.hidden=true;
  const search=document.createElement('input');
  search.id='sales-client-search';search.type='search';search.autocomplete='off';search.placeholder='Escribe farmacia, VDL, clasificación o delegado…';
  search.setAttribute('aria-label','Buscar farmacia');search.setAttribute('aria-controls','sales-client-results');search.setAttribute('aria-expanded','false');
  search.oninput=showSalesClientMatches;search.onfocus=showSalesClientMatches;search.onkeydown=salesClientKeydown;search.onblur=()=>setTimeout(closeSalesClientMatches,180);
  const results=document.createElement('div');results.id='sales-client-results';results.className='client-search-results';results.hidden=true;results.setAttribute('role','listbox');
  select.insertAdjacentElement('afterend',search);search.insertAdjacentElement('afterend',results);
  const chart=$('#sales-chart');
  if(chart){chart.replaceChildren(new Option('Líneas · evolución','line'),new Option('Barras · comparación','bar'),new Option('Sectores · distribución','donut'));chart.value=localStorage.getItem('aravitas-sales-chart')||'line';chart.addEventListener('change',()=>localStorage.setItem('aravitas-sales-chart',chart.value));}
  document.head.insertAdjacentHTML('beforeend','<style>.client-search-results{position:absolute;z-index:60;left:0;right:0;top:100%;max-height:320px;overflow:auto;margin-top:5px;padding:6px;border:1px solid var(--line);border-radius:12px;background:#171c31;box-shadow:0 18px 45px rgba(0,0,0,.4)}.client-search-results button{display:grid;width:100%;gap:2px;padding:10px 11px;border:0;border-radius:8px;background:transparent;color:var(--text);text-align:left;cursor:pointer}.client-search-results button:hover,.client-search-results button:focus{background:var(--surface);outline:none}.client-search-results small{color:var(--muted)}#sales-client-search{padding-right:38px}label:has(>#sales-client){position:relative}.sales-search-empty{padding:12px;color:var(--muted);font-size:13px}</style>');
}
function matchingSalesClients(query){const terms=salesSearchKey(query).split(' ').filter(Boolean);if(!terms.length)return[];return salesClientOptions.filter(item=>{const haystack=salesSearchKey([item.client,item.vdl,item.classification,item.delegate].join(' '));return terms.every(term=>haystack.includes(term))}).slice(0,18)}
function showSalesClientMatches(){const input=$('#sales-client-search'),host=$('#sales-client-results');if(!input||!host)return;const matches=matchingSalesClients(input.value);host.replaceChildren();if(!input.value.trim()){host.hidden=true;input.setAttribute('aria-expanded','false');return}if(!matches.length){const empty=document.createElement('div');empty.className='sales-search-empty';empty.textContent='No hay coincidencias con estos criterios.';host.append(empty)}else matches.forEach(item=>{const button=document.createElement('button');button.type='button';button.setAttribute('role','option');const name=document.createElement('b');name.textContent=item.client;const detail=document.createElement('small');detail.textContent=[item.classification,'VDL '+item.vdl,delegateName(item.delegate)].filter(Boolean).join(' · ');button.append(name,detail);button.onmousedown=event=>event.preventDefault();button.onclick=()=>selectSalesClient(item);host.append(button)});host.hidden=false;input.setAttribute('aria-expanded','true')}
function closeSalesClientMatches(){const host=$('#sales-client-results'),input=$('#sales-client-search');if(host)host.hidden=true;if(input)input.setAttribute('aria-expanded','false')}
function salesClientKeydown(event){if(event.key!=='Enter')return;event.preventDefault();const matches=matchingSalesClients(event.currentTarget.value);if(matches.length)selectSalesClient(matches[0]);else $('#sales-status').textContent='No encuentro una farmacia que coincida. Prueba con parte del nombre, el VDL, la clasificación o el delegado.'}
function selectSalesClient(item){$('#sales-client').value=item.vdl;$('#sales-client-search').value=item.client;closeSalesClientMatches();loadSalesDashboard()}
function syncSalesFilters(j){
  enhanceSalesDashboardFilters();
  fillSelect($('#sales-snapshot'),j.imports,x=>x.id,x=>x.source_date+' · '+x.source_name,'Último disponible');$('#sales-snapshot').value=j.latest.id;
  fillSelect($('#sales-delegate'),j.delegates,x=>x.cod_del,x=>delegateName(x.delegate),'Todo el equipo');$('#sales-delegate').value=j.selectedDelegate;
  salesClientOptions=(j.clientOptions||[]).map(item=>({...item,delegate:(j.delegates.find(d=>d.cod_del===item.cod_del)||{}).delegate||''}));
  fillSelect($('#sales-client'),salesClientOptions,x=>x.vdl,x=>x.client+' · '+x.classification,'Todas las farmacias');$('#sales-client').value=j.selectedClient;
  const selected=salesClientOptions.find(x=>x.vdl===j.selectedClient),search=$('#sales-client-search');if(search)search.value=selected?selected.client:'';
  const list=$('#molecule-list');list.replaceChildren(...j.molecules.map(x=>Object.assign(document.createElement('option'),{value:x})));
  const q=new Map();for(const d of j.delegateDetails)for(const point of d.quarters)q.set(point.quarter,point.quarter);fillSelect($('#sales-quarter'),[...q.values()],x=>x,x=>x,'Último disponible');
}
function salesDelegateChanged(){$('#sales-client').value='';const search=$('#sales-client-search');if(search)search.value='';closeSalesClientMatches();loadSalesDashboard()}
function clearSalesFilters(){$('#sales-delegate').value='';$('#sales-client').value='';const search=$('#sales-client-search');if(search)search.value='';$('#sales-quarter').value='';$('#sales-molecule').value='';$('#sales-product-search').value='';closeSalesClientMatches();loadSalesDashboard()}
enhanceSalesDashboardFilters();
`;
