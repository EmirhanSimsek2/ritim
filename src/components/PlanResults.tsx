import { Check, ArrowRight, X, Minus, Circle } from 'lucide-react';
import { formatDate, shiftDate, today, type TrackerState } from '../lib/model';
import { planSummary, type PlanSummary } from '../lib/plan-summary';
import '../plan-results.css';

const outcomes = [
  { key: 'done', label: 'Tamamlandı', Icon: Check },
  { key: 'moved', label: 'Ertelendi', Icon: ArrowRight },
  { key: 'missed', label: 'Yapılmadı', Icon: X },
  { key: 'cancelled', label: 'Vazgeçildi', Icon: Minus },
  { key: 'pending', label: 'Bekliyor', Icon: Circle },
] as const;

function pendingLabel(date: string) {
  return date < today()
    ? 'Sonucu girilmedi'
    : date > today()
      ? 'Planlandı'
      : 'Bekliyor';
}

function describe(summary: PlanSummary, date: string) {
  return (
    `${summary.total} iş: ` +
    outcomes
      .map(
        (item) =>
          `${summary[item.key]} ${item.key === 'pending' ? pendingLabel(date) : item.label}`,
      )
      .join(', ')
  );
}

export function PlanDaySummary({
  state,
  date,
}: {
  state: TrackerState;
  date: string;
}) {
  const summary = planSummary(state, date);
  if (!summary.total) return null;
  return (
    <div className="plan-day-summary" aria-label="Günün plan sonuçları">
      <div className="plan-result-heading">
        <strong>
          {summary.done} / {summary.total} iş tamamlandı
        </strong>
        <span>{date > today() ? 'Planlanan işler' : 'İşlerin durumu'}</span>
      </div>
      <div
        className="plan-result-bar"
        role="img"
        aria-label={describe(summary, date)}
      >
        {outcomes.map(
          ({ key }) =>
            summary[key] > 0 && (
              <span
                key={key}
                className={`plan-result-${key}`}
                style={{ width: `${(summary[key] / summary.total) * 100}%` }}
              />
            ),
        )}
      </div>
      <div className="plan-result-legend">
        {outcomes.map(
          ({ key, label, Icon }) =>
            summary[key] > 0 && (
              <span key={key}>
                <Icon size={13} className={`plan-result-ink-${key}`} />
                {summary[key]} {key === 'pending' ? pendingLabel(date) : label}
              </span>
            ),
        )}
      </div>
    </div>
  );
}

export default function PlanWeekResults({
  state,
  week,
  onDate,
}: {
  state: TrackerState;
  week: string;
  onDate: (date: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDate(week, index);
    return { date, summary: planSummary(state, date) };
  });
  const max = Math.max(1, ...days.map((day) => day.summary.total));
  return (
    <section className="card plan-week-results">
      <div className="card-heading">
        <div>
          <h2>Planlarının sonucu</h2>
          <p>
            İş adedi · {formatDate(week)} – {formatDate(shiftDate(week, 6))}
          </p>
        </div>
      </div>
      {days.some((day) => day.summary.total) ? (
        <>
          <div className="plan-week-grid">
            {days.map(({ date, summary }) => (
              <button
                className={`plan-week-day${date === today() ? ' is-today' : ''}`}
                key={date}
                onClick={() => onDate(date)}
                aria-label={`${formatDate(date)} · ${describe(summary, date)} · Gün planını aç`}
              >
                <small>
                  {summary.total ? `${summary.done}/${summary.total}` : '—'}
                </small>
                <span className="plan-week-track">
                  {outcomes.map(
                    ({ key }) =>
                      summary[key] > 0 && (
                        <span
                          key={key}
                          className={`plan-result-${key}`}
                          style={{ height: `${(summary[key] / max) * 100}%` }}
                        />
                      ),
                  )}
                </span>
                <strong>
                  {new Date(date + 'T12:00Z').toLocaleDateString('tr-TR', {
                    weekday: 'short',
                  })}
                </strong>
                <small>
                  {new Date(date + 'T12:00Z').getUTCDate()}
                  {date > today() ? ' · Plan' : ''}
                </small>
              </button>
            ))}
          </div>
          <div className="plan-result-legend">
            {outcomes.map(({ key, label, Icon }) => (
              <span key={key}>
                <Icon size={13} className={`plan-result-ink-${key}`} />
                {key === 'pending' ? 'Bekliyor / sonuç yok' : label}
              </span>
            ))}
          </div>
          <p className="helper">
            Sütunlar iş sayısını, üstteki sayılar tamamlanan / toplam işi
            gösterir. Sonucu girilmeyen işler yapılmadı sayılmaz. Bir güne
            dokunarak planını açabilirsin.
          </p>
        </>
      ) : (
        <p className="helper">
          Bu hafta için henüz plan eklenmemiş. Planladığın işlerin sonuçları
          burada görünecek.
        </p>
      )}
    </section>
  );
}
