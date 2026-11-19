import type { ReactNode } from 'react';

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Score({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: number | null;
}) {
  return (
    <Field label={label}>
      <select name={name} defaultValue={value ?? ''}>
        <option value="">Henüz kaydetmedim</option>
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n} · {['Çok düşük', 'Düşük', 'Orta', 'İyi', 'Çok iyi'][n - 1]}
          </option>
        ))}
      </select>
    </Field>
  );
}
