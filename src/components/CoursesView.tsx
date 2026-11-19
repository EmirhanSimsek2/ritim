import { BookOpen, Plus, ArrowRight } from 'lucide-react';
import { COURSES, duration } from '../lib/model';
import type { ReactNode } from 'react';
import type { TrackerState, Exam } from '../lib/model';

type Props = {
  state: TrackerState;
  exams: Exam[];
  examCard: (exam: Exam) => ReactNode;
  onAddExam: () => void;
  onStudyCourse: (id: string) => void;
};

export default function CoursesView({ state, exams, examCard, onAddExam, onStudyCourse }: Props) {
  return (
    <>
      <div className="course-grid">
        {COURSES.map((c) => {
          const es = state.entries.filter((e) => e.kind === 'study' && e.subject === c.id);
          return (
            <section className="card course-card" key={c.id}>
              <span
                className="course-symbol"
                style={{ background: c.color + '1a', color: c.color }}
              >
                <BookOpen size={23} />
              </span>
              <small>{c.code}</small>
              <h2>{c.name}</h2>
              <div>
                <strong>{duration(es.reduce((a, e) => a + (e.seconds ?? 0), 0))}</strong>
                <span>{es.length} oturum · tüm kayıtlar</span>
              </div>
              <button
                className="text-button"
                onClick={() => {
                  onStudyCourse(c.id);
                }}
              >
                Bu derse çalış <ArrowRight size={16} />
              </button>
            </section>
          );
        })}
      </div>
      <section className="card">
        <div className="card-heading">
          <div>
            <h2>Sınav & teslim takvimin</h2>
            <p>Syllabus planları değişebilir; güncellemeleri buradan düzenleyebilirsin.</p>
          </div>
          <button className="button secondary" onClick={onAddExam}>
            <Plus size={16} />
            Tarih ekle
          </button>
        </div>
        <div className="calendar-list">
          {exams.map((e) => (
            <div className="calendar-item" key={e.id}>
              {examCard(e)}
              <div className="exam-detail">
                <p>{e.note}</p>
                <small>Kaynak: {e.source}</small>
                {!e.start && <span className="pill">Kesin gün belirtilmemiş</span>}
                {e.end && e.end !== e.start && (
                  <span className="pill">Tarih aralığı · günü doğrula</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="helper">
          Syllabus dosyalarından okunabilen bilgiler eklendi. Belirtilmeyen tarih ve saatler tahmin
          edilmedi.
        </p>
      </section>
    </>
  );
}
