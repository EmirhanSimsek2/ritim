import { useState } from 'react';
import {
  COURSES,
  duration,
  dateSchema,
  today,
  weekStart,
  type Goals,
  type TrackerState,
} from '../lib/model';
import {
  convertGoalInputs,
  DEFAULT_STUDY_DAYS,
  goalIdentity,
  goalsAt,
  STUDY_DAYS,
} from '../lib/goals';
import { Field } from './FormFields';
import '../goals.css';

export default function GoalsForm({
  state,
  date = today(),
  saving,
  submit,
  onRefreshDraft,
}: {
  state: TrackerState;
  date?: string;
  saving: boolean;
  submit: (form: HTMLFormElement) => void;
  onRefreshDraft?: () => void;
}) {
  const earliest = weekStart(today());
  const [selection, setSelection] = useState(() => {
    const selectedWeek = weekStart(date);
    const from = selectedWeek > earliest ? selectedWeek : earliest;
    return { from, goal: goalForForm(state, from), generation: 0 };
  });
  const [from, setFrom] = useState(selection.from);
  const currentGoal = goalForForm(state, selection.from);
  const stale = goalIdentity(currentGoal) !== goalIdentity(selection.goal);
  function changeWeek(value: string) {
    setFrom(value);
    // Editing/clearing the date must not destroy a draft before a valid week is chosen.
    if (
      !dateSchema.safeParse(value).success ||
      value < earliest ||
      weekStart(value) !== value ||
      value === selection.from
    ) return;
    setSelection({
      from: value,
      goal: goalForForm(state, value),
      generation: selection.generation + 1,
    });
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!stale) submit(event.currentTarget);
      }}
    >
      <p className="helper">
        Dilediğin ders ve günlük hedefleri doldur. Boş bıraktığın alanlar hedef
        oluşturmaz.
      </p>
      <Field label="Hedeflerin başlayacağı hafta">
        <input
          type="date"
          required
          name="from"
          value={from}
          min={earliest}
          disabled={saving}
          onChange={(event) => changeWeek(event.target.value)}
        />
        <small>
          Pazartesi seç. Yeni hedefler bu haftadan itibaren geçerlidir; geçmiş
          haftalar korunur. Haftayı değiştirdiğinde alanlar o tarihte geçerli
          hedeflerle yenilenir.
        </small>
      </Field>
      {stale && (
        <section className="goal-conflict" role="alert">
          <p>
            Bu haftanın hedefleri başka bir sekmede veya cihazda değişti.
            Kaydetmeden önce güncel hedefleri forma al. Bu işlem aşağıdaki
            kaydedilmemiş değişikliklerini yeniler; ardından düzenleyebilirsin.
          </p>
          <button
            type="button"
            className="button secondary"
            disabled={saving}
            onClick={() => {
              setSelection({
                ...selection,
                goal: currentGoal,
                generation: selection.generation + 1,
              });
              onRefreshDraft?.();
            }}
          >
            Güncel hedefleri forma al
          </button>
        </section>
      )}
      <fieldset className="goal-fields" disabled={saving || stale}>
        <GoalFields
          key={selection.generation}
          original={selection.goal}
          saving={saving || stale}
        />
      </fieldset>
    </form>
  );
}

function goalForForm(state: TrackerState, from: string): Goals {
  return goalsAt(state, from) ?? {
    from,
    courseHours: {},
    studyTotal: null,
    pages: null,
    sleepHours: null,
  };
}

