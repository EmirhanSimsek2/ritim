import {COURSES, shiftDate, type Exam} from './model.ts';

// Fall 2026 syllabus calendar: week 7 = Nov 9–13, week 15 = Jan 4–8.
// This is the academic term's anchor, never the user's tracking start date.
export const TERM_WEEK_ONE = '2026-09-28';

export function examSortDate(exam: Exam): string | null {
  if (exam.start) return exam.start;
  const match = exam.label.match(/\b(\d{1,2})\s*\.\s*hafta/i)
    ?? exam.note.match(/\b(\d{1,2})\s*\.\s*hafta/i);
  const week = Number(match?.[1]);
  return week >= 1 && week <= 15 ? shiftDate(TERM_WEEK_ONE, (week - 1) * 7) : null;
}

export function sortExams(exams: readonly Exam[]): Exam[] {
  const courseName = (exam: Exam) => COURSES.find(c => c.id === exam.course)?.name ?? exam.course;
  return [...exams].sort((a, b) =>
    (examSortDate(a) ?? '9999-12-31').localeCompare(examSortDate(b) ?? '9999-12-31')
    || courseName(a).localeCompare(courseName(b), 'tr')
  );
}
