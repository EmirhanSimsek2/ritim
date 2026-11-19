import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../src/lib/model.ts';
import {examSortDate, sortExams} from '../src/lib/exams.ts';

const exam = (id, course, label, start='', end='', note='') => ({id,course,label,start,end,note,source:''});

test('Syllabus weeks sort before later finals without inventing exact exam dates', () => {
  const exams=initialState().exams;
  const sorted=sortExams(exams);
  assert.equal(examSortDate(exams.find(e=>e.id==='eng-mid')), '2026-11-23');
  assert.equal(examSortDate(exams.find(e=>e.id==='la-mid')), '2026-11-23');
  for(const id of ['eng-mid','la-mid']) assert.ok(sorted.findIndex(e=>e.id===id)<sorted.findIndex(e=>e.id==='de-final'));
  assert.equal(exams.find(e=>e.id==='eng-mid').start, '');
  assert.deepEqual(sortExams(exams.filter(e=>!e.start||(e.end||e.start)>='2026-11-12')).slice(0,3).map(e=>e.id), ['de-mid','eng-mid','la-mid']);
});

test('Exact dates, range starts, academic weeks, alphabetical ties and unknown dates', () => {
  const input=[exam('unknown','de','Tarih bekleniyor'),exam('week','de','Final · 15. hafta'),exam('range','la','Vize','2026-11-23','2026-11-27'),exam('exact','eng','Vize','2026-11-23'),exam('note','ss','Proje','','','14. hafta'),exam('invalid','ss','99. hafta')];
  assert.deepEqual(sortExams(input).map(e=>e.id), ['exact','range','note','week','unknown','invalid']);
  assert.equal(examSortDate(input[4]), '2026-12-28');
  assert.equal(examSortDate(input[5]), null);
  assert.equal(input[0].id,'unknown');
  assert.equal(examSortDate(exam('override','eng','9. hafta','2026-12-01')), '2026-12-01');
});
