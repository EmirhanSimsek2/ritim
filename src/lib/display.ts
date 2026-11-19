import { COURSES } from './model';

export const course = (id: string) => COURSES.find((c) => c.id === id);

export const subjectName = (e: { kind: string; subject: string }) =>
  e.kind === 'study' ? (course(e.subject)?.name ?? e.subject) : e.subject;

export const decimal = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
