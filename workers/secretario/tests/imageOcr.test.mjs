import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../src/media.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText
 .replace(/^import .*;$/gm,'')
 .replace(/export /g,'');
const factory=new Function('extractText','recordUsage','estimateNeurons','toBase64',js+';return {analyzeImage,mergeImageAnalysis}');
const recordUsage=async()=>{},estimateNeurons=()=>1,toBase64=()=>'';

test('image analysis combines OCR text with visual interpretation',async()=>{
 const extractText=async()=>({text:'Asunto: Revisión del acuerdo\nNecesitamos respuesta antes del viernes.',how:'ocr'});
 const {analyzeImage}=factory(extractText,recordUsage,estimateNeurons,toBase64);
 const env={AI:{run:async()=>({response:'Es una captura de un correo profesional con una fecha límite.'})}};
 const result=await analyzeImage(env,new ArrayBuffer(4),'correo.png','image/png','Analiza el correo');
 assert.equal(result.ocr,true);assert.equal(result.vision,true);
 assert.match(result.text,/Asunto: Revisión del acuerdo/);
 assert.match(result.text,/captura de un correo profesional/);
});

test('OCR still returns the screenshot when the vision model fails',async()=>{
 const extractText=async()=>({text:'Texto completo recuperado por OCR',how:'ocr'});
 const {analyzeImage}=factory(extractText,recordUsage,estimateNeurons,toBase64);
 const env={AI:{run:async()=>{throw new Error('modelo no disponible')}}};
 const result=await analyzeImage(env,new ArrayBuffer(4),'correo.heic','image/heic','');
 assert.equal(result.ocr,true);assert.equal(result.vision,false);
 assert.equal(result.text,'Texto completo recuperado por OCR');
});

test('vision still interprets the image when OCR conversion fails',async()=>{
 const extractText=async()=>{throw new Error('ocr no disponible')};
 const {analyzeImage}=factory(extractText,recordUsage,estimateNeurons,toBase64);
 const env={AI:{run:async()=>({description:'La imagen muestra una tabla con tres importes.'})}};
 const result=await analyzeImage(env,new ArrayBuffer(4),'captura.jpg','image/jpeg','');
 assert.equal(result.ocr,false);assert.equal(result.vision,true);
 assert.match(result.text,/tabla con tres importes/);
});
