import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as model from '../src/lib/model.ts';
import * as learnings from '../src/lib/learnings.ts';

// Render the real components in memory. This verifies markup, not browser layout.
const compiled = ts.transpileModule(
  readFileSync(new URL('../src/components/LearningsCard.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
});
const require = createRequire(import.meta.url);
const module = { exports: {} };
const componentRequire = (name) => {
  if (name === '../lib/model') return model;
  if (name === '../lib/learnings') return learnings;
  if (name.endsWith('.css')) return {};
  return require(name);
};
new Function('require', 'module', 'exports', compiled.outputText)(componentRequire, module, module.exports);
const { default: LearningsCard, WeekLearningsCard } = module.exports;
const items = [
  { id: 'course', text: 'Ders bilgisi.', tag: 'ss' },
  { id: 'old', text: '<script>alert(1)</script>', tag: 'Kaldırılmış faaliyet' },
  { id: 'general', text: 'Genel bilgi.' },
];
const ui = {
  daily(future = false) {
    return renderToStaticMarkup(createElement(LearningsCard, {
      items, activities: ['Spor'], isFutureDay: future, saving: false, onChange: async () => true,
    }));
  },
  weekly(empty = false) {
    const state = model.initialState();
    if (!empty) state.days[model.today()] = { ...model.blankDay(), learnings: items };
    return renderToStaticMarkup(createElement(WeekLearningsCard, { state, week: model.weekStart(model.today()) }));
  },
};

test('Günlük/haftalık kartlarda ders, kaldırılmış etiket ve etiketsiz maddeler güvenle gösterilir', () => {
  for (const html of [ui.daily(), ui.weekly()]) {
    assert.match(html, /Signals and Systems/);
    assert.match(html, /Kaldırılmış faaliyet/);
    assert.match(html, /Genel bilgi\./);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/);
  }
  const daily = ui.daily();
  assert.match(daily, /Bugün neler öğrendim\?/);
  assert.match(daily, /value="" selected="">Genel/);
  assert.match(daily, /value="ss"/);
  assert.match(daily, /value="Spor"/);
  assert.match(daily, /type="submit"/);
  assert.match(ui.weekly(true), /Bu hafta henüz öğrenme maddesi kaydetmedin/);
});

test('Gelecek günün gerçek kartında bütün girişler ve madde eylemleri kapalıdır', () => {
  const html = ui.daily(true);
  const controls = html.match(/<(?:input|select|button)\b[^>]*>/g);
  assert.equal(controls.length, 9); // text, tag, add, and edit/delete for three items
  for (const control of controls) assert.match(control, /disabled=""/);
  assert.match(html, /Gelecek günlerin öğrenme maddeleri değiştirilemez/);
});
