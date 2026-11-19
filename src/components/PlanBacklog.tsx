import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, History } from 'lucide-react';
import { duration, formatDate, today, type TrackerState } from '../lib/model';
import { movePlanBlock, setPlanOutcome } from '../lib/plan-actions';
import { pendingPlans } from '../lib/plan-summary';

export default function PlanBacklog({
  state,
  save,
  disabled,
  onEditing,
}: {
  state: TrackerState;
  save: (state: TrackerState, message?: string) => Promise<boolean>;
  disabled: boolean;
  onEditing: (value: boolean) => void;
}) {
  const [moving, setMoving] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const latest = useRef(state);
  latest.current = state;
  const lock = useRef(false);
  const items = pendingPlans(state);
  useEffect(() => {
    onEditing(!!moving || busy);
    return () => onEditing(false);
  }, [moving, busy, onEditing]);
  async function act(action: () => TrackerState, message: string) {
    if (disabled || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      if (await save(action(), message)) setMoving(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'İşlem tamamlanamadı.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!items.length) return null;
  return (
    <details className="card plan-backlog">
      <summary>
        <History size={17} />
        <span>
          Geçmişten kalanlar · {items.length} iş
          <small>
            Bugünkü planına eklemek veya sonucunu belirtmek için aç.
          </small>
        </span>
      </summary>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {(all ? items : items.slice(0, 5)).map(({ date, block }) => {
        const key = `${date}/${block.id}`;
        const running =
          state.timer?.planId === block.id && state.timer.planDate === date;
        const unavailable = disabled || busy || running;
        return (
          <article key={key} className="plan-backlog-item">
            <strong>{block.title}</strong>
            <small>
              {formatDate(date)} · {duration((block.end - block.start) * 60)} ·
              Sonucu girilmedi
            </small>
            {running && (
              <p className="helper">
                Bu işe bağlı oturumu önce Odaklan ekranından bitir.
              </p>
            )}
            <div className="plan-backlog-actions">
              <button
                className="button secondary"
                disabled={unavailable}
                onClick={() =>
                  void act(
                    () =>
                      movePlanBlock(
                        latest.current,
                        date,
                        block.id,
                        today(),
                        undefined,
                        true,
                      ),
                    'İş bugüne alındı · Gün içinde',
                  )
                }
              >
                <ArrowRight size={14} />
                Bugüne al
              </button>
              <button
                className="text-button"
                disabled={unavailable}
                onClick={() => setMoving(moving === key ? null : key)}
              >
                Tarih seç
              </button>
              <button
                className="text-button"
                disabled={unavailable}
                onClick={() =>
                  void act(
                    () =>
                      setPlanOutcome(
                        latest.current,
                        date,
                        block.id,
                        'happened',
                      ),
                    'İş tamamlandı',
                  )
                }
              >
                <Check size={14} />
                Tamamladım
              </button>
              <button
                className="text-button"
                disabled={unavailable}
                onClick={() =>
                  void act(
                    () =>
                      setPlanOutcome(latest.current, date, block.id, 'missed'),
                    'İş yapılmadı olarak kaydedildi',
                  )
                }
              >
                Yapılmadı
              </button>
              <button
                className="text-button"
                disabled={unavailable}
                onClick={() =>
                  void act(
                    () =>
                      setPlanOutcome(
                        latest.current,
                        date,
                        block.id,
                        'cancelled',
                      ),
                    'İşten vazgeçildi · Geçmiş kaydı korundu',
                  )
                }
              >
                Vazgeç
              </button>
            </div>
            {moving === key && (
              <form
                className="plan-move-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const values = new FormData(event.currentTarget);
                  void act(
                    () =>
                      movePlanBlock(
                        latest.current,
                        date,
                        block.id,
                        String(values.get('date')),
                        undefined,
                        true,
                      ),
                    'İş seçtiğin güne alındı · Gün içinde',
                  );
                }}
              >
                <label className="field">
                  <span>Yeni gün · Gün içinde</span>
                  <input
                    type="date"
                    name="date"
                    min={today()}
                    defaultValue={today()}
                    required
                  />
                </label>
                <button className="button secondary" disabled={unavailable}>
                  Taşı
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setMoving(null)}
                >
                  İptal
                </button>
              </form>
            )}
          </article>
        );
      })}
      {items.length > 5 && (
        <button className="text-button" onClick={() => setAll(!all)}>
          {all ? 'Daha az göster' : `Tümünü göster · ${items.length} iş`}
        </button>
      )}
      <p className="helper">
        İşler kendiliğinden bugüne taşınmaz. Sonuçlarını geçmiş günün planından
        değiştirebilirsin.
      </p>
    </details>
  );
}
