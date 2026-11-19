import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  Plus,
  MapPin,
  Layers,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  X,
  Pencil,
  Trash2,
  Copy,
  Check,
  Play,
  Star,
  ArrowRight,
  CalendarDays,
  Clock3,
} from 'lucide-react';
import {
  blankDay,
  COURSES,
  dateSchema,
  duration,
  formatDate,
  shiftDate,
  today,
  type TrackerState,
} from './lib/model';
import {
  adjustBlock,
  blockCategoryForPlan,
  blockSchema,
  blocksSchema,
  clock,
  conflictingBlock,
  copyableBlocks,
  dayExample,
  planKind,
  planTemplatesSchema,
  toMinutes,
  type PlanKind,
  type TimeBlock,
} from './lib/timeline';
import {
  applyPlanTemplate,
  movePlanBlock,
  setPlanOutcome,
} from './lib/plan-actions';
import { PlanDaySummary } from './components/PlanResults';
import PlanBacklog from './components/PlanBacklog';
import DailyStudyGoal from './components/DailyStudyGoal';
import './timeline.css';

type Props = {
  state: TrackerState;
  date: string;
  onDate: (date: string) => void;
  save: (state: TrackerState, message?: string) => Promise<boolean>;
  saving: boolean;
  onEditing: (editing: boolean) => void;
  error: string;
  onStart: (block: TimeBlock) => Promise<void>;
};
type Draft = Partial<TimeBlock> & {
  lane: TimeBlock['lane'];
  start: number;
  end: number;
};
type Drag = {
  block: TimeBlock;
  mode: 'move' | 'start' | 'end';
  y: number;
  scroll: number;
  pointerY: number;
  current: TimeBlock;
};
const PX = 0.8;
const WEEKDAYS = [
  'Pazar',
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
];
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function BlockDialog({
  draft,
  date,
  state,
  saving,
  onClose,
  onSave,
  onDelete,
  errorMessage,
}: {
  draft: Draft;
  date: string;
  state: TrackerState;
  saving: boolean;
  onClose: () => void;
  onSave: (block: TimeBlock) => Promise<boolean>;
  onDelete?: () => Promise<void>;
  errorMessage: string;
}) {
  const [error, setError] = useState('');
  const [flexible, setFlexible] = useState(draft.flexible ?? false);
  const [midnight, setMidnight] = useState(draft.end === 1440);
  const [kind, setKind] = useState<PlanKind>(() => planKind(draft.category));
  const [subject, setSubject] = useState(draft.subject ?? '');
  const location = draft.lane === 'location';
  const latest = useRef({ onClose, saving });
  latest.current = { onClose, saving };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const root = document.querySelector<HTMLElement>('[data-block-dialog]');
    const items = () =>
      Array.from(
        root?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary',
        ) ?? [],
      ).filter((item) => item.getClientRects().length > 0);
    items()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !latest.current.saving)
        latest.current.onClose();
      if (event.key === 'Tab') {
        const list = items(),
          first = list[0],
          last = list.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, []);
  async function submit(form: HTMLFormElement) {
    setError('');
    if (!location && !subject.trim()) {
      setError(kind === 'study' ? 'Bir ders seç.' : 'Bir faaliyet seç.');
      return;
    }
    const values = new FormData(form);
    const start = flexible ? 0 : toMinutes(String(values.get('start')));
    const end = flexible
      ? Number(values.get('minutes'))
      : midnight
        ? 1440
        : toMinutes(String(values.get('end')));
    const parsed = blockSchema.safeParse({
      ...draft,
      id: draft.id ?? crypto.randomUUID(),
      title: values.get('title'),
      start,
      end,
      category: location
        ? 'other'
        : blockCategoryForPlan(kind, subject, draft.category, draft.subject ?? ''),
      status: values.get('status') ?? draft.status ?? 'planned',
      approximate: values.get('approximate') === 'on',
      notes: values.get('notes') ?? '',
      place: values.get('place') ?? '',
      priority: values.get('priority') === 'on',
      flexible: !location && flexible,
      subject: location ? '' : subject,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Saatleri kontrol et.');
      return;
    }
    if (date > today() && parsed.data.status !== 'planned') {
      setError('Gelecek bir gün için Plan seç.');
      return;
    }
    if (await onSave(parsed.data)) onClose();
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        className="modal plan-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="block-dialog-title"
        data-block-dialog
      >
        <header>
          <div>
            <span className="little-label">{formatDate(date, true)}</span>
            <h2 id="block-dialog-title">
              {draft.id
                ? 'İşi düzenle'
                : location
                  ? 'Konum ekle'
                  : 'Gününe bir iş ekle'}
            </h2>
          </div>
          <button
            className="icon-button"
            aria-label="Pencereyi kapat"
            onClick={onClose}
            disabled={saving}
          >
            <X size={21} />
          </button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit(event.currentTarget);
          }}
        >
          {(error || errorMessage) && (
            <p className="error-banner" role="alert">
              {error || errorMessage}
            </p>
          )}
          <Field label={location ? 'Konum adı' : 'Ne tamamlamak istiyorsun?'}>
            <input
              name="title"
              required
              maxLength={100}
              defaultValue={draft.title ?? ''}
              placeholder={
                location
                  ? 'Örn. Okul, kütüphane'
                  : 'Örn. Fourier serilerinden 5 soru çöz'
              }
            />
          </Field>
          {!location && (
            <div className="form-grid">
              <Field label="Tür">
                <select
                  name="category"
                  value={kind}
                  onChange={(event) => {
                    const next = event.target.value as PlanKind;
                    setKind(next);
                    setSubject(
                      next === 'study'
                        ? draft.category === 'study'
                          ? (draft.subject ?? '')
                          : ''
                        : draft.category && draft.category !== 'study'
                          ? (draft.subject ?? '')
                          : '',
                    );
                  }}
                >
                  <option value="study">Ders çalışma</option>
                  <option value="activity">Ders dışı faaliyet</option>
                </select>
              </Field>
              <Field label={kind === 'study' ? 'Ders' : 'Faaliyet'}>
                <select
                  name="subject"
                  value={subject}
                  required
                  onChange={(event) => setSubject(event.target.value)}
                >
                  <option value="">
                    {kind === 'study' ? 'Ders seç' : 'Faaliyet seç'}
                  </option>
                  {kind === 'study'
                    ? COURSES.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))
                    : Array.from(
                        new Set([
                          ...state.activities,
                          ...(subject ? [subject] : []),
                        ]),
                      ).map((item) => <option key={item}>{item}</option>)}
                </select>
              </Field>
            </div>
          )}
          {!location && (
            <div className="segmented plan-schedule-mode">
              <button
                type="button"
                className={flexible ? 'selected' : ''}
                onClick={() => setFlexible(true)}
              >
                Gün içinde
              </button>
              <button
                type="button"
                className={!flexible ? 'selected' : ''}
                onClick={() => setFlexible(false)}
              >
                Saat belirle
              </button>
            </div>
          )}
          {flexible && !location ? (
            <Field label="Ayırmak istediğin süre · dakika">
              <input
                name="minutes"
                type="number"
                min="1"
                max="1440"
                step="1"
                required
                defaultValue={draft.end - draft.start}
              />
            </Field>
          ) : (
            <>
              <div className="form-grid">
                <Field label="Başlangıç">
                  <input
                    name="start"
                    type="time"
                    required
                    defaultValue={clock(draft.start)}
                  />
                </Field>
                <Field label="Bitiş">
                  <input
                    name="end"
                    type="time"
                    required={!midnight}
                    disabled={midnight}
                    defaultValue={
                      draft.end === 1440 ? '00:00' : clock(draft.end)
                    }
                  />
                </Field>
              </div>
              <label className="timeline-check">
                <input
                  type="checkbox"
                  checked={midnight}
                  onChange={(event) => setMidnight(event.target.checked)}
                />
                24.00’te biter
              </label>
            </>
          )}
          {!location && (
            <label className="timeline-check">
              <input
                name="priority"
                type="checkbox"
                defaultChecked={draft.priority ?? false}
              />
              Bugünün önceliklerinden biri
            </label>
          )}
          <details
            className="plan-extra"
            open={!!draft.place || !!draft.notes || draft.status === 'happened'}
          >
            <summary>Diğer ayrıntılar</summary>
            {!location && (
              <Field label="Konum · isteğe bağlı">
                <input
                  name="place"
                  maxLength={100}
                  defaultValue={draft.place ?? ''}
                  placeholder="Örn. Kütüphane"
                />
              </Field>
            )}
            <Field label="Not · isteğe bağlı">
              <textarea
                name="notes"
                rows={2}
                maxLength={1000}
                defaultValue={draft.notes ?? ''}
              />
            </Field>
            <Field label="Durum">
              <select name="status" defaultValue={draft.status ?? 'planned'}>
                <option value="planned">Plan</option>
                <option value="happened" disabled={date > today()}>
                  Tamamlandı
                </option>
                {!location && (
                  <option value="missed" disabled={date > today()}>
                    Yapılmadı
                  </option>
                )}
                {!location && (
                  <option value="cancelled" disabled={date > today()}>
                    Vazgeçildi
                  </option>
                )}
              </select>
            </Field>
            {!flexible && (
              <label className="timeline-check">
                <input
                  name="approximate"
                  type="checkbox"
                  defaultChecked={draft.approximate ?? true}
                />
                Saatler yaklaşık
              </label>
            )}
          </details>
          <button className="button primary full" disabled={saving}>
            {saving ? 'Kaydediliyor…' : 'İşi kaydet'}
          </button>
          {onDelete && (
            <button
              type="button"
              className="text-button danger timeline-delete"
              disabled={saving}
              onClick={onDelete}
            >
              <Trash2 size={15} />
              Bu kaydı sil
            </button>
          )}
        </form>
      </section>
    </div>
  );
}