// Changing the start week reloads every field together, including reading and sleep.
function GoalFields({ original, saving }: { original: Goals; saving: boolean }) {
  const [mode, setMode] = useState<'weekly' | 'daily'>(
    original.studyMode ?? 'weekly',
  );
  const [days, setDays] = useState(original.studyDays ?? DEFAULT_STUDY_DAYS);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      COURSES.map((course) => [
        course.id,
        original.courseHours[course.id] === undefined
          ? ''
          : String(
              Number(
                (
                  original.courseHours[course.id] /
                  (original.studyMode === 'daily'
                    ? original.studyDays?.length || 1
                    : 1)
                ).toFixed(9),
              ),
            ),
      ]),
    ),
  );
  const inputTotal = Object.values(values).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0,
  );
  const weeklyTotal = inputTotal * (mode === 'daily' ? days.length : 1);
  const invalidTotal =
    weeklyTotal > 168 || (mode === 'daily' && inputTotal > 24);
  function switchMode(next: 'weekly' | 'daily') {
    setValues((current) => convertGoalInputs(current, mode, next, days.length));
    setMode(next);
  }
  return (
    <>
      <h3>Ders çalışma hedefi</h3>
      <div
        className="segmented goal-period"
        role="group"
        aria-label="Çalışma hedefini belirleme biçimi"
      >
        <button
          type="button"
          className={mode === 'weekly' ? 'selected' : ''}
          aria-pressed={mode === 'weekly'}
          disabled={saving}
          onClick={() => switchMode('weekly')}
        >
          Haftalık toplam
        </button>
        <button
          type="button"
          className={mode === 'daily' ? 'selected' : ''}
          aria-pressed={mode === 'daily'}
          disabled={saving}
          onClick={() => switchMode('daily')}
        >
          Günlük süre + günler
        </button>
      </div>
      <input type="hidden" name="studyMode" value={mode} />
      {mode === 'daily' ? (
        <fieldset className="goal-days" disabled={saving}>
          <legend>Çalışacağın günler · bütün dersler için ortak</legend>
          {STUDY_DAYS.map((day) => (
            <label key={day.id}>
              <input
                type="checkbox"
                name="studyDays"
                value={day.id}
                checked={days.includes(day.id)}
                onChange={() =>
                  setDays((current) =>
                    current.includes(day.id)
                      ? current.length > 1
                        ? current.filter((id) => id !== day.id)
                        : current
                      : [...current, day.id],
                  )
                }
              />
              <span>{day.label}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="helper">
          Haftalık süreyi günlere istediğin gibi dağıtabilirsin.
        </p>
      )}
      <p className="helper">
        {mode === 'daily'
          ? 'Her ders için saat / çalışma günü gir.'
          : 'Her ders için saat / hafta gir.'}
      </p>
      <div className="form-grid">
        {COURSES.map((course) => (
          <Field label={course.name} key={course.id}>
            <input
              name={course.id}
              aria-label={
                course.name +
                ' · saat / ' +
                (mode === 'daily' ? 'çalışma günü' : 'hafta')
              }
              type="number"
              inputMode="decimal"
              min="0"
              max={mode === 'daily' ? '24' : '168'}
              step="any"
              value={values[course.id]}
              disabled={saving}
              placeholder={
                mode === 'daily' ? 'Saat / çalışma günü' : 'Saat / hafta'
              }
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [course.id]: event.target.value,
                }))
              }
            />
          </Field>
        ))}
      </div>
      <div className="goal-input-summary" aria-live="polite">
        {mode === 'daily' && (
          <span>
            Günlük toplam <strong>{duration(inputTotal * 3600)}</strong> ·{' '}
            {days.length} gün
          </span>
        )}
        <span>
          Haftalık toplam <strong>{duration(weeklyTotal * 3600)}</strong>
        </span>
      </div>
      <p className="helper">
        {mode === 'daily'
          ? 'Her seçili günde aynı süre geçerlidir. Gün sayısı değişirse haftalık toplam da değişir.'
          : 'Günlük girişe geçersen haftalık toplam seçili günlere bölünür.'}
      </p>
      {invalidTotal && (
        <p className="error-banner" role="alert">
          {mode === 'daily' && inputTotal > 24
            ? 'Günlük ders hedeflerinin toplamı 24 saati aşamaz.'
            : 'Haftalık ders hedeflerinin toplamı 168 saati aşamaz.'}
        </p>
      )}
      <h3>Günlük yaşam hedefleri</h3>
      <div className="form-grid">
        <Field label="Kitap · sayfa / gün">
          <input
            name="pages"
            type="number"
            min="0"
            max="10000"
            step="1"
            defaultValue={original.pages ?? ''}
            disabled={saving}
          />
        </Field>
        <Field label="Uyku · saat / gece">
          <input
            name="sleepHours"
            type="number"
            min="0"
            max="24"
            step="any"
            defaultValue={original.sleepHours ?? ''}
            disabled={saving}
          />
        </Field>
      </div>
      <button className="button primary full" disabled={saving || invalidTotal}>
        Hedefleri kaydet
      </button>
    </>
  );
}
