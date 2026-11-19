import { course, subjectName, decimal } from './lib/display';
import Empty from './components/Empty';
import FocusView from './components/FocusView';
import GoalsView from './components/GoalsView';
import CoursesView from './components/CoursesView';
import { LEARNING } from './lib/study';
import { Field } from './components/FormFields';
import EntryForm from './components/EntryForm';
import DayForm from './components/DayForm';
import ReadingForm from './components/ReadingForm';
import GoalsForm from './components/GoalsForm';
import { goalsForWeek, goalsFromForm, scheduleGoals } from './lib/goals';
import SettingsView from './components/SettingsView';
import { sortExams } from './lib/exams';
import { clearReadingDay } from './lib/reading';
import { version as appVersion } from '../package.json';
import { demoState } from './lib/demo';
import Timeline from './Timeline';
import { recordPlanSession, startPlanTimer } from './lib/plan-actions';
import PlanWeekResults from './components/PlanResults';
import LearningsCard, { WeekLearningsCard } from './components/LearningsCard';
import { updateLearnings, type LearningAction } from './lib/learnings';
import type { TimeBlock } from './lib/timeline';

import Habits, { HabitWeekOverview } from './Habits';
import { getPatch } from './lib/patch';
import { fetchJson } from './lib/api';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  LayoutDashboard,
  Timer,
  ChartNoAxesCombined,
  BookOpen,
  Target,
  Plus,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowRight,
  Play,
  X,
  Moon,
  Sun,
  Smile,
  BookOpenText,
  Clock3,
  Check,
  Pencil,
  Trash2,
  RefreshCw,
  CalendarDays,
  Activity,
  CircleHelp,
  CloudCheck,
  LoaderCircle,
  Sprout,
  CalendarRange,
  Settings,
  Menu,
  CloudAlert,
} from 'lucide-react';
import {
  COURSES,
  blankDay,
  dateSchema,
  duration,
  elapsed,
  entrySchema,
  daySchema,
  examSchema,
  formatDate,
  getSleepHours,
  getSleepError,
  shiftDate,
  summarise,
  today,
  weekStart,
  type TrackerState,
  type Entry,
  type Day,
  type Exam,
} from './lib/model';

type Modal =
  | { type: 'entry'; entry?: Entry; fromTimer?: boolean; timerId?: string }
  | { type: 'day' }
  | { type: 'reading' }
  | { type: 'goals' }
  | { type: 'exam'; exam?: Exam }
  | { type: 'activities' }
  | { type: 'navigation' }
  | null;
const NAV_ITEMS = [
  { id: 'today', label: 'Günüm', icon: LayoutDashboard },
  { id: 'planner', label: 'Gün planı', icon: CalendarRange },
  { id: 'focus', label: 'Odaklan', icon: Timer },
  { id: 'habits', label: 'Alışkanlıklar', icon: Sprout },
  { id: 'review', label: 'Haftalık bakış', icon: ChartNoAxesCombined },
  { id: 'courses', label: 'Dersler & takvim', icon: BookOpen },
  { id: 'goals', label: 'Hedeflerim', icon: Target },
  { id: 'settings', label: 'Hesap ve ayarlar', icon: Settings },
];
type StateResponse = { data: TrackerState; revision: number; error?: string };

const numberOrNull = (s: string) => (s === '' ? null : Number(s));

