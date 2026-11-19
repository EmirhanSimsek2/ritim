import { Trash2 } from 'lucide-react';
import type { Day } from '../lib/model';
import { Field } from './FormFields';

export default function ReadingForm({
  day,
  saving,
  submit,
  clearReading,
}: {
  day: Day;
  saving: boolean;
  submit: (form: HTMLFormElement) => void;
  clearReading: (form: HTMLFormElement) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
    >
      <div className="form-grid">
        <Field label="Kitap / kitaplar">
          <input
            name="book"
            defaultValue={day.book}
            maxLength={300}
            placeholder="İstersen kitabın adını yaz"
          />
        </Field>
        <Field label="Bugün okuduğun toplam sayfa">
          <input
            name="pages"
            type="number"
            min="0"
            max="10000"
            step="1"
            defaultValue={day.pages ?? ''}
            placeholder="Örn. 18"
          />
        </Field>
      </div>
      <button
        type="button"
        className="text-button danger reading-delete"
        disabled={saving || !(day.pages !== null || day.book)}
        onClick={(e) => clearReading(e.currentTarget.form!)}
      >
        <Trash2 size={15} />
        Bu günün okuma kaydını sil
      </button>
      <p className="helper">
        Sayfa toplamını ve kitap adını temizler. Diğer günlük bilgileri korunur.
      </p>
      <button className="button primary full" disabled={saving}>
        Okuma kaydını kaydet
      </button>
    </form>
  );
}
