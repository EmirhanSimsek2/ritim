import { BookOpen, ArrowRight, Play, Pause, Square, Clock3 } from 'lucide-react';
import { COURSES } from '../lib/model';
import type { TrackerState } from '../lib/model';
import { METHODS } from '../lib/study';
import { subjectName } from '../lib/display';
import { Field } from './FormFields';

type Props = {
  state: TrackerState;
  timer: TrackerState['timer'];
  elapsedMs: number;
  timerReady: boolean;
  timerMode: 'free' | 'pomo';
  timerKind: 'study' | 'activity';
  timerSubject: string;
  saving: boolean;
  setTimerMode: (mode: 'free' | 'pomo') => void;
  setTimerKind: (kind: 'study' | 'activity') => void;
  setTimerSubject: (subject: string) => void;
  toggleTimer: () => Promise<void>;
  finishTimer: () => Promise<void>;
  startTimer: (form: HTMLFormElement) => Promise<void>;
  onManualEntry: () => void;
  onCancel: () => Promise<void>;
};

export default function FocusView({
  state,
  timer,
  elapsedMs,
  timerReady,
  timerMode,
  timerKind,
  timerSubject,
  saving,
  setTimerMode,
  setTimerKind,
  setTimerSubject,
  toggleTimer,
  finishTimer,
  startTimer,
  onManualEntry,
  onCancel,
}: Props) {
  return (
    <div className="focus-layout">
      <section className="card focus-card">
        <div className="timer-badge">
          <span className="tiny-dot" />
          {timer
            ? timerReady
              ? 'Pomodoro tamamlandı'
              : timer.runningSince === null
                ? 'Duraklatıldı'
                : 'Oturum devam ediyor'
            : 'SANA AİT BİR ZAMAN'}
        </div>
        <div className="timer-display" aria-live="off">
          {String(
            Math.floor(
              ((timer?.mode ?? timerMode) === 'pomo'
                ? Math.max(0, 1500000 - elapsedMs)
                : elapsedMs) / 60000,
            ),
          ).padStart(2, '0')}
          <span>:</span>
          {String(
            Math.floor(
              ((timer?.mode ?? timerMode) === 'pomo'
                ? Math.max(0, 1500000 - elapsedMs)
                : elapsedMs) / 1000,
            ) % 60,
          ).padStart(2, '0')}
        </div>
        <p className="timer-caption">
          {timer
            ? `${subjectName(timer)}${timer.topic ? ' · ' + timer.topic : ''}`
            : 'Hazır olduğunda başlayalım.'}
        </p>
        {timer ? (
          <>
            <div className="timer-controls">
              <button
                className="button secondary"
                disabled={saving || timerReady}
                onClick={toggleTimer}
              >
                {timer.runningSince === null ? <Play size={17} /> : <Pause size={17} />}{' '}
                {timer.runningSince === null ? 'Devam et' : 'Duraklat'}
              </button>
              <button className="button primary" disabled={saving} onClick={finishTimer}>
                <Square size={15} />
                Bitir & kaydet
              </button>
            </div>
            <p className="helper">
              {timerReady
                ? '25 dakikalık odak süresi tamamlandı. Kaydet, ardından kendine bir mola ver.'
                : 'Sekmeyi veya ekranı kapatsan da sayaç geçen zamanı hesaplar.'}
            </p>
            <button className="text-button danger" disabled={saving} onClick={onCancel}>
              Sayacı iptal et
            </button>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              startTimer(e.currentTarget);
            }}
          >
            <div className="segmented">
              <button
                type="button"
                className={timerMode === 'free' ? 'selected' : ''}
                onClick={() => setTimerMode('free')}
              >
                Serbest sayaç
              </button>
              <button
                type="button"
                className={timerMode === 'pomo' ? 'selected' : ''}
                onClick={() => setTimerMode('pomo')}
              >
                Pomodoro · 25 dk
              </button>
            </div>
            <div className="form-grid">
              <Field label="Ne için zaman ayırıyorsun?">
                <select
                  value={timerKind}
                  onChange={(e) => {
                    const k = e.target.value as 'study' | 'activity';
                    setTimerKind(k);
                    setTimerSubject(k === 'study' ? 'de' : state.activities[0]);
                  }}
                >
                  <option value="study">Ders çalışma</option>
                  <option value="activity">Ders dışı faaliyet</option>
                </select>
              </Field>
              <Field label={timerKind === 'study' ? 'Ders' : 'Faaliyet'}>
                <select value={timerSubject} onChange={(e) => setTimerSubject(e.target.value)}>
                  {timerKind === 'study'
                    ? COURSES.map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.name}
                        </option>
                      ))
                    : state.activities.map((a) => <option key={a}>{a}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Bu oturumda ne yapmak istiyorsun?">
              <input
                name="topic"
                maxLength={500}
                placeholder="Örn. 5 integral sorusunu yardımsız çözmek"
              />
            </Field>
            {timerKind === 'study' && (
              <Field label="Nasıl çalışacaksın?">
                <select name="method">
                  {METHODS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>
            )}
            <button className="button primary start-button" disabled={saving}>
              <Play size={18} fill="currentColor" />
              Odaklanmaya başla
            </button>
            <p className="helper">Pomodoro 25 dakikada durur; molalar çalışma süresine eklenmez.</p>
          </form>
        )}
      </section>
      <aside className="focus-aside">
        <section className="card">
          <span className="little-label">KÜÇÜK BİR FİKİR</span>
          <h2>
            Oturumun sonunda
            <br />
            neyi yapabiliyor olacaksın?
          </h2>
          <p>
            “Bir saat çalışacağım” yanına küçük bir sonuç ekle: bir problemi çözmek, bir kavramı
            kendi sözlerinle açıklamak veya bir programı çalıştırmak.
          </p>
          <div className="tip">
            <BookOpen size={19} />
            <p>
              Bitirirken yalnızca süreyi kaydedebilirsin. Öğrenme notları her zaman isteğe bağlı.
            </p>
          </div>
        </section>
        <button className="card manual-card" onClick={onManualEntry}>
          <Clock3 size={23} />
          <strong>Zaten çalıştın mı?</strong>
          <p>Süreyi sonradan ekleyebilirsin.</p>
          <span>
            Elle kayıt ekle <ArrowRight size={16} />
          </span>
        </button>
      </aside>
    </div>
  );
}
