import { Sun, Moon } from 'lucide-react';
import type { Day } from '../lib/model';
import SleepFields from '../SleepFields';
import { Field, Score } from './FormFields';

export default function DayForm({
  day,
  date,
  saving,
  submit,
}: {
  day: Day;
  date: string;
  saving: boolean;
  submit: (form: HTMLFormElement) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
    >
      <p className="helper">Dilediğin alanı doldur. Boş bırakılan puanlar sıfır sayılmaz.</p>
      <h3>
        <Sun size={18} />
        Sabah
      </h3>
      <div className="form-grid">
        <Score name="amEnergy" label="Enerjim" value={day.amEnergy} />
        <Score name="amMood" label="Ruh hâlim" value={day.amMood} />
      </div>
      <h3>
        <Moon size={18} />
        Akşam
      </h3>
      <div className="form-grid">
        <Score name="pmEnergy" label="Enerjim" value={day.pmEnergy} />
        <Score name="pmMood" label="Ruh hâlim" value={day.pmMood} />
      </div>
      <h3>
        <Moon size={18} />
        Uyku
      </h3>
      <SleepFields day={day} wakeDate={date} />
      <Field label="Gününe dair bir not">
        <textarea
          name="notes"
          defaultValue={day.notes}
          maxLength={2000}
          rows={3}
          placeholder="Seni ne etkiledi? Neyi hatırlamak istersin?"
        />
      </Field>
      <button className="button primary full" disabled={saving}>
        Günlüğü kaydet
      </button>
    </form>
  );
}
