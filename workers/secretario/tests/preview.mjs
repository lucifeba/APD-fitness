import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/dashboard.ts',import.meta.url),'utf8');
const planningSource=readFileSync(new URL('../src/planningUi.ts',import.meta.url),'utf8');
const compilerOptions={module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022};
const planningJs=ts.transpileModule(planningSource,{compilerOptions}).outputText.replace(/export /g,'');
const salesUiSource=readFileSync(new URL('../src/salesUi.ts',import.meta.url),'utf8');
const salesUiJs=ts.transpileModule(salesUiSource,{compilerOptions}).outputText.replace(/export /g,'');
const crmUiSource=readFileSync(new URL('../src/crmUi.ts',import.meta.url),'utf8');
const crmUiJs=ts.transpileModule(crmUiSource,{compilerOptions}).outputText.replace(/export /g,'');
const js=planningJs+'\n'+salesUiJs+'\n'+crmUiJs+'\n'+ts.transpileModule(source,{compilerOptions}).outputText.replace(/^import .*;$/gm,'').replace(/export /g,'');
const {page,appShell}=new Function(js+';return {page,appShell}')();
const html=await page({BRAND_NAME:'Nuvia',BRAND_TAGLINE:'Entorno de prueba'},appShell('info@apdsport.com')).text();
const status={bot:{paired:true,name:'Nuvia'},owner:{email:'demo@example.com',name:'Demo',localTime:'10:00',tz:'Europe/Madrid'},google:{connected:true},chatgpt:{connected:false},openai:{connected:false},usage:{neurons:0,budget:9000,rows:[]},brains:[],knowledge:{count:0,recent:[]},memory:{count:0},tools:[],secrets:[],audit:[],config:{}};
createServer((req,res)=>{
 if(req.url.startsWith('/api/')){res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url==='/api/status'?status:{ok:true,messages:[],instructions:'Instrucciones de demostración'}));return}
 res.setHeader('content-type','text/html');res.end(html);
}).listen(8765,'0.0.0.0',()=>console.log('Preview ready on 8765; synthetic data only'));
