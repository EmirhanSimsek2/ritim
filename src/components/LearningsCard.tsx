import { useEffect, useId, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { COURSES, formatDate, type Learning, type TrackerState } from '../lib/model';
import { learningTagName, weekLearnings, type LearningAction } from '../lib/learnings';
import '../learnings.css';

function LearningText({ item }: { item: Learning }) {
  return (
    <div className="learning-content">
      <p>{item.text}</p>
      {item.tag && <span className="learning-tag">{learningTagName(item.tag)}</span>}
    </div>
  );
}

export default function LearningsCard({
  items,
  activities,
  isFutureDay,
  saving,
  onChange,
}: {
  items: Learning[];
  activities: string[];
  isFutureDay: boolean;
  saving: boolean;
  onChange: (action: LearningAction) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const [tag, setTag] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const formId = useId();
  const locked = isFutureDay || saving || pending;
  const full = items.length >= 50 && editId === null;
  const knownTag =
    !tag || COURSES.some((course) => course.id === tag) || activities.includes(tag);

  useEffect(() => {
    if (editId) inputRef.current?.focus();
  }, [editId]);

  function reset() {
    setText('');
    setTag('');
    setEditId(null);
  }

  async function mutate(action: LearningAction) {
    if (isFutureDay || saving || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      if (await onChange(action)) {
        if (action.type !== 'remove' || action.id === editId) reset();
      }
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <section className="card learnings-card" aria-labelledby={`${formId}-title`}>
      <div className="card-heading">
        <div>
          <h2 id={`${formId}-title`}>Bugün neler öğrendim?</h2>
          <p>Öğrendiğin somut bir şeyi tek cümleyle kaydet.</p>
        </div>
        <span className="pill">{items.length}/50</span>
      </div>
      <form
        className="learning-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (locked || full || !text.trim()) return;
          void mutate({
            type: editId ? 'edit' : 'add',
            item: {
              id: editId ?? crypto.randomUUID(),
              text: text.trim(),
              ...(tag ? { tag } : {}),
            },
          });
        }}
      >
        <label className="field learning-text">
          <span>{editId ? 'Öğrenme maddesini düzenle' : 'Kısa özet'}</span>
          <input
            ref={inputRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Örn. Fourier serisinin periyodik sinyallerde neden ayrık spektrum verdiğini öğrendim"
            required
            maxLength={300}
            disabled={locked || full}
          />
        </label>
        <label className="field learning-area">
          <span>Alan etiketi (isteğe bağlı)</span>
          <select
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            disabled={locked || full}
          >
            <option value="">Genel</option>
            <optgroup label="Dersler">
              {COURSES.map((course) => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </optgroup>
            <optgroup label="Faaliyetler">
              {activities.map((activity) => (
                <option key={activity} value={activity}>{activity}</option>
              ))}
            </optgroup>
            {!knownTag && <option value={tag}>{learningTagName(tag)}</option>}
          </select>
        </label>
        <div className="learning-form-actions">
          <button
            className="button primary"
            type="submit"
            disabled={locked || full || !text.trim()}
          >
            {editId ? 'Kaydet' : 'Ekle'}
          </button>
          {editId && (
            <button
              className="button secondary"
              type="button"
              onClick={reset}
              disabled={locked}
            >
              Vazgeç
            </button>
          )}
        </div>
      </form>
      {full && (
        <p className="helper">Bir güne en fazla 50 öğrenme maddesi ekleyebilirsin.</p>
      )}
      {isFutureDay && (
        <p className="helper">Gelecek günlerin öğrenme maddeleri değiştirilemez.</p>
      )}
      {items.length ? (
        <ul className="learning-list">
          {items.map((item) => (
            <li key={item.id}>
              <LearningText item={item} />
              <div className="learning-actions">
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Öğrenme maddesini düzenle: ${item.text}`}
                  disabled={locked}
                  onClick={() => {
                    setEditId(item.id);
                    setText(item.text);
                    setTag(item.tag ?? '');
                  }}
                >
                  <Pencil size={18} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Öğrenme maddesini sil: ${item.text}`}
                  disabled={locked}
                  onClick={() => {
                    void mutate({ type: 'remove', id: item.id });
                  }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="helper">Bu gün için henüz öğrenme maddesi yok.</p>
      )}
    </section>
  );
}

export function WeekLearningsCard({
  state,
  week,
}: {
  state: TrackerState;
  week: string;
}) {
  const days = weekLearnings(state, week);
  return (
    <section className="card learnings-card">
      <div className="card-heading">
        <h2>Bu hafta neler öğrendin?</h2>
      </div>
      {days.length ? (
        days.map(({ date, items }) => (
          <div className="learning-day" key={date}>
            <h3>{formatDate(date, true)}</h3>
            <ul className="learning-list">
              {items.map((item) => (
                <li key={item.id}><LearningText item={item} /></li>
              ))}
            </ul>
          </div>
        ))
      ) : (
        <p className="helper">Bu hafta henüz öğrenme maddesi kaydetmedin.</p>
      )}
    </section>
  );
}
