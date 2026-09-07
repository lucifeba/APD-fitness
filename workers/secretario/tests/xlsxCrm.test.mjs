import test from 'node:test';
import assert from 'node:assert/strict';
import {strToU8,unzipSync,zipSync} from 'fflate';
import {patchSheet,readSheet} from '../src/xlsxCrm.ts';
const shared=`<x:sst xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:si><x:t>ID</x:t></x:si><x:si><x:t>Fecha</x:t></x:si><x:si><x:t>Delegado</x:t></x:si><x:si><x:t>Cliente</x:t></x:si></x:sst>`;
const wb=`<x:workbook><x:sheets><x:sheet name="VISITAS" r:id="r1"/></x:sheets></x:workbook>`;
const rel=`<Relationships><Relationship Target="/xl/worksheets/sheet1.xml" Id="r1"/></Relationships>`;
const sheet=`<x:worksheet><x:sheetData><x:row r="5"><x:c r="A5" t="s"><x:v>0</x:v></x:c><x:c r="B5" t="s"><x:v>1</x:v></x:c><x:c r="C5" t="s"><x:v>2</x:v></x:c><x:c r="D5" t="s"><x:v>3</x:v></x:c></x:row><x:row r="6"><x:c r="A6" s="7"/><x:c r="B6" s="8"/><x:c r="C6" s="9"/><x:c r="D6" s="9"/></x:row></x:sheetData><custom>preservar</custom></x:worksheet>`;
const bytes=zipSync({'xl/sharedStrings.xml':strToU8(shared),'xl/workbook.xml':strToU8(wb),'xl/_rels/workbook.xml.rels':strToU8(rel),'xl/worksheets/sheet1.xml':strToU8(sheet),'custom.bin':new Uint8Array([1,2,3])});
test('patches only CRM cells and preserves unrelated workbook files',()=>{
 const out=patchSheet(bytes,'VISITAS',[{row:6,values:{ID:'WEB-1',Fecha:'2026-09-08',Delegado:'Ara & equipo',Cliente:'Farmacia <Centro>'}}]);
 const parsed=readSheet(out,'VISITAS');assert.equal(parsed.data[0].values.Cliente,'Farmacia <Centro>');assert.equal(parsed.data[0].values.Fecha,'46273');
 assert.deepEqual([...unzipSync(out)['custom.bin']],[1,2,3]);
});