export default function Tracker({ demo = false }: { demo?: boolean }) {
  const [data, setData] = useState<TrackerState | null>(null),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [syncError, setSyncError] = useState('');
  const [deletedEntries, setDeletedEntries] = useState<
    { entry: Entry; index: number }[]
  >([]);
  const [tab, setTab] = useState(() =>
      new URLSearchParams(location.search).get('bolum') === 'gun-plani'
        ? 'planner'
        : new URLSearchParams(location.search).get('bolum') === 'hedefler'
          ? 'goals'
          : 'today',
    ),
    [date, setDate] = useState(today),
    [week, setWeek] = useState(() => weekStart(today())),
    [modal, setModal] = useState<Modal>(() =>
      demo && new URLSearchParams(location.search).get('duzenle') === '1'
        ? { type: 'goals' }
        : null,
    ),
    [now, setNow] = useState(Date.now());
  const [timerKind, setTimerKind] = useState<'study' | 'activity'>('study'),
    [timerSubject, setTimerSubject] = useState('de'),
    [timerMode, setTimerMode] = useState<'free' | 'pomo'>('free');
  const [habitEditing, setHabitEditing] = useState(false);
  useEffect(() => {
    history.replaceState(
      null,
      '',
      location.pathname + location.search,
    );
  }, [tab]);
  const busy = useRef(false),
    editing = useRef(false),
    loadingInFlight = useRef(false),
    loadAbort = useRef<AbortController | null>(null),
    inFlightSeq = useRef(0),
    stateSeq = useRef(0),
    latest = useRef({ data, revision });
  latest.current = { data, revision };
  editing.current = !!modal || habitEditing;
  const closeModal = useCallback(() => {
    setModal(null);
    setError('');
  }, []);
  const cancelInFlightLoad = useCallback(() => {
    inFlightSeq.current++;
    loadingInFlight.current = false;
    const controller = loadAbort.current;
    loadAbort.current = null;
    controller?.abort();
  }, []);
  const load = useCallback(
    async (silent = false, force = false, restart = false) => {
      if (demo) {
        setData(
          (current) =>
            current ??
            demoState(
              new URLSearchParams(location.search).get('bolum') === 'gun-plani',
              new URLSearchParams(location.search).get('bolum') === 'hedefler',
            ),
        );
        setLoading(false);
        return true;
      }
      if (
        (busy.current && !force) ||
        (silent && editing.current && !force) ||
        (loadingInFlight.current && !force && !restart)
      )
        return false;
      if (loadingInFlight.current) cancelInFlightLoad();
      loadingInFlight.current = true;
      const controller = new AbortController();
      loadAbort.current = controller;
      const loadId = ++inFlightSeq.current,
        seq = ++stateSeq.current;
      if (!silent) setLoading(true);
      try {
        const { response: r, data: p } = await fetchJson<StateResponse>(
          '/api/state',
          { cache: 'no-store', signal: controller.signal },
          'Kayıtlar yüklenemedi.',
          15000,
        );
        if (r.status === 401)
          window.dispatchEvent(new Event('ritim-session-expired'));
        if (!r.ok) throw Error(p.error);
        if (!p.data || !Number.isSafeInteger(p.revision))
          throw Error('Kayıtlar yüklenemedi. Sunucudan geçerli bir yanıt alınamadı.');
        if (
          seq !== stateSeq.current ||
          (!force && (busy.current || (silent && editing.current)))
        )
          return false;
        setData(p.data);
        setRevision(p.revision);
        latest.current = { data: p.data, revision: p.revision };
        setError('');
        setSyncError('');
        return true;
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'Kayıtlar yüklenemedi.';
        if (seq === stateSeq.current) {
          setSyncError(message);
          if (force || !(silent && editing.current)) setError(message);
        }
        return false;
      } finally {
        if (loadId === inFlightSeq.current) {
          loadingInFlight.current = false;
          loadAbort.current = null;
          setLoading(false);
        }
      }
    },
    [demo, cancelInFlightLoad],
  );
  useEffect(() => {
    load();
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') load(true);
    }, 30000);
    const visible = () => {
      if (document.visibilityState === 'visible') load(true);
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearInterval(timer);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', visible);
      cancelInFlightLoad();
    };
  }, [load, cancelInFlightLoad]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!modal) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const items = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary',
        ) ?? [],
      ).filter((el) => el.getClientRects().length > 0);
    items()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy.current) {
        closeModal();
        return;
      }
      if (e.key === 'Tab') {
        const list = items(),
          first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', key);
      previousFocus?.focus();
    };
  }, [modal, closeModal]);
  async function save(next: TrackerState, message = 'Kaydedildi') {
    if (demo) {
      const nextRevision = latest.current.revision + 1;
      setData(next);
      setRevision(nextRevision);
      latest.current = { data: next, revision: nextRevision };
      setError('');
      setToast('Önizleme · ' + message);
      return true;
    }
    if (busy.current) return false;
    busy.current = true;
    stateSeq.current++;
    cancelInFlightLoad();
    setSaving(true);
    setError('');
    try {
      const { response: r, data: p } = await fetchJson<{ revision: number }>('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patch: getPatch(latest.current.data!, next),
          revision: latest.current.revision,
        }),
      }, 'Kaydedilemedi.');
      if (r.status === 401)
        window.dispatchEvent(new Event('ritim-session-expired'));
      if (r.status === 409) {
        const refreshed = await load(true, true);
        if (refreshed) {
          setError(
            (p.error || 'Kayıtlar başka bir sekmede veya cihazda değişti.') +
              ' Bu değişikliğin kaydedilmedi. Güncel kayıtlar yüklendi; kontrol edip yeniden dene.',
          );
        }
        return false;
      }
      if (!r.ok) throw Error(p.error);
      if (!Number.isSafeInteger(p.revision))
        throw Error('Kaydetme sonucu doğrulanamadı. Kayıtlarını yenileyip kontrol et.');
      setData(next);
      setRevision(p.revision);
      latest.current = { data: next, revision: p.revision };
      setSyncError('');
      setToast(message);
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Kaydedilemedi.';
      setError(message);
      setSyncError(message);
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  function navigate(next: string) {
    setTab(next);
    closeModal();
    window.scrollTo({ top: 0 });
  }
  function changeDate(next: string) {
    if (!dateSchema.safeParse(next).success) return;
    setDate(next);
    setWeek(weekStart(next));
  }
  async function logout() {
    if (demo) {
      location.assign('/');
      return;
    }
    try {
      const r = await fetch('/api/logout', { method: 'POST' });
      if (!r.ok) throw Error();
      window.dispatchEvent(new Event('ritim-session-expired'));
    } catch {
      setError('Çıkış yapılamadı. Yeniden dene.');
    }
  }
  function exportData() {
    if (!data) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { exportedAt: new Date().toISOString(), revision, data },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `ritim-yedek-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (loading && !data)
    return (
      <main className="load-screen">
        <span className="brand-mark">r.</span>
        <h1>Ritim</h1>
        <p>Kayıtların yükleniyor…</p>
        {error && (
          <>
            <p role="alert">{error}</p>
            <button onClick={() => load(false, false, true)}>Yeniden dene</button>
            <button
              onClick={() =>
                window.dispatchEvent(new Event('ritim-session-expired'))
              }
            >
              Giriş yap
            </button>
          </>
        )}
      </main>
    );
  if (!data)
    return (
      <main className="load-screen">
        <h1>Bağlantı kurulamadı</h1>
        <p role="alert">{error}</p>
        <button onClick={() => load(false, false, true)}>Yeniden dene</button>
      </main>
    );
  const state = data;
  const day = state.days[date] ?? blankDay(),
    isFutureDay = date > today(),
    daily = summarise(state, date, date),
    weekEnd = shiftDate(week, 6),
    report = summarise(state, week, weekEnd),
    previous = summarise(state, shiftDate(week, -7), shiftDate(week, -1));
  const syncLabel = demo
    ? 'Önizleme'
    : saving
      ? 'Kaydediliyor…'
      : syncError
        ? 'Eşitleme hatası'
        : 'Kayıtlar güncel';
  const timer = state.timer,
    elapsedMs = elapsed(timer, now),
    timerReady = !!timer && timer.mode === 'pomo' && elapsedMs >= 1500000;
  const exams = sortExams(state.exams);
  const upcoming = exams.filter(
    (e) => !e.start || (e.end || e.start) >= today(),
  );
  const weekGoals = goalsForWeek(state, week);
  function openEntry(entry?: Entry, fromTimer = false, timerId?: string) {
    setModal({ type: 'entry', entry, fromTimer, timerId });
  }
  async function changeLearning(action: LearningAction) {
    if (busy.current || isFutureDay) return false;
    try {
      const current = latest.current.data!;
      return await save(
        updateLearnings(current, date, action),
        action.type === 'remove' ? 'Öğrenme maddesi silindi' : 'Öğrenme maddesi kaydedildi',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Öğrenme maddesi kaydedilemedi.');
      return false;
    }
  }
  async function removeEntry(entry: Entry) {
    if (busy.current) return;
    const current = latest.current.data!;
    const index = current.entries.findIndex((e) => e.id === entry.id),
      stored = current.entries[index];
    if (!stored) return;
    if (
      !confirm(
        `${formatDate(stored.date, true)} · ${subjectName(stored)}${stored.topic ? ' · ' + stored.topic : ''}: yalnızca bu kayıt silinsin mi?`,
      )
    )
      return;
    if (
      await save(
        {
          ...current,
          entries: current.entries.filter((e) => e.id !== stored.id),
        },
        'Kayıt silindi',
      )
    ) {
      setToast('');
      setDeletedEntries((items) => [...items, { entry: stored, index }]);
    }
  }
  async function undoEntry(item: { entry: Entry; index: number }) {
    if (busy.current) return;
    const current = latest.current.data!;
    if (current.entries.some((e) => e.id === item.entry.id)) {
      setError(
        'Bu kayıt zaten mevcut. Güncel kaydı korumak için geri yüklenmedi.',
      );
      return;
    }
    const entries = [...current.entries];
    entries.splice(Math.min(item.index, entries.length), 0, item.entry);
    if (await save({ ...current, entries }, 'Kayıt geri alındı'))
      setDeletedEntries((items) =>
        items.filter((i) => i.entry.id !== item.entry.id),
      );
  }
  async function submitEntry(form: HTMLFormElement) {
    const f = new FormData(form),
      fromTimer = modal?.type === 'entry' && modal.fromTimer,
      old =
        modal?.type === 'entry' && !modal.fromTimer ? modal.entry : undefined;
    const current = latest.current.data!;
    if (fromTimer) {
      if (!current.timer) {
        setError(
          'Bu sayaç başka bir cihazda veya sekmede zaten sonlandırılmış. Kayıtların güncel durumunu kontrol et.',
        );
        return;
      }
      if (modal.timerId && current.timer.id !== modal.timerId) {
        setError(
          'Başka bir cihazda veya sekmede yeni bir sayaç başlatılmış. Mevcut sayacı korumak için bu form kaydedilmedi.',
        );
        return;
      }
    }
    const linked = fromTimer ? current.timer : old;
    const kind = String(f.get('kind')) as Entry['kind'];
    const parsed = entrySchema.safeParse({
      id: old?.id ?? crypto.randomUUID(),
      date: f.get('date'),
      kind,
      subject: f.get('subject'),
      seconds:
        kind === 'activity' && f.get('durationMode') === 'unknown'
          ? null
          : Math.round(Number(f.get('minutes')) * 60),
      topic: f.get('topic') ?? '',
      method: kind === 'study' ? (f.get('method') ?? '') : '',
      focus:
        kind === 'study' ? numberOrNull(String(f.get('focus') ?? '')) : null,
      learning: kind === 'study' ? (f.get('learning') ?? '') : '',
      result: f.get('result') ?? '',
      attempted:
        kind === 'study'
          ? numberOrNull(String(f.get('attempted') ?? ''))
          : null,
      correct:
        kind === 'study' ? numberOrNull(String(f.get('correct') ?? '')) : null,
      obstacle: f.get('obstacle') ?? '',
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (parsed.data.date > today()) {
      setError('Gelecek bir güne oturum kaydı ekleyemezsin.');
      return;
    }
    const draftEntry = modal?.type === 'entry' ? modal.entry : undefined;
    const entry = {
      ...parsed.data,
      ...(linked?.planId && linked.planDate
        ? { planId: linked.planId, planDate: linked.planDate }
        : {}),
      ...(draftEntry?.actualStartedAt !== undefined &&
      draftEntry.actualEndedAt !== undefined
        ? {
            actualStartedAt: draftEntry.actualStartedAt,
            actualEndedAt: draftEntry.actualEndedAt,
          }
        : {}),
    };
    const next = {
      ...current,
      entries: old
        ? current.entries.map((e) => (e.id === old.id ? entry : e))
        : [...current.entries, entry],
      timer: fromTimer ? null : current.timer,
    };
    try {
      const result = fromTimer
        ? recordPlanSession(current, entry, String(f.get('planOutcome') ?? ''))
        : next;
      if (await save(result)) setModal(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Kayıt tamamlanamadı.');
    }
  }
  async function clearReading(form: HTMLFormElement) {
    if (date > today()) {
      setError('Gelecek bir güne okuma kaydı ekleyemezsin.');
      return;
    }
    const current = { ...blankDay(), ...latest.current.data!.days[date] };
    if (
      !confirm(
        `${formatDate(date, true)} için okuma kaydı silinsin mi? ${current.pages ?? 0} sayfalık günlük toplam ve kitap adı kaldırılacak. Uyku, enerji, notlar ve diğer günler korunur.`,
      )
    )
      return;
    const next = clearReadingDay(current);
    if (
      await save(
        {
          ...latest.current.data!,
          days: { ...latest.current.data!.days, [date]: next },
        },
        'Okuma kaydı silindi',
      )
    ) {
      (form.elements.namedItem('pages') as HTMLInputElement).value = '';
      (form.elements.namedItem('book') as HTMLInputElement).value = '';
    }
  }
  async function submitDay(form: HTMLFormElement) {
    if (date > today()) {
      setError('Gelecek bir güne günlük kaydı ekleyemezsin.');
      return;
    }
    const f = new FormData(form),
      current = latest.current.data!;
    const next: Day = {
      ...blankDay(),
      ...current.days[date],
      bedtime: String(f.get('bedtime')),
      wake: String(f.get('wake')),
      sleepDate: String(f.get('sleepDate')),
      amEnergy: numberOrNull(String(f.get('amEnergy'))),
      amMood: numberOrNull(String(f.get('amMood'))),
      pmEnergy: numberOrNull(String(f.get('pmEnergy'))),
      pmMood: numberOrNull(String(f.get('pmMood'))),
      notes: String(f.get('notes')),
    };
    const parsedDay = daySchema.safeParse(next);
    if (!parsedDay.success) {
      setError(parsedDay.error.issues[0].message);
      return;
    }
    const sleepError = getSleepError(next, date);
    if (sleepError) {
      setError(sleepError);
      return;
    }
    if (
      await save({
        ...current,
        days: { ...current.days, [date]: parsedDay.data },
      })
    )
      setModal(null);
  }
  async function submitReading(form: HTMLFormElement) {
    if (date > today()) {
      setError('Gelecek bir güne okuma kaydı ekleyemezsin.');
      return;
    }
    const f = new FormData(form),
      current = latest.current.data!;
    const next = {
      ...blankDay(),
      ...current.days[date],
      pages: numberOrNull(String(f.get('pages'))),
      book: String(f.get('book')),
    };
    const parsedDay = daySchema.safeParse(next);
    if (!parsedDay.success) {
      setError(parsedDay.error.issues[0].message);
      return;
    }
    if (
      await save(
        { ...current, days: { ...current.days, [date]: parsedDay.data } },
        'Okuma kaydı kaydedildi',
      )
    )
      setModal(null);
  }
  async function submitGoals(form: HTMLFormElement) {
    try {
      const goal = goalsFromForm(new FormData(form));
      if (
        await save(
          scheduleGoals(latest.current.data!, goal),
          'Hedef dönemin kaydedildi',
        )
      )
        setModal(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Hedefler kaydedilemedi.',
      );
    }
  }
  async function submitExam(form: HTMLFormElement) {
    const f = new FormData(form),
      old = modal?.type === 'exam' ? modal.exam : undefined;
    const parsed = examSchema.safeParse({
      id: old?.id ?? crypto.randomUUID(),
      course: f.get('course'),
      label: f.get('label'),
      start: f.get('start'),
      end: f.get('end'),
      note: f.get('note'),
      source: old?.source ?? 'Kişisel kayıt',
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    const current = latest.current.data!;
    if (
      await save({
        ...current,
        exams: old
          ? current.exams.map((e) => (e.id === old.id ? parsed.data : e))
          : [...current.exams, parsed.data],
      })
    )
      setModal(null);
  }
  async function startTimer(form: HTMLFormElement) {
    const current = latest.current.data!;
    if (current.timer) return;
    const f = new FormData(form);
    await save(
      {
        ...current,
        timer: {
          id: crypto.randomUUID(),
          kind: timerKind,
          subject: timerSubject,
          topic: String(f.get('topic')),
          method: timerKind === 'study' ? String(f.get('method')) : '',
          mode: timerMode,
          accumulated: 0,
          runningSince: Date.now(),
          startedAt: Date.now(),
          date: today(),
        },
      },
      'Sayaç başladı',
    );
  }
  async function startPlannedBlock(block: TimeBlock) {
    const current = latest.current.data!;
    if (current.timer?.planId === block.id && current.timer.planDate === date) {
      navigate('focus');
      return;
    }
    // Timeline.run awaits this callback and displays plan validation errors.
    const next = startPlanTimer(current, date, block.id);
    if (await save(next, 'Planlanan iş başladı')) navigate('focus');
  }
  async function toggleTimer() {
    const current = latest.current.data!,
      active = current.timer;
    if (!active) return;
    await save(
      {
        ...current,
        timer: {
          ...active,
          accumulated: elapsed(active),
          runningSince: active.runningSince !== null ? null : Date.now(),
        },
      },
      active.runningSince === null ? 'Sayaç devam ediyor' : 'Sayaç duraklatıldı',
    );
  }
  async function finishTimer() {
    const current = latest.current.data!,
      active = current.timer;
    if (!active) return;
    const finishedAt = Date.now(),
      ms = elapsed(active, finishedAt);
    if (ms < 1000) {
      setError('Kaydetmek için en az bir saniye çalışmalısın.');
      return;
    }
    const paused = { ...active, accumulated: ms, runningSince: null };
    if (
      active.runningSince !== null &&
      !(await save(
        { ...current, timer: paused },
        'Süre hazır; oturumunu tamamla',
      ))
    )
      return;
    openEntry(
      {
        ...(active.startedAt !== undefined
          ? { actualStartedAt: active.startedAt, actualEndedAt: finishedAt }
          : {}),
        id: crypto.randomUUID(),
        date: active.date,
        kind: active.kind,
        subject: active.subject,
        seconds: Math.max(1, Math.round(ms / 1000)),
        topic: active.topic,
        method: active.method,
        focus: null,
        learning: '',
        result: '',
        attempted: null,
        correct: null,
        obstacle: '',
      },
      true,
      active.id,
    );
  }
  function entryList(entries: Entry[]) {
    return entries.length ? (
      <div className="entry-list">
        {[...entries].reverse().map((e) => (
          <div className="entry-row" key={e.id} data-entry-id={e.id}>
            <span
              className="entry-icon"
              style={{
                background:
                  e.kind === 'study'
                    ? (course(e.subject)?.color ?? '#389789') + '19'
                    : '#f2ece3',
                color:
                  e.kind === 'study' ? course(e.subject)?.color : '#997b54',
              }}
            >
              {e.kind === 'study' ? (
                <BookOpen size={18} />
              ) : (
                <Activity size={18} />
              )}
            </span>
            <div className="entry-description">
              <strong>{subjectName(e)}</strong>
              <span>{e.topic || e.method || 'Faaliyet kaydı'}</span>
              {e.result && <small>{e.result}</small>}
              <div className="tags">
                {e.focus !== null && <span>Odak {e.focus}/5</span>}
                {e.learning && <span>{LEARNING[e.learning]}</span>}
                {e.attempted !== null && e.correct !== null && (
                  <span>
                    {e.correct}/{e.attempted} yardımsız
                  </span>
                )}
              </div>
            </div>
            <strong
              className="entry-time"
              style={{ maxWidth: 90, whiteSpace: 'normal', textAlign: 'right' }}
            >
              {e.seconds === null ? 'Süre belirtilmedi' : duration(e.seconds)}
            </strong>
            <div className="entry-actions">
              <button
                className="entry-action"
                disabled={saving}
                onClick={() => openEntry(e)}
              >
                <Pencil size={15} aria-hidden="true" />
                Düzenle
              </button>
              <button
                className="entry-action danger"
                disabled={saving}
                onClick={() => removeEntry(e)}
              >
                <Trash2 size={15} aria-hidden="true" />
                Sil
              </button>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <Empty>
        Bu gün için henüz kayıt yok. Kayıt ekle ile başlayabilirsin.
      </Empty>
    );
  }
  function examCard(e: Exam) {
    return (
      <div className="exam" key={e.id}>
        <span className="exam-date">
          {e.start ? (
            <>
              <strong>{new Date(e.start + 'T12:00Z').getUTCDate()}</strong>
              <small>
                {new Date(e.start + 'T12:00Z').toLocaleDateString('tr-TR', {
                  month: 'short',
                })}
              </small>
            </>
          ) : (
            <CalendarDays size={23} />
          )}
        </span>
        <div>
          <strong>{course(e.course)?.name ?? e.course}</strong>
          <p>{e.label}</p>
          <small>
            {e.start
              ? `${formatDate(e.start)}${e.end && e.end !== e.start ? ' – ' + formatDate(e.end) + ' · Gün kesinleşmedi' : ''}`
              : 'Gün kesinleşmedi'}
          </small>
        </div>
        <button
          className="icon-button"
          aria-label="Sınavı düzenle"
          onClick={() => setModal({ type: 'exam', exam: e })}
        >
          <Pencil size={15} />
        </button>
      </div>
    );
  }
  function weekChart() {
    const max = Math.max(
      3600,
      ...Array.from({ length: 7 }, (_, i) => {
        const s = summarise(state, shiftDate(week, i), shiftDate(week, i));
        return s.studySeconds + s.activitySeconds;
      }),
    );
    return (
      <div className="week-chart">
        {Array.from({ length: 7 }, (_, i) => {
          const d = shiftDate(week, i),
            s = summarise(state, d, d);
          return (
            <div
              key={d}
              className={d === today() ? 'chart-day is-today' : 'chart-day'}
            >
              <small>
                {s.studySeconds + s.activitySeconds
                  ? duration(s.studySeconds + s.activitySeconds)
                  : s.untimedActivities
                    ? 'Süresiz kayıt'
                    : '—'}
              </small>
              <div
                className="bar-track"
                title={`${formatDate(d)}: Ders ${duration(s.studySeconds)}, diğer ${duration(s.activitySeconds)}${s.untimedActivities ? ` · ${s.untimedActivities} süresiz faaliyet` : ''}`}
              >
                <div className="bar-stack">
                  <i
                    className="bar-activity"
                    style={{ height: `${(s.activitySeconds / max) * 120}px` }}
                  />
                  <i
                    className="bar-study"
                    style={{ height: `${(s.studySeconds / max) * 120}px` }}
                  />
                </div>
              </div>
              <button
                onClick={() => {
                  changeDate(d);
                  navigate('today');
                }}
              >
                {new Date(d + 'T12:00Z').toLocaleDateString('tr-TR', {
                  weekday: 'short',
                })}
                <span>{new Date(d + 'T12:00Z').getUTCDate()}</span>
              </button>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href={demo ? '/onizleme' : '/'}
          aria-label="Ritim ana sayfa"
        >
          <span className="brand-mark">r.</span>
          <span>
            ritim<small>kendine zaman ayır.</small>
          </span>
        </a>
        <span className="nav-label">KİŞİSEL ALANIN</span>
        <nav aria-label="Ana menü">
          {NAV_ITEMS.map((n) => (
            <button
              key={n.id}
              aria-label={n.label}
              title={n.label}
              aria-current={tab === n.id ? 'page' : undefined}
              className={`nav-item ${n.id === 'planner' ? 'planner-nav' : ''} ${tab === n.id ? 'active' : ''} ${['habits', 'review', 'courses', 'settings'].includes(n.id) ? 'secondary-nav' : ''}`}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === 'focus' && timer && <i className="live-dot" />}
            </button>
          ))}
          <button
            className="nav-item mobile-more"
            aria-label="Diğer bölümler"
            onClick={() => setModal({ type: 'navigation' })}
          >
            <Menu size={19} />
            <span>Diğer</span>
          </button>
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <span>
            Kişisel takip{' '}
            <span className="crumb">
              / {NAV_ITEMS.find((n) => n.id === tab)?.label}
            </span>
          </span>
          <div className="sync">
            <button
              className={`sync-status ${syncError ? 'sync-failed' : ''}`}
              onClick={() => navigate('settings')}
              aria-label={`${syncLabel} · Hesap ve ayarlar`}
            >
              <span role="status" aria-live="polite">
                {saving ? (
                  <LoaderCircle size={15} className="spin" />
                ) : syncError ? (
                  <CloudAlert size={15} />
                ) : (
                  <CloudCheck size={15} />
                )}{' '}
                {syncLabel}
              </span>
            </button>
            {!demo && (
              <button
                className="icon-button"
                disabled={saving}
                aria-label="Kayıtları yenile"
                onClick={() => load(true, false, true)}
              >
                <RefreshCw size={16} />
              </button>
            )}
          </div>
        </header>
        <div className="page-content">
          {demo && (
            <section className="demo-banner" role="status">
              <div>
                <strong>Önizleme · örnek veriler</strong>
                <p>
                  Buradaki işlemler gerçek hesabını okumaz veya değiştirmez.
                  Sayfayı yenilemek örneği başa alır.
                </p>
              </div>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  const next = demoState(
                    new URLSearchParams(location.search).get('bolum') ===
                      'gun-plani',
                    new URLSearchParams(location.search).get('bolum') ===
                      'hedefler',
                  );
                  setData(next);
                  setRevision(0);
                  latest.current = { data: next, revision: 0 };
                  setDeletedEntries([]);
                  setToast('');
                  setError('');
                }}
              >
                Demoyu başa al
              </button>
              <a className="text-button" href="/">
                Gerçek Ritim’e dön
              </a>
            </section>
          )}
          {!modal && error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                onClick={() => setError('')}
                aria-label="Uyarıyı kapat"
              >
                <X size={17} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <h1>
                {
                  (
                    {
                      today:
                        date === today()
                          ? 'Bugün nasıl gidiyor?'
                          : 'Gününe bir bakış',
                      planner: 'Gün planı',
                      focus: 'Şimdi, odaklanma zamanı.',
                      habits: 'Alışkanlıklarına yer aç.',
                      review: 'Haftana bir bakış.',
                      courses: 'Derslerin, bir arada.',
                      goals: 'Hedeflerim',
                      settings: 'Hesap ve ayarlar',
                    } as Record<string, string>
                  )[tab]
                }
              </h1>
              {tab !== 'today' && tab !== 'planner' && (
                <p>
                  {
                    (
                      {
                        planner:
                          'Konumlarını ve faaliyetlerini çizelgeye ekle, planlanan ve gerçekleşen zamanları gör.',
                        focus:
                          'Serbest sayaç veya 25 dakikalık Pomodoro ile çalışma süreni kaydet.',
                        habits:
                          'Kazanmak, azaltmak veya değiştirmek istediğin davranışları kaydet.',
                        review:
                          'Bu haftanın süreleri, öğrenme notları ve günlük kayıtları.',
                        courses:
                          'Derslere göre çalışma sürelerin ve sınav takvimin.',
                        goals:
                          'Haftalık ders süresi ve günlük okuma, uyku hedeflerin.',
                        settings:
                          'Görünüm, faaliyet kategorileri ve veri işlemleri.',
                      } as Record<string, string>
                    )[tab]
                  }
                </p>
              )}
            </div>
          </div>
          {tab === 'planner' && (
            <Timeline
              state={state}
              date={date}
              onDate={changeDate}
              save={save}
              saving={saving}
              onEditing={setHabitEditing}
              error={error}
              onStart={startPlannedBlock}
            />
          )}
          {tab === 'habits' && (
            <Habits
              state={state}
              date={date}
              onDate={changeDate}
              save={save}
              saving={saving}
              error={error}
              onEditing={setHabitEditing}
            />
          )}
          {tab === 'today' && (
            <>
              <section className="card daily-records">
                <div className="date-toolbar">
                  <div className="date-nav">
                    <button
                      className="icon-button"
                      aria-label="Önceki gün"
                      onClick={() => changeDate(shiftDate(date, -1))}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <label>
                      <CalendarDays size={16} />
                      <input
                        aria-label="Görüntülenen gün"
                        type="date"
                        value={date}
                        max={today()}
                        onChange={(e) => changeDate(e.target.value)}
                      />
                    </label>
                    <button
                      className="icon-button"
                      aria-label="Sonraki gün"
                      disabled={date >= today()}
                      onClick={() => changeDate(shiftDate(date, 1))}
                    >
                      <ChevronRight size={18} />
                    </button>
                    {date !== today() && (
                      <button
                        className="text-button"
                        onClick={() => changeDate(today())}
                      >
                        Bugün
                      </button>
                    )}
                  </div>
                  <button
                    className="button primary"
                    disabled={isFutureDay}
                    onClick={() => openEntry()}
                  >
                    <Plus size={17} />
                    Kayıt ekle
                  </button>
                </div>
                {isFutureDay && (
                  <p className="helper">
                    Gelecek günler için yalnızca Gün planı ve Hedeflerim
                    kullanılabilir.
                  </p>
                )}
                <div className="card-heading">
                  <div>
                    <h2>Günün kayıtları</h2>
                    <p>{formatDate(date, true)}</p>
                  </div>
                  <span className="pill">{daily.entries.length} kayıt</span>
                </div>
                {entryList(daily.entries)}
                {day.notes && (
                  <div className="daily-note">
                    <strong>Gün notun</strong>
                    <p>{day.notes}</p>
                  </div>
                )}
              </section>

              <section className="stats-grid">
                <Stat
                  icon={<BookOpen size={19} />}
                  label="Ders çalışma"
                  value={duration(daily.studySeconds)}
                  note={`${daily.study.length} kayıtlı oturum`}
                  color="green"
                />
                <Stat
                  icon={<Clock3 size={19} />}
                  label="Ders dışı zaman"
                  value={
                    daily.activityCount > 0 &&
                    daily.activityCount === daily.untimedActivities
                      ? 'Süre bilinmiyor'
                      : duration(daily.activitySeconds)
                  }
                  note={
                    daily.untimedActivities
                      ? `${daily.activityCount} faaliyet · ${daily.untimedActivities} süresiz kayıt`
                      : 'Kaydettiğin faaliyetler'
                  }
                  color="purple"
                />
                <Stat
                  icon={<Moon size={19} />}
                  label="Uyku"
                  value={
                    getSleepHours(day, date) === null
                      ? '—'
                      : `${decimal(getSleepHours(day, date)!)} sa`
                  }
                  note={
                    day.bedtime && day.wake && day.sleepDate
                      ? `${formatDate(day.sleepDate)} ${day.bedtime} → ${formatDate(date)} ${day.wake}`
                      : day.bedtime || day.wake
                        ? 'Eksik uyku kaydı · tamamlayabilirsin'
                        : 'Kalktığın güne kaydedilir'
                  }
                  color="blue"
                />
                <Stat
                  icon={<BookOpenText size={19} />}
                  label="Kitap okuma"
                  value={day.pages === null ? '—' : `${day.pages} sayfa`}
                  note={day.book || 'Günlük sayfa toplamı'}
                  color="peach"
                />
              </section>
              <button
                className="habit-home-link planner-home-link"
                onClick={() => navigate('planner')}
              >
                <CalendarRange size={21} />
                <div>
                  <strong>Gün planı</strong>
                  <span>
                    {day.blocks?.length
                      ? `${day.blocks.length} plan kaydı · gündemi aç`
                      : 'Önceliklerini ve gün içindeki işlerini planla.'}
                  </span>
                </div>
                <ArrowRight size={17} />
              </button>
              <div className="dashboard-grid">
                <section className="card chart-card">
                  <div className="card-heading">
                    <div>
                      <h2>Haftanın ritmi</h2>
                      <p>
                        {formatDate(week)} – {formatDate(weekEnd)}
                      </p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate('review')}
                    >
                      Detaylar <ArrowUpRight size={15} />
                    </button>
                  </div>
                  {weekChart()}
                  <div className="chart-legend">
                    <span>
                      <i className="green-dot" />
                      Ders çalışma
                    </span>
                    <span>
                      <i className="purple-dot" />
                      Diğer faaliyetler
                    </span>
                    <small>
                      {report.untimedActivities
                        ? `${report.untimedActivities} süresiz faaliyet süre toplamına dahil değil`
                        : 'Yalnızca kaydettiğin süreler'}
                    </small>
                  </div>
                </section>
                <section className="card checkin-card">
                  <div className="card-heading">
                    <div>
                      <h2>Enerji ve ruh hâli</h2>
                      <p>Sabah ve akşam puanların · 1–5</p>
                    </div>
                    <Smile size={21} />
                  </div>
                  <div className="checkin-row">
                    <Sun size={20} />
                    <div>
                      <strong>Sabah</strong>
                      <small>
                        Enerji{' '}
                        {day.amEnergy === null ? '—' : day.amEnergy + '/5'}{' '}
                        <span>·</span> Ruh hâli{' '}
                        {day.amMood === null ? '—' : day.amMood + '/5'}
                      </small>
                    </div>
                    <span
                      className={
                        day.amEnergy !== null || day.amMood !== null
                          ? 'check-circle done'
                          : 'check-circle'
                      }
                    >
                      {day.amEnergy !== null || day.amMood !== null ? (
                        <Check size={13} />
                      ) : (
                        <Plus size={13} />
                      )}
                    </span>
                  </div>
                  <div className="checkin-row">
                    <Moon size={20} />
                    <div>
                      <strong>Akşam</strong>
                      <small>
                        Enerji{' '}
                        {day.pmEnergy === null ? '—' : day.pmEnergy + '/5'}{' '}
                        <span>·</span> Ruh hâli{' '}
                        {day.pmMood === null ? '—' : day.pmMood + '/5'}
                      </small>
                    </div>
                    <span
                      className={
                        day.pmEnergy !== null || day.pmMood !== null
                          ? 'check-circle done'
                          : 'check-circle'
                      }
                    >
                      {day.pmEnergy !== null || day.pmMood !== null ? (
                        <Check size={13} />
                      ) : (
                        <Plus size={13} />
                      )}
                    </span>
                  </div>
                  <button
                    className="button secondary full"
                    disabled={isFutureDay}
                    onClick={() => setModal({ type: 'day' })}
                  >
                    <Plus size={16} />
                    Günlüğümü doldur
                  </button>
                </section>
              </div>
              <section className="card">
                <div className="card-heading">
                  <div>
                    <h2>Ufukta neler var?</h2>
                    <p>Yaklaşan sınav ve teslimler</p>
                  </div>
                  <CalendarDays size={20} />
                </div>
                {upcoming.slice(0, 3).map(examCard)}
                {!upcoming.length && <Empty>Yaklaşan sınav kaydı yok.</Empty>}
                <button
                  className="text-button card-link"
                  onClick={() => navigate('courses')}
                >
                  Takvimi aç <ArrowRight size={16} />
                </button>
              </section>
              <section className="card reading-card">
                <div className="card-heading">
                  <div>
                    <h2>Kitap okuma</h2>
                    <p>{formatDate(date, true)}</p>
                  </div>
                  <BookOpenText size={21} />
                </div>
                <p className="reading-total">
                  {day.pages === null
                    ? 'Henüz sayfa kaydetmedin'
                    : `${day.pages} sayfa`}
                </p>
                {day.book && <p className="reading-book">{day.book}</p>}
                <button
                  className="button secondary full"
                  disabled={isFutureDay}
                  onClick={() => setModal({ type: 'reading' })}
                >
                  {day.pages !== null || day.book ? (
                    <Pencil size={16} />
                  ) : (
                    <Plus size={16} />
                  )}
                  {day.pages !== null || day.book
                    ? 'Okuma kaydını düzenle'
                    : 'Okuma kaydı ekle'}
                </button>
              </section>
              {!!state.habits.length && (
                <button
                  className="habit-home-link"
                  onClick={() => navigate('habits')}
                >
                  <Sprout size={21} />
                  <div>
                    <strong>Alışkanlıklarına küçük bir alan aç.</strong>
                    <span>
                      Günün planını ve kazanma / bırakma kayıtlarını gör.
                    </span>
                  </div>
                  <ArrowRight size={17} />
                </button>
              )}
              {timer && (
                <button
                  className="focus-strip"
                  onClick={() => navigate('focus')}
                >
                  <span className="focus-strip-icon">
                    <Play size={19} />
                  </span>
                  <div>
                    <strong>Devam eden oturum</strong>
                    <span>
                      {subjectName(timer)} · {duration(elapsedMs / 1000)}
                    </span>
                  </div>
                  <span>
                    Sayaca dön <ArrowRight size={17} />
                  </span>
                </button>
              )}
              <LearningsCard
                key={date}
                items={day.learnings ?? []}
                activities={state.activities}
                isFutureDay={isFutureDay}
                saving={saving}
                onChange={changeLearning}
              />
            </>
          )}
          {tab === 'focus' && (
            <FocusView
              state={state}
              timer={timer}
              elapsedMs={elapsedMs}
              timerReady={timerReady}
              timerMode={timerMode}
              timerKind={timerKind}
              timerSubject={timerSubject}
              saving={saving}
              setTimerMode={setTimerMode}
              setTimerKind={setTimerKind}
              setTimerSubject={setTimerSubject}
              toggleTimer={toggleTimer}
              finishTimer={finishTimer}
              startTimer={startTimer}
              onManualEntry={() => openEntry()}
              onCancel={async () => {
                if (confirm('Bu sayacı kaydetmeden iptal etmek istiyor musun?'))
                  await save(
                    { ...latest.current.data!, timer: null },
                    'Sayaç iptal edildi',
                  );
              }}
            />
          )}
          {tab === 'review' && (
            <>
              <div className="date-toolbar">
                <div className="date-nav">
                  <button
                    className="icon-button"
                    aria-label="Önceki hafta"
                    onClick={() => setWeek(shiftDate(week, -7))}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <strong>
                    {formatDate(week)} – {formatDate(weekEnd)}
                  </strong>
                  <button
                    className="icon-button"
                    aria-label="Sonraki hafta"
                    onClick={() => setWeek(shiftDate(week, 7))}
                  >
                    <ChevronRight size={18} />
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setWeek(weekStart(today()))}
                  >
                    Bu hafta
                  </button>
                </div>
              </div>
              <WeekLearningsCard state={state} week={week} />
              <section className="stats-grid">
                <Stat
                  label="Ders çalışma"
                  value={duration(report.studySeconds)}
                  note={
                    previous.study.length
                      ? `Önceki hafta: ${duration(previous.studySeconds)}`
                      : 'Önceki hafta karşılaştırılacak kayıt yok'
                  }
                  icon={<BookOpen size={19} />}
                  color="green"
                />
                <Stat
                  label="Ortalama odak"
                  value={
                    report.focus === null ? '—' : `${decimal(report.focus)} / 5`
                  }
                  note={`${report.focusCount} değerlendirilmiş oturum · özbildirim`}
                  icon={<Target size={19} />}
                  color="purple"
                />
                <Stat
                  label="Yardımsız çözülen"
                  value={
                    report.attempted
                      ? `${Math.round((report.correct / report.attempted) * 100)}%`
                      : '—'
                  }
                  note={`${report.correct}/${report.attempted} soru · ${report.questionSessions} oturum`}
                  icon={<Check size={19} />}
                  color="blue"
                />
                <Stat
                  label="Okunan sayfa"
                  value={String(report.pages)}
                  note={`${report.pageDays} gün okuma kaydı`}
                  icon={<BookOpenText size={19} />}
                  color="peach"
                />
              </section>
              <section className="card">
                <div className="card-heading">
                  <div>
                    <h2>Zamanının dağılımı</h2>
                    <p>
                      Yalnızca süresi bilinen kayıtlar
                      {report.untimedActivities
                        ? ` · ayrıca ${report.untimedActivities} süresiz faaliyet`
                        : ''}
                    </p>
                  </div>
                  <span className="pill">
                    Toplam{' '}
                    {duration(report.studySeconds + report.activitySeconds)}
                  </span>
                </div>
                {weekChart()}
                <div className="chart-legend">
                  <span>
                    <i className="green-dot" />
                    Ders çalışma
                  </span>
                  <span>
                    <i className="purple-dot" />
                    Diğer faaliyetler
                  </span>
                </div>
              </section>
              <PlanWeekResults
                state={state}
                week={week}
                onDate={(next) => {
                  changeDate(next);
                  navigate('planner');
                }}
              />
              <section className="card report-table-card">
                <div className="card-heading">
                  <div>
                    <h2>Çalışman sana ne kattı?</h2>
                    <p>
                      Odak puanı ve öğrenme sonucu birbirinden ayrı
                      değerlendirilir.
                    </p>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Ders</th>
                        <th>Süre / hedef</th>
                        <th>Odak</th>
                        <th>Öğrenme notu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {COURSES.map((c) => {
                        const es = report.study.filter(
                            (e) => e.subject === c.id,
                          ),
                          seconds = es.reduce(
                            (a, e) => a + (e.seconds ?? 0),
                            0,
                          ),
                          scores = es.filter((e) => e.focus !== null),
                          go = weekGoals?.courseHours[c.id],
                          ls = es.filter((e) => e.learning);
                        return (
                          <tr key={c.id}>
                            <td>
                              <i
                                className="course-dot"
                                style={{ background: c.color }}
                              />
                              {c.name}
                              <small>{es.length} oturum</small>
                            </td>
                            <td>
                              {duration(seconds)}
                              <small>
                                {go === undefined
                                  ? 'Hedef yok'
                                  : `${decimal(go)} sa hedef · %${Math.round(go > 0 ? (seconds / (go * 3600)) * 100 : 0)}`}
                              </small>
                              {go !== undefined && go > 0 && (
                                <progress max={go * 3600} value={seconds} />
                              )}
                            </td>
                            <td>
                              {scores.length
                                ? `${decimal(scores.reduce((a, e) => a + e.focus!, 0) / scores.length)}/5`
                                : '—'}
                              <small>{scores.length} değerlendirme</small>
                            </td>
                            <td>
                              {ls.length ? (
                                <>
                                  {
                                    ls.filter(
                                      (e) => e.learning === 'independent',
                                    ).length
                                  }{' '}
                                  yardımsız{' '}
                                  <small>
                                    {
                                      ls.filter((e) => e.learning === 'partial')
                                        .length
                                    }{' '}
                                    kısmen ·{' '}
                                    {
                                      ls.filter((e) => e.learning === 'stuck')
                                        .length
                                    }{' '}
                                    takıldım
                                  </small>
                                </>
                              ) : (
                                <span className="muted">Henüz not yok</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
              <div className="equal-grid">
                <section className="card">
                  <div className="card-heading">
                    <div>
                      <h2>Ders dışındaki hayat</h2>
                      <p>Kaydettiğin faaliyetler</p>
                    </div>
                  </div>
                  {Array.from(
                    new Set(
                      report.entries
                        .filter((e) => e.kind === 'activity')
                        .map((e) => e.subject),
                    ),
                  ).map((a) => {
                    const es = report.entries.filter(
                        (e) => e.kind === 'activity' && e.subject === a,
                      ),
                      secs = es.reduce((s, e) => s + (e.seconds ?? 0), 0),
                      unknown = es.filter((e) => e.seconds === null).length;
                    return (
                      <div className="activity-bar" key={a}>
                        <div>
                          <span>{a}</span>
                          <strong>
                            {unknown === es.length
                              ? 'Süre belirtilmedi'
                              : duration(secs)}
                          </strong>
                        </div>
                        {unknown > 0 && (
                          <p className="helper">
                            {unknown} süresiz kayıt · süre toplamına dahil değil
                          </p>
                        )}
                        {secs > 0 && (
                          <progress
                            max={report.activitySeconds || 1}
                            value={secs}
                          />
                        )}
                      </div>
                    );
                  })}
                  {!report.activityCount && (
                    <Empty>Bu hafta ders dışı faaliyet kaydı yok.</Empty>
                  )}
                </section>
                <section className="card">
                  <div className="card-heading">
                    <div>
                      <h2>Enerjin & günlük yaşamın</h2>
                      <p>
                        Uyku kalkış gününe aittir. Tamamlanmamış kayıtlar
                        ortalamaya katılmaz.
                      </p>
                    </div>
                  </div>
                  <div className="wellbeing-line">
                    <Moon size={18} />
                    <span>Ortalama uyku</span>
                    <strong>
                      {report.sleep === null
                        ? '—'
                        : `${decimal(report.sleep)} sa`}
                    </strong>
                    <small>{report.sleepDays} gün</small>
                  </div>
                  {(['amEnergy', 'amMood', 'pmEnergy', 'pmMood'] as const).map(
                    (k, i) => {
                      const vs = Object.entries(state.days)
                        .filter(
                          ([d, v]) =>
                            d >= week && d <= weekEnd && v[k] !== null,
                        )
                        .map(([, v]) => v[k]!);
                      return (
                        <div className="wellbeing-line" key={k}>
                          {i < 2 ? <Sun size={18} /> : <Moon size={18} />}
                          <span>
                            {
                              [
                                'Sabah enerji',
                                'Sabah ruh hâli',
                                'Akşam enerji',
                                'Akşam ruh hâli',
                              ][i]
                            }
                          </span>
                          <strong>
                            {vs.length
                              ? decimal(
                                  vs.reduce((a, b) => a + b, 0) / vs.length,
                                ) + '/5'
                              : '—'}
                          </strong>
                          <small>{vs.length} gün</small>
                        </div>
                      );
                    },
                  )}
                </section>
              </div>
              <HabitWeekOverview state={state} week={week} />
              <section className="reflection">
                <CircleHelp size={24} />
                <div>
                  <h2>Gelecek hafta neyi farklı deneyebilirsin?</h2>
                  <p>
                    {report.study.some((e) => e.learning === 'stuck')
                      ? 'Takıldığını işaretlediğin oturumlar var. Notlarını gözden geçir; aynı konuda daha küçük bir soru veya yardımsız bir deneme ile neyin eksik kaldığını gör.'
                      : 'Bir oturumun sonunda notlarına bakmadan küçük bir uygulama dene ve sonucunu kaydet. Böylece ayırdığın sürenin sana ne kattığını daha iyi görebilirsin.'}
                  </p>
                  <small>
                    Bu ekran kayıtlarını özetler; öğrenme ve ruh hâli puanları
                    özbildirimdir. Eksik kayıtlar tüm haftayı temsil
                    etmeyebilir.
                  </small>
                </div>
              </section>
            </>
          )}
          {tab === 'courses' && (
            <CoursesView
              state={state}
              exams={exams}
              examCard={examCard}
              onAddExam={() => setModal({ type: 'exam' })}
              onStudyCourse={(id) => {
                setTimerKind('study');
                setTimerSubject(id);
                navigate('focus');
              }}
            />
          )}
          {tab === 'goals' && (
            <GoalsView
              state={state}
              day={day}
              date={date}
              onEditGoals={() => setModal({ type: 'goals' })}
            />
          )}
          {tab === 'settings' && (
            <SettingsView
              state={state}
              revision={revision}
              demo={demo}
              saving={saving}
              syncError={syncError}
              syncLabel={syncLabel}
              exportData={exportData}
              logout={logout}
              onEditActivities={() => setModal({ type: 'activities' })}
              reload={load}
            />
          )}
          <footer>
            Ritim <span className="app-version">v{appVersion}</span>{' '}
            <span>·</span> Kendi temponda, her gün biraz daha farkında.{' '}
            <span className="footer-zone">Saat dilimi: İstanbul</span>
          </footer>
        </div>
      </main>
      {!modal && !habitEditing && (
        <div className="record-notices" aria-label="Kayıt bildirimleri">
          {deletedEntries.map((item) => (
            <div className="record-notice" key={item.entry.id} role="status">
              <Check size={17} aria-hidden="true" />
              <div>
                <strong>Kayıt silindi</strong>
                <small>
                  {formatDate(item.entry.date)} · {subjectName(item.entry)}
                  {item.entry.topic ? ' · ' + item.entry.topic : ''}
                </small>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => undoEntry(item)}
              >
                Geri al
              </button>
              <button
                type="button"
                className="notice-close"
                aria-label="Silme bildirimini kapat"
                disabled={saving}
                onClick={() =>
                  setDeletedEntries((items) =>
                    items.filter((i) => i.entry.id !== item.entry.id),
                  )
                }
              >
                <X size={17} />
              </button>
            </div>
          ))}
          {toast && (
            <div className="record-notice" role="status">
              <Check size={17} aria-hidden="true" />
              {toast}
            </div>
          )}
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) closeModal();
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <header>
              <div>
                <span className="little-label">KÜÇÜK BİR KAYIT</span>
                <h2 id="modal-title">
                  {modal.type === 'entry'
                    ? modal.entry && !modal.fromTimer
                      ? 'Oturumu düzenle'
                      : 'Zamanını kaydet'
                    : modal.type === 'day'
                      ? `${formatDate(date)} · Günlüğün`
                      : modal.type === 'goals'
                        ? 'Hedeflerini belirle'
                        : modal.type === 'exam'
                          ? 'Sınav veya teslim tarihi'
                          : modal.type === 'reading'
                            ? `${formatDate(date)} · Kitap okuma`
                            : modal.type === 'navigation'
                              ? 'Diğer bölümler'
                              : 'Faaliyet kategorileri'}
                </h2>
              </div>
              <button
                className="icon-button"
                disabled={saving}
                aria-label="Pencereyi kapat"
                onClick={closeModal}
              >
                <X size={21} />
              </button>
            </header>
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            {modal.type === 'navigation' && (
              <nav className="section-menu" aria-label="Diğer bölümler">
                {NAV_ITEMS.filter((n) =>
                  ['habits', 'review', 'courses', 'settings'].includes(n.id),
                ).map((n) => (
                  <button
                    className="button secondary"
                    key={n.id}
                    onClick={() => navigate(n.id)}
                  >
                    <n.icon size={20} />
                    {n.label}
                    <ArrowRight size={18} />
                  </button>
                ))}
              </nav>
            )}
            {modal.type === 'entry' && (
              <EntryForm
                state={state}
                entry={modal.entry}
                date={date}
                saving={saving}
                submit={submitEntry}
                planTitle={
                  modal.fromTimer && state.timer?.planId
                    ? state.timer.topic
                    : undefined
                }
              />
            )}
            {modal.type === 'reading' && (
              <ReadingForm
                day={day}
                saving={saving}
                submit={submitReading}
                clearReading={clearReading}
              />
            )}
            {modal.type === 'day' && (
              <DayForm
                day={day}
                date={date}
                saving={saving}
                submit={submitDay}
              />
            )}
            {modal.type === 'goals' && (
              <GoalsForm
                state={state}
                date={date}
                saving={saving}
                submit={submitGoals}
                onRefreshDraft={() => setError('')}
              />
            )}
            {modal.type === 'exam' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitExam(e.currentTarget);
                }}
              >
                <Field label="Ders">
                  <select
                    name="course"
                    defaultValue={modal.exam?.course ?? 'de'}
                  >
                    {COURSES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Sınav / teslim adı">
                  <input
                    required
                    name="label"
                    defaultValue={modal.exam?.label ?? ''}
                    maxLength={200}
                    placeholder="Örn. Vize veya proje teslimi"
                  />
                </Field>
                <div className="form-grid">
                  <Field label="Tarih / aralık başlangıcı">
                    <input
                      name="start"
                      type="date"
                      defaultValue={modal.exam?.start ?? ''}
                    />
                  </Field>
                  <Field label="Aralık bitişi · isteğe bağlı">
                    <input
                      name="end"
                      type="date"
                      defaultValue={modal.exam?.end ?? ''}
                    />
                  </Field>
                </div>
                <p className="helper">
                  Günü bilmiyorsan tarihi boş bırak. Tek gün kesinleştiğinde
                  aralık bitişini boşalt.
                </p>
                <Field label="Not / saat / kaynak bilgisi">
                  <textarea
                    name="note"
                    rows={3}
                    maxLength={2000}
                    defaultValue={modal.exam?.note ?? ''}
                  />
                </Field>
                <button className="button primary full" disabled={saving}>
                  Tarihi kaydet
                </button>
                {modal.exam && (
                  <button
                    type="button"
                    className="text-button danger"
                    disabled={saving}
                    onClick={async () => {
                      const current = latest.current.data!;
                      if (
                        confirm('Bu takvim kaydını silmek istiyor musun?') &&
                        (await save(
                          {
                            ...current,
                            exams: current.exams.filter(
                              (e) => e.id !== modal.exam?.id,
                            ),
                          },
                          'Takvim kaydı silindi',
                        ))
                      )
                        setModal(null);
                    }}
                  >
                    Bu tarihi sil
                  </button>
                )}
              </form>
            )}
            {modal.type === 'activities' && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget),
                    activities = Array.from(
                      new Set(
                        String(f.get('activities'))
                          .split('\n')
                          .map((a) => a.trim())
                          .filter(Boolean),
                      ),
                    );
                  if (
                    !activities.length ||
                    activities.length > 50 ||
                    activities.some((a) => a.length > 100)
                  ) {
                    setError(
                      'Her satıra bir faaliyet kategorisi yaz. 1–50 faaliyet, her biri en fazla 100 karakter olabilir.',
                    );
                    return;
                  }
                  if (await save({ ...latest.current.data!, activities })) {
                    setModal(null);
                    if (timerKind === 'activity')
                      setTimerSubject(activities[0]);
                  }
                }}
              >
                <Field
                  label="Her satıra bir faaliyet kategorisi yaz"
                  hint="Bir kategoriyi listeden çıkarmak eski kayıtlarını silmez."
                >
                  <textarea
                    name="activities"
                    rows={10}
                    defaultValue={state.activities.join('\n')}
                  />
                </Field>
                <button className="button primary full" disabled={saving}>
                  Kategorileri kaydet
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  note,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
  color: string;
}) {
  return (
    <article className={'stat-card ' + color}>
      <div>
        <span className="stat-label">{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <p title={note}>{note}</p>
    </article>
  );
}
