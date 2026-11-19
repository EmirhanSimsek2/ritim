import { duration, today, type TrackerState } from '../lib/model';
import { dailyStudyProgress } from '../lib/goals';
import '../goals.css';

export default function DailyStudyGoal({
  state,
  date,
}: {
  state: TrackerState;
  date: string;
}) {
  const progress = dailyStudyProgress(state, date);
  if (!progress) return null;
  return (
    <div className="daily-study-goal">
      <div>
        <span>
          {date > today() ? 'Planlanan ders süresi' : 'Günlük ders süren'}
        </span>
        <strong>
          {date > today()
            ? duration(progress.targetSeconds)
            : duration(progress.seconds) +
              ' / ' +
              duration(progress.targetSeconds)}
        </strong>
      </div>
      {date <= today() && (
        <>
          <progress
            aria-label="Günlük ders süresi hedefi"
            value={progress.seconds}
            max={progress.targetSeconds}
          />
          <small>
            {progress.seconds >= progress.targetSeconds
              ? 'Süre hedefine ulaştın.'
              : 'Kaydettiğin ders oturumlarıyla ilerler.'}{' '}
            İşlerin tamamlanma durumu ayrıca değerlendirilir.
          </small>
        </>
      )}
    </div>
  );
}
