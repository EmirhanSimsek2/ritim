import test from 'node:test';
import assert from 'node:assert/strict';
import {importChunks} from '../src/lib/import-chunks.ts';
test('Uzun günlükler UTF-8 boyutuna göre bölünür; kayıt sırası ve 20 kayıt sınırı korunur',()=>{const records=Array.from({length:45},(_,i)=>({i,text:'ş'.repeat(7000)})),batches=importChunks(records);assert.deepEqual(batches.flat(),records);for(const batch of batches){assert.ok(batch.length<=20);assert.ok(new TextEncoder().encode(JSON.stringify(batch)).byteLength<=220000);}assert.deepEqual(importChunks([]),[]);assert.equal(importChunks(Array.from({length:21},(_,i)=>({i}))).length,2);});
test('Tek başına aşırı büyük günlük aktarım başlamadan reddedilir',()=>{assert.throws(()=>importChunks([{text:'a'.repeat(220000)}]));});
