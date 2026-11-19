import { useState } from 'react';
import { COURSES, today, type TrackerState, type Entry } from '../lib/model';
import { METHODS, LEARNING } from '../lib/study';
import { Field, Score } from './FormFields';

export default function EntryForm({
  state,
  entry,
  date,
  saving,
  submit,
  planTitle,
}: {
  state: TrackerState;
  entry?: Entry;
  date: string;
  saving: boolean;
  submit: (form: HTMLFormElement) => void;
  planTitle?: string;
}) {
  const [kind, setKind] = useState<'study' | 'activity'>(
    entry?.kind ?? 'study',
  );
  const [unknownDuration, setUnknownDuration] = useState(
      entry?.seconds === null,
    ),
    [minutes, setMinutes] = useState(
      entry?.seconds == null
        ? ''
        : String(Math.round((entry.seconds / 60) * 100) / 100),
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
    >
      <div className="form-grid">
        <Field label="Kayıt türü">
          <select
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as 'study' | 'activity')}
          >
            <option value="study">Ders çalışma</option>
            <option value="activity">Ders dışı faaliyet</option>
          </select>
        </Field>
        <Field label="Tarih">
          <input
            type="date"
            name="date"
            required
            max={today()}
            defaultValue={entry?.date ?? date}
          />
        </Field>
      </div>
      <div className="form-grid">
        <Field label={kind === 'study' ? 'Ders' : 'Faaliyet'}>
          <select
            name="subject"
            key={kind}
            defaultValue={
              entry?.kind === kind
                ? entry.subject
                : kind === 'study'
                  ? 'de'
                  : state.activities[0]
            }
          >
            {kind === 'study'
              ? COURSES.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))
              : Array.from(
                  new Set([
                    ...state.activities,
                    ...(entry?.kind === 'activity' ? [entry.subject] : []),
                  ]),
                ).map((a) => <option key={a}>{a}</option>)}
          </select>
        </Field>
        {kind === 'activity' && (
          <Field label="Süre bilgisi">
            <select
              name="durationMode"
              value={unknownDuration ? 'unknown' : 'known'}
              onChange={(e) => setUnknownDuration(e.target.value === 'unknown')}
            >
              <option value="known">Süre ekle</option>
              <option value="unknown">Süresiz kaydet</option>
            </select>
          </Field>
        )}
        {(kind === 'study' || !unknownDuration) && (
          <Field label="Süre · dakika">
            <input
              type="number"
              name="minutes"
              required
              min="0.02"
              max="1440"
              step="0.01"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="Örn. 45"
            />
          </Field>
        )}
      </div>
      {kind === 'activity' && unknownDuration && (
        <p className="helper">
          Yaptığın faaliyet kaydedilir. Süresi bilinmediği için zaman
          toplamlarına eklenmez; daha sonra süre ekleyebilirsin.
        </p>
      )}
      <Field label={kind === 'study' ? 'Konu / oturum hedefi' : 'Ne yaptın?'}>
        <input
          name="topic"
          defaultValue={entry?.topic ?? ''}
          maxLength={500}
          placeholder={
            kind === 'study'
              ? 'Örn. Newton–Raphson alıştırmaları'
              : 'İstersen kısa bir açıklama ekle'
          }
        />
      </Field>
      {kind === 'study' && (
        <>
          <Field label="Çalışma biçimi">
            <select name="method" defaultValue={entry?.method || METHODS[0]}>
              {METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
          <details
            className="learning-details"
            open={
              !!entry?.learning ||
              (entry?.focus !== undefined && entry.focus !== null)
            }
          >
            <summary>
              Öğrenme & odak <span>isteğe bağlı</span>
            </summary>
            <div className="form-grid">
              <Score
                name="focus"
                label="Ne kadar odaklanabildin?"
                value={entry?.focus ?? null}
              />
              <Field label="Çalışmanın sonunda">
                <select name="learning" defaultValue={entry?.learning ?? ''}>
                  <option value="">Henüz değerlendirmedim</option>
                  {Object.entries(LEARNING).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Ne öğrendin veya tamamladın?">
              <textarea
                name="result"
                rows={2}
                maxLength={2000}
                defaultValue={entry?.result ?? ''}
                placeholder="Örn. 3 soruyu notlara bakmadan çözdüm"
              />
            </Field>
            <div className="form-grid">
              <Field label="Denediğin soru">
                <input
                  name="attempted"
                  type="number"
                  step="1"
                  min="0"
                  max="100000"
                  defaultValue={entry?.attempted ?? ''}
                />
              </Field>
              <Field label="Yardımsız doğru çözdüğün">
                <input
                  name="correct"
                  type="number"
                  step="1"
                  min="0"
                  max="100000"
                  defaultValue={entry?.correct ?? ''}
                />
              </Field>
            </div>
            <Field label="Nerede takıldın? Sonraki adımın ne?">
              <input
                name="obstacle"
                maxLength={500}
                defaultValue={entry?.obstacle ?? ''}
                placeholder="Örn. Matris çarpımını tekrar etmeliyim"
              />
            </Field>
          </details>
        </>
      )}
      {planTitle !== undefined && (
        <Field label="Planladığın iş tamamlandı mı?">
          <p className="helper">{planTitle}</p>
          <select name="planOutcome" required defaultValue="">
            <option value="" disabled>
              İşin sonucunu seç
            </option>
            <option value="complete">Evet, tamamlandı</option>
            <option value="continue">Hayır, devam edeceğim</option>
          </select>
          <p className="helper">
            Çalıştığın süre her iki seçimde de kaydedilir.
          </p>
        </Field>
      )}
      <button className="button primary full" disabled={saving}>
        {saving
          ? 'Kaydediliyor…'
          : kind === 'activity'
            ? 'Faaliyeti kaydet'
            : 'Oturumu kaydet'}
      </button>
      <p className="helper">
        Kısa bir kayıt yeterli. İstersen ayrıntıları daha sonra
        düzenleyebilirsin.
      </p>
    </form>
  );
}
