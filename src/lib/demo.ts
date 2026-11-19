import { blankDay, initialState, shiftDate, today, weekStart } from './model';
import { scheduleGoals } from './goals';
import { movePlanBlock } from './plan-actions';
export function demoState(planner = false, goals = false) {
  let state = initialState();
  state.days[today()] = {
    ...blankDay(),
    pages: 3,
    book: 'Örnek kitap',
    notes: 'Bunlar yalnızca önizleme verileridir.',
    learnings: [
      {
        id: 'demo-learning-fourier',
        text: 'Fourier serisinin periyodik sinyallerde neden ayrık spektrum verdiğini öğrendim.',
        tag: 'ss',
      },
      {
        id: 'demo-learning-break',
        text: 'Kısa bir yürüyüşten sonra çalışmaya daha kolay dönebildiğimi öğrendim.',
      },
    ],
  };
  if (planner || goals) {
    const base = {
      lane: 'activity' as const,
      category: 'study' as const,
      status: 'planned' as const,
      approximate: false,
      notes: '',
    };
    state.days[today()].blocks = [
      {
        ...base,
        id: 'demo-trip',
        title: 'Okula yolculuk',
        category: 'chores',
        subject: 'Diğer',
        start: 510,
        end: 540,
        status: 'happened',
      },
      {
        ...base,
        id: 'demo-class',
        title: 'Differential Equations dersi',
        subject: 'de',
        place: 'Okul',
        start: 540,
        end: 630,
        status: 'happened',
      },
      {
        ...base,
        id: 'demo-fourier',
        title: 'Fourier serilerinden 5 soru çöz',
        subject: 'ss',
        place: 'Kütüphane',
        start: 660,
        end: 705,
        priority: true,
      },
      {
        ...base,
        id: 'demo-linear',
        title: 'Lineer cebirden takıldığın 3 soruyu tekrar çöz',
        subject: 'la',
        place: 'Kütüphane',
        start: 840,
        end: 900,
        priority: true,
      },
      {
        ...base,
        id: 'demo-english',
        title: 'English 101 sunumunun girişini prova et',
        subject: 'eng',
        start: 0,
        end: 30,
        flexible: true,
      },
      {
        ...base,
        id: 'demo-book',
        title: 'Kitabından 20 sayfa oku',
        category: 'rest',
        subject: 'Dinlenme',
        start: 0,
        end: 25,
        flexible: true,
      },
      {
        ...base,
        id: 'demo-campus',
        title: 'Okul',
        lane: 'location',
        category: 'other',
        start: 540,
        end: 1020,
      },
    ];
    state.planTemplates = [
      {
        id: 'demo-class-day',
        name: 'Dersli günüm',
        weekday: new Date(today() + 'T12:00Z').getUTCDay(),
        blocks: state.days[today()].blocks
          .slice(0, 2)
          .map((block) => ({ ...block, status: 'planned' })),
      },
    ];
    const flexible = {
      ...base,
      start: 0,
      end: 60,
      flexible: true,
      subject: 'eng',
    };
    const yesterday = shiftDate(today(), -1);
    state.days[yesterday] = {
      ...blankDay(),
      blocks: [
        {
          ...flexible,
          id: 'demo-y-done1',
          title: 'İngilizce kelimeleri tekrar et',
          status: 'happened',
        },
        {
          ...flexible,
          id: 'demo-y-done2',
          title: 'Ders notlarını düzenle',
          status: 'happened',
        },
        {
          ...flexible,
          id: 'demo-y-nasa',
          title: 'Nasa Hackathon hazırlığı',
          category: 'personal',
          subject: 'Kişisel proje',
        },
        {
          ...flexible,
          id: 'demo-y-sotm',
          title: 'SoTM Project',
          category: 'personal',
          subject: 'Kişisel proje',
          end: 180,
        },
      ],
    };
    for (let offset = 2; offset <= 6; offset++) {
      state.days[shiftDate(today(), -offset)] = {
        ...blankDay(),
        blocks: [
          {
            ...flexible,
            id: `demo-${offset}-done`,
            title: 'Ders tekrarı',
            status: 'happened',
          },
          {
            ...flexible,
            id: `demo-${offset}-other`,
            title: 'Ek alıştırmalar',
            status: offset % 2 ? 'cancelled' : 'missed',
          },
        ],
      };
    }
    state.days[today()].blocks.push(
      {
        ...flexible,
        id: 'demo-today-missed',
        title: 'Ek problem setini çöz',
        status: 'missed',
      },
      {
        ...flexible,
        id: 'demo-today-moved',
        title: 'Gelecek haftanın notlarını düzenle',
      },
    );
    state = movePlanBlock(
      state,
      today(),
      'demo-today-moved',
      shiftDate(today(), 1),
    );
  }
  if (goals) {
    const from = weekStart(today());
    const weekdays = [
      ...new Set([1, 3, 5, new Date(today() + 'T12:00Z').getUTCDay()]),
    ];
    state.goals = {
      from: shiftDate(from, -7),
      courseHours: { ss: 6 },
      studyTotal: 6,
      pages: 10,
      sleepHours: 8,
    };
    state = scheduleGoals(state, {
      from,
      studyMode: 'daily',
      studyDays: weekdays,
      courseHours: { ss: weekdays.length },
      studyTotal: weekdays.length,
      pages: 20,
      sleepHours: 8,
    });
    state.entries.push({
      id: 'demo-goal-study',
      date: today(),
      kind: 'study',
      subject: 'ss',
      seconds: 2700,
      topic: 'Fourier serileri tekrarı',
      method: '',
      focus: null,
      learning: '',
      result: '',
      attempted: null,
      correct: null,
      obstacle: '',
    });
  }
  return state;
}