export default function Timeline({
  state,
  date,
  onDate,
  save,
  saving,
  onEditing,
  error,
  onStart,
}: Props) {
  const [draft, setDraft] = useState<Draft | null>(null),
    [localError, setLocalError] = useState('');
  const [preview, setPreview] = useState<TimeBlock[] | null>(null);
  const [view, setView] = useState<'agenda' | 'timeline'>('agenda'),
    [locations, setLocations] = useState(false);
  const [copyDate, setCopyDate] = useState(() => shiftDate(date, 1)),
    [moving, setMoving] = useState<string | null>(null);
  const [drag, setDrag] = useState<TimeBlock | null>(null),
    [dragging, setDragging] = useState(false),
    [working, setWorking] = useState(false);
  const [backlogEditing, setBacklogEditing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null),
    dragRef = useRef<Drag | null>(null),
    busy = useRef(false);
  const latest = useRef({ state, date, saving });
  latest.current = { state, date, saving };
  const blocks = state.days[date]?.blocks ?? [];
  const activities = blocks.filter((block) => block.lane === 'activity');
  const pending = activities.filter((block) => block.status === 'planned');
  const priorities = pending.filter((block) => block.priority);
  const scheduled = pending
    .filter((block) => !block.priority && !block.flexible)
    .sort((a, b) => a.start - b.start);
  const flexible = pending.filter((block) => !block.priority && block.flexible);
  const completed = activities.filter((block) => block.status === 'happened');
  const closed = activities.filter(
    (block) => block.status === 'missed' || block.status === 'cancelled',
  );
  const moved = (state.days[date]?.planMoves ?? []).filter(
    (item) =>
      item.block.lane === 'activity' &&
      !activities.some((block) => block.id === item.block.id),
  );
  const minute =
    Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Istanbul',
        hour: '2-digit',
        hour12: false,
      }).format(new Date()),
    ) *
      60 +
    Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Istanbul',
        minute: '2-digit',
      }).format(new Date()),
    );
  const next =
    [...priorities, ...pending.filter((block) => !block.priority)].find(
      (block) => block.flexible || date !== today() || block.end > minute,
    ) ?? pending[0];
  const disabled = saving || working;
  useEffect(() => {
    onEditing(
      !!draft || dragging || !!moving || !!preview || working || backlogEditing,
    );
    return () => onEditing(false);
  }, [
    !!draft,
    dragging,
    !!moving,
    !!preview,
    working,
    backlogEditing,
    onEditing,
  ]);
  useEffect(() => {
    setDraft(null);
    setMoving(null);
    setPreview(null);
    setLocalError('');
    setCopyDate(shiftDate(date, 1));
  }, [date]);
  useEffect(() => {
    if (view === 'timeline' && scrollRef.current)
      scrollRef.current.scrollTop = 7 * 60 * PX;
  }, [view, date]);
  async function run(action: () => Promise<unknown>) {
    if (busy.current || latest.current.saving) return;
    busy.current = true;
    setWorking(true);
    setLocalError('');
    try {
      await action();
    } catch (cause) {
      setLocalError(
        cause instanceof Error ? cause.message : 'İşlem tamamlanamadı.',
      );
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }
  async function store(next: TimeBlock[], message: string, targetDate = date) {
    const parsed = blocksSchema.safeParse(next);
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0].message);
      return false;
    }
    if (
      targetDate > today() &&
      next.some((block) => block.status !== 'planned')
    ) {
      setLocalError('Gelecek güne yalnızca plan ekleyebilirsin.');
      return false;
    }
    const current = latest.current.state,
      day = current.days[targetDate] ?? blankDay();
    return save(
      {
        ...current,
        days: {
          ...current.days,
          [targetDate]: { ...day, blocks: parsed.data },
        },
      },
      message,
    );
  }
  async function upsert(block: TimeBlock) {
    const current = latest.current.state.days[date]?.blocks ?? [];
    const previous = current.find((item) => item.id === block.id);
    if (
      previous &&
      previous.status !== block.status &&
      latest.current.state.timer?.planId === block.id &&
      latest.current.state.timer.planDate === date
    ) {
      setLocalError('Sonucu değiştirmeden önce devam eden oturumu bitir.');
      return false;
    }
    const clash = conflictingBlock(current, block);
    if (clash) {
      setLocalError(
        `“${clash.title}” ile saatler çakışıyor. Başka bir saat seç.`,
      );
      return false;
    }
    const moved =
      previous &&
      (previous.start !== block.start ||
        previous.end !== block.end ||
        !!previous.flexible !== !!block.flexible);
    const next = moved
      ? {
          ...block,
          original: previous.original ?? {
            date,
            start: previous.start,
            end: previous.end,
            flexible: !!previous.flexible,
          },
        }
      : block;
    return store(
      previous
        ? current.map((item) => (item.id === block.id ? next : item))
        : [...current, next],
      'Plan kaydedildi',
    );
  }
  function add(lane: TimeBlock['lane'], start?: number, end?: number) {
    setLocalError('');
    setDraft({
      lane,
      start: start ?? 9 * 60,
      end: end ?? (start ?? 9 * 60) + 45,
      flexible: lane === 'activity' && start === undefined,
    });
  }
  async function move(block: TimeBlock, targetDate: string, start?: number) {
    const nextState = movePlanBlock(
      latest.current.state,
      date,
      block.id,
      targetDate,
      start,
    );
    if (await save(nextState, 'İş taşındı')) setMoving(null);
  }
  function beginDrag(
    event: ReactPointerEvent,
    block: TimeBlock,
    mode: Drag['mode'],
  ) {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      block,
      mode,
      y: event.clientY,
      pointerY: event.clientY,
      scroll: scrollRef.current?.scrollTop ?? 0,
      current: block,
    };
    setDrag(block);
    setDragging(true);
    setLocalError('');
  }
  const upsertRef = useRef(upsert);
  upsertRef.current = upsert;
  useEffect(() => {
    if (!dragging) return;
    let frame = 0;
    const update = () => {
      const item = dragRef.current,
        root = scrollRef.current;
      if (!item || !root) return;
      const nextBlock = adjustBlock(
        item.block,
        item.mode,
        (item.pointerY - item.y + root.scrollTop - item.scroll) / PX,
      );
      item.current = nextBlock;
      setDrag(nextBlock);
    };
    const movePointer = (event: PointerEvent) => {
      if (dragRef.current) {
        event.preventDefault();
        dragRef.current.pointerY = event.clientY;
        update();
      }
    };
    const finish = () => {
      const item = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      setDragging(false);
      if (
        item &&
        (item.current.start !== item.block.start ||
          item.current.end !== item.block.end)
      )
        void run(() => upsertRef.current(item.current));
    };
    const cancel = () => {
      dragRef.current = null;
      setDrag(null);
      setDragging(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel();
    };
    const scroll = () => {
      const item = dragRef.current,
        root = scrollRef.current;
      if (item && root) {
        const rect = root.getBoundingClientRect(),
          speed =
            item.pointerY < rect.top + 40
              ? -10
              : item.pointerY > rect.bottom - 40
                ? 10
                : 0;
        if (speed) {
          root.scrollTop += speed;
          update();
        }
      }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    window.addEventListener('pointermove', movePointer, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', movePointer);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
    };
  }, [dragging]);
  async function copy() {
    if (!dateSchema.safeParse(copyDate).success || copyDate === date)
      throw Error('Kopyalamak için farklı bir gün seç.');
    const current = latest.current.state,
      source = copyableBlocks(current.days[date]?.blocks ?? []),
      target = current.days[copyDate]?.blocks ?? [];
    if (!source.length)
      throw Error('Kopyalanabilecek plan veya tamamlanmış iş bulunmuyor.');
    const copies = source.map((block) => {
      const { original, templateSource, ...copyBlock } = block;
      return {
        ...copyBlock,
        id: crypto.randomUUID(),
        status: 'planned' as const,
      };
    });
    if (await store([...target, ...copies], 'Plan kopyalandı', copyDate))
      onDate(copyDate);
  }
  async function saveTemplate(form: HTMLFormElement) {
    const values = new FormData(form),
      current = latest.current.state,
      source = copyableBlocks(current.days[date]?.blocks ?? []);
    if (!source.length)
      throw Error('Şablona kaydedilecek iş bulunmuyor.');
    const template = {
      id: crypto.randomUUID(),
      name: String(values.get('name')).trim(),
      weekday: Number(values.get('weekday')),
      blocks: source,
    };
    const parsed = planTemplatesSchema.safeParse([
      ...(current.planTemplates ?? []),
      template,
    ]);
    if (!parsed.success) throw Error(parsed.error.issues[0].message);
    if (
      await save(
        { ...current, planTemplates: parsed.data },
        'Gün şablonu kaydedildi',
      )
    )
      form.reset();
  }
  const gaps: { start: number; end: number }[] = [];
  let gapStart = 8 * 60;
  for (const block of [...activities]
    .filter(
      (item) =>
        item.status !== 'missed' &&
        item.status !== 'cancelled' &&
        !item.flexible &&
        item.end > 8 * 60 &&
        item.start < 22 * 60,
    )
    .sort((a, b) => a.start - b.start)) {
    if (block.start - gapStart >= 30)
      gaps.push({ start: gapStart, end: block.start });
    gapStart = Math.max(gapStart, block.end);
  }
  if (22 * 60 - gapStart >= 30) gaps.push({ start: gapStart, end: 22 * 60 });
  function outcome(block: TimeBlock, running: boolean) {
    if (date > today()) return null;
    return (
      <select
        className="plan-inline-outcome"
        aria-label={`${block.title} işinin sonucu`}
        value={block.status}
        disabled={disabled || running}
        onChange={(event) => {
          const status = event.target.value as TimeBlock['status'];
          void run(async () => {
            await save(
              setPlanOutcome(latest.current.state, date, block.id, status),
              'İşin sonucu kaydedildi',
            );
          });
        }}
      >
        <option value="planned">
          {block.status === 'planned' ? 'Sonuç…' : 'Bekleyenlere al'}
        </option>
        <option value="happened">Tamamlandı</option>
        <option value="missed">Yapılmadı</option>
        <option value="cancelled">Vazgeçildi</option>
      </select>
    );
  }
  function item(block: TimeBlock) {
    const running =
      state.timer?.planId === block.id && state.timer.planDate === date;
    const records = state.entries.filter((entry) => entry.planId === block.id);
    const actual = records.reduce(
      (sum, entry) => sum + (entry.seconds ?? 0),
      0,
    );
    return (
      <article
        className={
          'plan-item' + (block.status === 'happened' ? ' is-complete' : '')
        }
        key={block.id}
        data-plan-id={block.id}
      >
        <div className="plan-item-main">
          <button
            className={
              'plan-complete' + (block.status === 'happened' ? ' checked' : '')
            }
            aria-label={
              block.status === 'happened'
                ? `${block.title} tamamlamasını geri al`
                : `${block.title} tamamla`
            }
            disabled={disabled || date > today() || running}
            onClick={() =>
              void run(() =>
                upsert({
                  ...block,
                  status: block.status === 'happened' ? 'planned' : 'happened',
                }),
              )
            }
          >
            {block.status === 'happened' && <Check size={16} />}
          </button>
          <div className="plan-item-content">
            <button
              className="plan-title"
              onClick={() => {
                setLocalError('');
                setDraft(block);
              }}
              disabled={disabled}
            >
              {block.title}
            </button>
            <p>
              {block.flexible
                ? `Gün içinde · ${duration((block.end - block.start) * 60)}`
                : `${clock(block.start)}–${clock(block.end)}`}
              {block.place && (
                <>
                  {' '}
                  · <MapPin size={12} />
                  {block.place}
                </>
              )}
              {block.subject && (
                <>
                  {' '}
                  ·{' '}
                  {COURSES.find((course) => course.id === block.subject)
                    ?.name ?? block.subject}
                </>
              )}
            </p>
            {!!records.length && (
              <small>Kaydedilen süre {duration(actual)}</small>
            )}
            {records
              .filter(
                (record) =>
                  record.actualStartedAt !== undefined &&
                  record.actualEndedAt !== undefined,
              )
              .map((record) => (
                <small key={record.id}>
                  {new Date(record.actualStartedAt!).toLocaleString('tr-TR', {
                    timeZone: 'Europe/Istanbul',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  –{' '}
                  {new Date(record.actualEndedAt!).toLocaleString('tr-TR', {
                    timeZone: 'Europe/Istanbul',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </small>
              ))}
            {block.original && (
              <small>
                İlk plan {formatDate(block.original.date)} ·{' '}
                {block.original.flexible
                  ? `Gün içinde · ${duration((block.original.end - block.original.start) * 60)}`
                  : `${clock(block.original.start)}–${clock(block.original.end)}`}
              </small>
            )}
            {block.status === 'missed' && (
              <span className="plan-outcome-tag">
                <X size={13} />
                Yapılmadı
              </span>
            )}
            {block.status === 'cancelled' && (
              <span className="plan-outcome-tag">− Vazgeçildi</span>
            )}
          </div>
          {block.priority && (
            <Star className="plan-priority" size={16} fill="currentColor" />
          )}
          <button
            className="icon-button"
            aria-label={`${block.title} düzenle`}
            disabled={disabled}
            onClick={() => {
              setLocalError('');
              setDraft(block);
            }}
          >
            <Pencil size={16} />
          </button>
        </div>
        {block.status === 'planned' && (
          <div className="plan-item-actions">
            <button
              className="button secondary"
              disabled={
                disabled || date !== today() || (!!state.timer && !running)
              }
              onClick={() => void run(() => onStart(block))}
            >
              <Play size={14} />
              {running ? 'Sayaca dön' : 'Başla'}
            </button>
            <button
              className="text-button"
              disabled={disabled || running}
              onClick={() => setMoving(moving === block.id ? null : block.id)}
            >
              Ertele <ArrowRight size={14} />
            </button>
            {outcome(block, running)}
          </div>
        )}
        {block.status !== 'planned' && (
          <div className="plan-item-actions">{outcome(block, running)}</div>
        )}
        {moving === block.id && (
          <form
            className="plan-move-form"
            onSubmit={(event) => {
              event.preventDefault();
              const values = new FormData(event.currentTarget);
              void run(() =>
                move(
                  block,
                  String(values.get('date')),
                  block.flexible
                    ? undefined
                    : toMinutes(String(values.get('start'))),
                ),
              );
            }}
          >
            <Field label="Yeni gün">
              <input
                name="date"
                type="date"
                required
                defaultValue={date}
                autoFocus
              />
            </Field>
            {!block.flexible && (
              <Field label="Başlangıç">
                <input
                  name="start"
                  type="time"
                  required
                  defaultValue={clock(block.start)}
                />
              </Field>
            )}
            <button className="button secondary" disabled={disabled}>
              Taşı
            </button>
            <button
              type="button"
              className="text-button"
              disabled={disabled}
              onClick={() => void run(() => move(block, shiftDate(date, 1)))}
            >
              Yarına taşı
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setMoving(null)}
            >
              Vazgeç
            </button>
          </form>
        )}
      </article>
    );
  }
  const displayed = blocks
    .filter((block) => !block.flexible)
    .map((block) => (drag?.id === block.id ? drag : block));
  const dragClash = drag ? conflictingBlock(blocks, drag) : undefined;
  return (
    <div className="timeline-page">
      <div className="timeline-toolbar">
        <div className="date-nav">
          <button
            className="icon-button"
            aria-label="Önceki gün"
            disabled={disabled || dragging}
            onClick={() => onDate(shiftDate(date, -1))}
          >
            <ChevronLeft size={18} />
          </button>
          <input
            aria-label="Zaman çizelgesi günü"
            type="date"
            value={date}
            disabled={disabled || dragging}
            onChange={(event) => {
              if (dateSchema.safeParse(event.target.value).success)
                onDate(event.target.value);
            }}
          />
          <button
            className="icon-button"
            aria-label="Sonraki gün"
            disabled={disabled || dragging}
            onClick={() => onDate(shiftDate(date, 1))}
          >
            <ChevronRight size={18} />
          </button>
          {date !== today() && (
            <button className="text-button" onClick={() => onDate(today())}>
              Bugün
            </button>
          )}
        </div>
        <button
          className="button primary"
          disabled={disabled}
          onClick={() => add('activity')}
        >
          <Plus size={17} />
          İş ekle
        </button>
      </div>
      <div className="plan-view-controls">
        <div className="segmented">
          <button
            className={view === 'agenda' ? 'selected' : ''}
            onClick={() => setView('agenda')}
            aria-pressed={view === 'agenda'}
          >
            Gündem
          </button>
          <button
            className={view === 'timeline' ? 'selected' : ''}
            onClick={() => setView('timeline')}
            aria-pressed={view === 'timeline'}
          >
            Saat çizelgesi
          </button>
        </div>
      </div>
      <PlanDaySummary state={state} date={date} />
      <DailyStudyGoal state={state} date={date} />
      {!draft && (localError || error) && (
        <p role="alert" className="error-banner">
          {localError || error}
        </p>
      )}
      {preview && (
        <section className="card plan-example">
          <div className="card-heading">
            <h2>Örnek plan · henüz kaydedilmedi</h2>
          </div>
          {preview.map((block) => (
            <p key={block.id}>
              {clock(block.start)}–{clock(block.end)} · {block.title}
            </p>
          ))}
          <div className="plan-item-actions">
            <button
              className="button primary"
              disabled={disabled}
              onClick={() =>
                void run(async () => {
                  if (
                    await store(
                      [
                        ...(latest.current.state.days[date]?.blocks ?? []),
                        ...preview,
                      ],
                      'Örnek plan eklendi',
                    )
                  )
                    setPreview(null);
                })
              }
            >
              Bu planı ekle
            </button>
            <button
              className="text-button"
              disabled={disabled}
              onClick={() => setPreview(null)}
            >
              Vazgeç
            </button>
          </div>
        </section>
      )}
      {next && (
        <section className="card plan-next">
          <div>
            <span className="little-label">
              {date === today() ? 'SIRADAKİ ADIM' : 'GÜNÜN İŞİ'}
            </span>
            <h2>{next.title}</h2>
            <p>
              {next.flexible
                ? `Gün içinde · ${duration((next.end - next.start) * 60)}`
                : `${clock(next.start)}–${clock(next.end)}`}
              {next.place ? ` · ${next.place}` : ''}
            </p>
          </div>
          <button
            className="button primary"
            disabled={
              disabled ||
              date !== today() ||
              (!!state.timer && state.timer.planId !== next.id)
            }
            onClick={() => void run(() => onStart(next))}
          >
            <Play size={16} />
            {state.timer?.planId === next.id && state.timer.planDate === date
              ? 'Sayaca dön'
              : 'Başla'}
          </button>
        </section>
      )}
      {view === 'agenda' && (
        <section className="card plan-agenda">
          {!!priorities.length && (
            <div className="plan-group">
              <h2>
                <Star size={17} />
                Günün öncelikleri
              </h2>
              {priorities.map(item)}
            </div>
          )}
          {!!scheduled.length && (
            <div className="plan-group">
              <h2>
                <Clock3 size={17} />
                Saatli işler
              </h2>
              {scheduled.map(item)}
            </div>
          )}
          {!!flexible.length && (
            <div className="plan-group">
              <h2>
                <Layers size={17} />
                Gün içinde
              </h2>
              {flexible.map(item)}
            </div>
          )}
          {!pending.length && (
            <div className="plan-empty">
              <Check size={26} />
              <h2>
                {activities.length || moved.length
                  ? 'Bekleyen işin kalmadı'
                  : 'Bugün neye yer açacaksın?'}
              </h2>
              <p>
                {activities.length || moved.length
                  ? 'İşlerin sonuçlarını aşağıdaki bölümlerden görebilirsin.'
                  : 'Bir iş ve ayırmak istediğin süreyle başla.'}
              </p>
              {!activities.length && !moved.length && (
                <button
                  className="button secondary"
                  onClick={() => add('activity')}
                >
                  <Plus size={16} />
                  İlk işini ekle
                </button>
              )}
            </div>
          )}
          {!!completed.length && (
            <details className="plan-completed">
              <summary>Tamamlananlar · {completed.length}</summary>
              {completed.map(item)}
            </details>
          )}
          {!!closed.length && (
            <details className="plan-closed">
              <summary>Yapılmadı / vazgeçildi · {closed.length}</summary>
              {closed.map(item)}
            </details>
          )}
          {!!moved.length && (
            <details className="plan-closed">
              <summary>Başka güne ertelenenler · {moved.length}</summary>
              {moved.map(({ block, to }) => (
                <div key={block.id} className="plan-moved-item">
                  <div>
                    <strong>{block.title}</strong>
                    <small>{formatDate(to)} gününe taşındı</small>
                  </div>
                  <button className="text-button" onClick={() => onDate(to)}>
                    Günü aç <ArrowRight size={14} />
                  </button>
                </div>
              ))}
            </details>
          )}
        </section>
      )}
      {date === today() && (
        <PlanBacklog
          state={state}
          save={save}
          disabled={disabled}
          onEditing={setBacklogEditing}
        />
      )}
      {view === 'timeline' && (
        <section
          className={
            'card timeline-card' + (!locations ? ' activity-only' : '')
          }
        >
          <div className="card-heading">
            <h2>{formatDate(date, true)}</h2>
            <div className="timeline-jump">
              {[
                { label: 'Sabah', hour: 7 },
                { label: 'Öğlen', hour: 12 },
                { label: 'Akşam', hour: 18 },
              ].map((jump) => (
                <button
                  key={jump.label}
                  onClick={() =>
                    scrollRef.current?.scrollTo({
                      top: jump.hour * 60 * PX,
                      behavior: 'smooth',
                    })
                  }
                >
                  {jump.label}
                </button>
              ))}
            </div>
          </div>
          <div className="plan-location-controls">
            <label className="timeline-check">
              <input
                type="checkbox"
                checked={locations}
                onChange={(event) => setLocations(event.target.checked)}
              />
              Konum sütununu göster
              {blocks.some((block) => block.lane === 'location')
                ? ` · ${blocks.filter((block) => block.lane === 'location').length} kayıt`
                : ''}
            </label>
            {locations && (
              <button className="text-button" onClick={() => add('location')}>
                <MapPin size={15} />
                Konum ekle
              </button>
            )}
          </div>
          <div className="timeline-column-headings">
            <span>Saat</span>
            {locations && (
              <strong>
                <MapPin size={15} />
                Neredeyim?
              </strong>
            )}
            <strong>
              <Layers size={15} />
              İşlerim
            </strong>
          </div>
          <div
            className={'timeline-scroll' + (dragging ? ' is-dragging' : '')}
            ref={scrollRef}
            aria-label="Günlük zaman çizelgesi"
          >
            <div className="timeline-board" style={{ height: 1440 * PX + 24 }}>
              <div className="timeline-hours">
                {Array.from({ length: 25 }, (_, hour) => (
                  <span key={hour} style={{ top: hour * 60 * PX }}>
                    {clock(hour * 60)}
                  </span>
                ))}
              </div>
              {(locations
                ? (['location', 'activity'] as const)
                : (['activity'] as const)
              ).map((lane) => (
                <div
                  className={'timeline-lane ' + lane}
                  key={lane}
                  data-lane={lane}
                  style={{ height: 1440 * PX }}
                  onDoubleClick={(event) => {
                    if (event.target !== event.currentTarget || disabled)
                      return;
                    const start = Math.max(
                      0,
                      Math.min(
                        1395,
                        Math.floor(
                          (event.clientY -
                            event.currentTarget.getBoundingClientRect().top) /
                            PX /
                            15,
                        ) * 15,
                      ),
                    );
                    add(lane, start, start + 45);
                  }}
                >
                  {displayed
                    .filter((block) => block.lane === lane)
                    .map((block) => (
                      <article
                        key={block.id}
                        data-block-id={block.id}
                        className={`time-block category-${block.category} ${block.status} ${drag?.id === block.id ? 'moving' : ''} ${drag?.id === block.id && dragClash ? 'conflict' : ''} ${block.end - block.start < 45 ? 'compact' : ''}`}
                        style={{
                          top: block.start * PX,
                          height: (block.end - block.start) * PX,
                        }}
                        title={`${block.title} · ${clock(block.start)}–${clock(block.end)}`}
                      >
                        <button
                          className="block-resize top"
                          disabled={disabled}
                          aria-label={`${block.title} başlangıcını değiştir`}
                          onPointerDown={(event) =>
                            beginDrag(event, block, 'start')
                          }
                          onKeyDown={(event) => {
                            if (
                              event.key === 'ArrowUp' ||
                              event.key === 'ArrowDown'
                            ) {
                              event.preventDefault();
                              void run(() =>
                                upsert(
                                  adjustBlock(
                                    block,
                                    'start',
                                    event.key === 'ArrowUp' ? -15 : 15,
                                  ),
                                ),
                              );
                            }
                          }}
                        />
                        <div className="block-content">
                          <button
                            className="block-edit"
                            aria-label={`${block.title} bloğunu düzenle`}
                            disabled={disabled}
                            onClick={() => {
                              setLocalError('');
                              setDraft(block);
                            }}
                          >
                            <strong>{block.title}</strong>
                            <span>
                              {clock(block.start)}–{clock(block.end)}
                            </span>
                            {block.end - block.start >= 60 && (
                              <small>
                                {block.status === 'happened'
                                  ? 'Tamamlandı'
                                  : 'Plan'}
                              </small>
                            )}
                          </button>
                          <button
                            className="block-move"
                            disabled={disabled}
                            aria-label={`${block.title} bloğunu taşı`}
                            onPointerDown={(event) =>
                              beginDrag(event, block, 'move')
                            }
                            onKeyDown={(event) => {
                              if (
                                event.key === 'ArrowUp' ||
                                event.key === 'ArrowDown'
                              ) {
                                event.preventDefault();
                                void run(() =>
                                  upsert(
                                    adjustBlock(
                                      block,
                                      'move',
                                      (event.key === 'ArrowUp' ? -1 : 1) *
                                        (event.shiftKey ? 60 : 15),
                                    ),
                                  ),
                                );
                              }
                            }}
                          >
                            <GripVertical size={16} />
                          </button>
                        </div>
                        <button
                          className="block-resize bottom"
                          disabled={disabled}
                          aria-label={`${block.title} bitişini değiştir`}
                          onPointerDown={(event) =>
                            beginDrag(event, block, 'end')
                          }
                          onKeyDown={(event) => {
                            if (
                              event.key === 'ArrowUp' ||
                              event.key === 'ArrowDown'
                            ) {
                              event.preventDefault();
                              void run(() =>
                                upsert(
                                  adjustBlock(
                                    block,
                                    'end',
                                    event.key === 'ArrowUp' ? -15 : 15,
                                  ),
                                ),
                              );
                            }
                          }}
                        />
                      </article>
                    ))}
                </div>
              ))}
            </div>
          </div>
          <p className="helper timeline-instructions">
            Bloğa dokunarak düzenle. Tutamaçla taşı, kenarlardan süreyi
            değiştir. Saatler 15 dakikalık adımlara yerleşir.
          </p>
          {!!flexible.length && (
            <button className="text-button" onClick={() => setView('agenda')}>
              {pending.filter((block) => block.flexible).length} esnek işi
              gündemde gör <ArrowRight size={15} />
            </button>
          )}
        </section>
      )}
      <section className="card plan-gaps">
        <div className="card-heading">
          <div>
            <h2>Planındaki boş aralıklar</h2>
            <p>08.00–22.00 · saatli işler arasında</p>
          </div>
        </div>
        <div>
          {gaps.length ? (
            gaps.map((gap) => (
              <button
                className="button secondary"
                key={gap.start}
                disabled={disabled}
                onClick={() =>
                  add('activity', gap.start, Math.min(gap.end, gap.start + 45))
                }
              >
                {clock(gap.start)}–{clock(gap.end)} <Plus size={14} />
              </button>
            ))
          ) : (
            <p className="helper">
              Bu aralıkta en az 30 dakikalık boşluk bulunmuyor.
            </p>
          )}
        </div>
        {!!pending.filter((block) => block.flexible).length && (
          <p className="helper">Gün içindeki esnek işler için de zaman ayır.</p>
        )}
      </section>
      <details className="card plan-tools">
        <summary>
          <CalendarDays size={18} />
          Şablonlar ve günü kopyalama
        </summary>
        <div className="plan-template-list">
          {(state.planTemplates ?? []).map((template) => (
            <div key={template.id}>
              <span>
                <strong>{template.name}</strong>
                <small>
                  {WEEKDAYS[template.weekday]} · {template.blocks.length} blok
                </small>
              </span>
              <div className="plan-template-actions">
                <button
                  className="button secondary"
                  disabled={disabled}
                  onClick={() =>
                    void run(async () => {
                      await save(
                        applyPlanTemplate(
                          latest.current.state,
                          date,
                          template.id,
                        ),
                        'Şablon bu güne eklendi',
                      );
                    })
                  }
                >
                  Bu güne uygula
                </button>
                <button
                  className="icon-button danger"
                  aria-label={`${template.name} şablonunu sil`}
                  disabled={disabled}
                  onClick={() => {
                    if (confirm('Bu gün şablonu silinsin mi?'))
                      void run(async () => {
                        const current = latest.current.state;
                        await save(
                          {
                            ...current,
                            planTemplates: (current.planTemplates ?? []).filter(
                              (item) => item.id !== template.id,
                            ),
                          },
                          'Şablon silindi',
                        );
                      });
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {!!blocks.length && (
          <>
            <form
              className="plan-template-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                void run(() => saveTemplate(form));
              }}
            >
              <h3>Bu günü şablon olarak sakla</h3>
              <Field label="Şablon adı">
                <input
                  name="name"
                  required
                  maxLength={100}
                  placeholder="Örn. Pazartesi ders programım"
                />
              </Field>
              <Field label="Haftanın günü">
                <select
                  name="weekday"
                  defaultValue={new Date(date + 'T12:00Z').getUTCDay()}
                >
                  {WEEKDAYS.map((name, index) => (
                    <option value={index} key={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
              <button className="button secondary" disabled={disabled}>
                <Check size={16} />
                Şablonu kaydet
              </button>
            </form>
            <div className="timeline-copy">
              <div>
                <h3>Başka güne kopyala</h3>
              </div>
              <Field label="Kopyalanacak gün">
                <input
                  type="date"
                  value={copyDate}
                  onChange={(event) => setCopyDate(event.target.value)}
                />
              </Field>
              <button
                className="button secondary"
                disabled={disabled}
                onClick={() => void run(copy)}
              >
                <Copy size={16} />
                Güne kopyala
              </button>
            </div>
          </>
        )}
        {!blocks.length && !(state.planTemplates ?? []).length && (
          <div className="plan-empty">
            <p>
              İş ekledikten sonra gününü tekrar kullanabileceğin bir şablon
              olarak saklayabilirsin.
            </p>
            <button
              className="text-button"
              disabled={disabled}
              onClick={() => setPreview(dayExample())}
            >
              Örnek günü incele
            </button>
          </div>
        )}
      </details>
      {draft && (
        <BlockDialog
          key={draft.id ?? 'new'}
          draft={draft}
          date={date}
          state={state}
          saving={disabled}
          errorMessage={localError || error}
          onClose={() => {
            setDraft(null);
            setLocalError('');
          }}
          onSave={async (block) => {
            if (busy.current) return false;
            busy.current = true;
            setWorking(true);
            try {
              return await upsert(block);
            } catch (cause) {
              setLocalError(
                cause instanceof Error ? cause.message : 'İş kaydedilemedi.',
              );
              return false;
            } finally {
              busy.current = false;
              setWorking(false);
            }
          }}
          onDelete={
            draft.id
              ? async () => {
                  if (confirm('Bu plan kaydı silinsin mi?'))
                    await run(async () => {
                      const currentBlocks =
                        latest.current.state.days[date]?.blocks ?? [];
                      if (
                        latest.current.state.timer?.planId === draft.id &&
                        latest.current.state.timer?.planDate === date
                      ) {
                        throw Error(
                          'Bu işi silmeden önce devam eden oturumu bitir.',
                        );
                      }
                      if (
                        await store(
                          currentBlocks.filter(
                            (block) => block.id !== draft.id,
                          ),
                          'Plan kaydı silindi',
                        )
                      ) {
                        setDraft(null);
                        setLocalError('');
                      }
                    });
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
