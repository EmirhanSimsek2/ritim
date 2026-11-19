import { BookOpen, Target, Moon, Sun, BookOpenText } from 'lucide-react';
import { COURSES, duration, formatDate, getSleepHours } from '../lib/model';
import type { TrackerState, Day } from '../lib/model';
import {
  goalSchedule,
  goalsAt,
  hasGoalValues,
  STUDY_DAYS,
  weeklyGoalHours,
} from '../lib/goals';
import Empty from './Empty';
import { decimal } from '../lib/display';
import DailyStudyGoal from './DailyStudyGoal';

type Props = {
  state: TrackerState;
  day: Day;
  date: string;
  onEditGoals: () => void;
};

export default function GoalsView({ state, day, date, onEditGoals }: Props) {
  const schedule = goalSchedule(state);
  const goal = goalsAt(state, date);
  const upcoming = schedule.find((item) => item.from > date);
  const dailyMode = goal?.studyMode === 'daily';
  const dayCount = goal?.studyDays?.length || 1;
  return (
    <>
      <div className="goals-toolbar">
        <p className="goals-selected-date">
          {formatDate(date, true)} için geçerli hedefler
        </p>
        <button className="button primary" onClick={onEditGoals}>
          <Target size={17} />
          {schedule.length ? 'Hedefleri düzenle' : 'Hedeflerimi belirle'}
        </button>
      </div>
      {upcoming && (
        <p className="goal-schedule-note">
          {formatDate(upcoming.from, true)} tarihinde yeni bir hedef dönemin
          başlayacak. O tarihe kadar mevcut hedeflerin geçerli.
        </p>
      )}
      {!goal || !hasGoalValues(goal) ? (
        <section className="card">
          <Empty>
            {goal
              ? 'Bu dönem için hedef belirlememişsin.'
              : upcoming
                ? 'Bu tarih için henüz başlayan bir hedefin yok. Planladığın hedef dönemlerini aşağıdan görebilirsin.'
                : 'Henüz hedef belirlemedin. Hedeflerimi belirle ile ders, okuma ve uyku hedeflerini ekleyebilirsin.'}
          </Empty>
        </section>
      ) : (
        <div className="equal-grid">
          {Object.keys(goal.courseHours).length > 0 && (
            <section className="card">
              <div className="card-heading">
                <div>
                  <h2>
                    {dailyMode
                      ? 'Günlük çalışma düzeni'
                      : 'Haftalık ders hedefleri'}
                  </h2>
                  <p>{formatDate(goal.from)} haftasından itibaren</p>
                </div>
                <BookOpen size={21} />
              </div>
              {dailyMode && (
                <p className="helper">
                  {STUDY_DAYS.filter((day) => goal.studyDays?.includes(day.id))
                    .map((day) => day.label)
                    .join(' · ')}{' '}
                  · bütün dersler için ortak
                </p>
              )}
              {COURSES.filter(
                (course) => goal.courseHours[course.id] !== undefined,
              ).map((course) => (
                <div className="goal-row" key={course.id}>
                  <i
                    className="course-dot"
                    style={{ background: course.color }}
                  />
                  <span>
                    {course.name}
                    {dailyMode && (
                      <small>
                        Haftalık karşılığı{' '}
                        {duration(goal.courseHours[course.id] * 3600)}
                      </small>
                    )}
                  </span>
                  <strong>
                    {duration(
                      (goal.courseHours[course.id] /
                        (dailyMode ? dayCount : 1)) *
                        3600,
                    )}
                    {dailyMode ? ' / gün' : ''}
                  </strong>
                </div>
              ))}
              <div className="goal-total">
                Haftalık toplam{' '}
                <strong>{duration(weeklyGoalHours(goal) * 3600)}</strong>
              </div>
              <DailyStudyGoal state={state} date={date} />
              <p className="helper">
                Gerçekleşen süre / hedef karşılaştırması Haftalık bakış
                ekranında.
              </p>
            </section>
          )}
          {(goal.pages !== null || goal.sleepHours !== null) && (
            <section className="card">
              <div className="card-heading">
                <div>
                  <h2>Günlük yaşam hedefleri</h2>
                  <p>{formatDate(goal.from)} tarihinden itibaren</p>
                </div>
                <Sun size={21} />
              </div>
              {goal.pages !== null && (
                <div className="habit-goal">
                  <BookOpenText size={25} />
                  <div>
                    <strong>Kitap okuma</strong>
                    <p>{goal.pages} sayfa / gün</p>
                  </div>
                </div>
              )}
              {goal.sleepHours !== null && (
                <div className="habit-goal">
                  <Moon size={25} />
                  <div>
                    <strong>Uyku</strong>
                    <p>{decimal(goal.sleepHours)} saat / gece</p>
                  </div>
                </div>
              )}
              <div className="daily-targets">
                <strong>{formatDate(date)} gerçekleşen / hedef</strong>
                {goal.pages !== null && (
                  <p>
                    Okuma {day.pages ?? '—'} / {goal.pages} sayfa
                  </p>
                )}
                {goal.sleepHours !== null && (
                  <p>
                    Uyku{' '}
                    {getSleepHours(day, date) === null
                      ? '—'
                      : decimal(getSleepHours(day, date)!)}{' '}
                    / {decimal(goal.sleepHours)} sa
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
      )}
      {!!schedule.length && (
        <details className="card goal-schedule-history">
          <summary>Hedef dönemleri · {schedule.length}</summary>
          <ul>
            {[...schedule].reverse().map((item) => (
              <li key={item.from}>
                <strong>{formatDate(item.from, true)}</strong>
                <small>
                  {item.studyMode === 'daily'
                    ? 'Günlük süre + günler'
                    : 'Haftalık toplam'}{' '}
                  · {duration(weeklyGoalHours(item) * 3600)} / hafta
                  {item.pages !== null ? ' · ' + item.pages + ' sayfa/gün' : ''}
                  {item.sleepHours !== null
                    ? ' · ' + decimal(item.sleepHours) + ' sa uyku'
                    : ''}
                </small>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
