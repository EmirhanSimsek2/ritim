import { useState } from 'react';
import {
  duration, formatDate, getSleepError, getSleepHours, inferSleepDate,
  shiftDate, type Day,
} from './lib/model';
import './sleep.css';

export default function SleepFields({ day, wakeDate }: { day: Day; wakeDate: string }) {
  const [bedtime, setBedtime] = useState(day.bedtime);
  const [wake, setWake] = useState(day.wake);
  const [automatic, setAutomatic] = useState(!day.sleepDate || (!day.bedtime && !day.wake));
  const [manualDate, setManualDate] = useState(day.sleepDate);
  const hasTimes = !!(bedtime || wake);
  const sleepDate = !hasTimes ? '' : automatic ? inferSleepDate(bedtime, wake, wakeDate) : manualDate;
  const sleep = { ...day, bedtime, wake, sleepDate };
  const hours = getSleepHours(sleep, wakeDate), error = getSleepError(sleep, wakeDate);
  function chooseDate(value: string) {
    setManualDate(value);
    setAutomatic(false);
  }
  function changeTimes(nextBedtime: string, nextWake: string) {
    setBedtime(nextBedtime);
    setWake(nextWake);
    if (!nextBedtime && !nextWake) {
      setManualDate('');
      setAutomatic(true);
    }
  }
  return (
    <section className="sleep-fields" aria-label="Uyku kaydı">
      <p className="helper">
        Uykunu <strong>kalktığın güne</strong> kaydet. Bu günlüğün kalkış tarihi {formatDate(wakeDate, true)}.
        Başka bir gün için Günüm ekranındaki tarihi seçebilirsin.
      </p>
      <div className="form-grid">
        <label className="field">
          <span>Yatış saati</span>
          <input name="bedtime" type="time" value={bedtime} onChange={(event) => changeTimes(event.target.value, wake)} />
        </label>
        <label className="field">
          <span>Kalkış saati</span>
          <input name="wake" type="time" value={wake} onChange={(event) => changeTimes(bedtime, event.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Yattığın tarih</span>
        <input type="date" name="sleepDate" max={wakeDate} value={sleepDate} readOnly={!hasTimes} onChange={(event) => chooseDate(event.target.value)} />
        <small>
          {!hasTimes
            ? 'Saatlerden en az birini girerek yatış tarihini seçebilirsin.'
            : automatic
              ? 'Saatleri doldurduğunda tarih önerilir. Gerekirse değiştirebilirsin.'
              : 'Seçtiğin yatış tarihi korunur; saat değişince kendiliğinden değişmez.'}
        </small>
      </label>
      <div className="sleep-date-choices" aria-label="Yatış günü seçimi">
        <button type="button" aria-pressed={automatic} onClick={() => setAutomatic(true)}>Otomatik</button>
        <button type="button" disabled={!hasTimes} aria-pressed={!automatic && sleepDate === shiftDate(wakeDate, -1)} onClick={() => chooseDate(shiftDate(wakeDate, -1))}>Önceki gün</button>
        <button type="button" disabled={!hasTimes} aria-pressed={!automatic && sleepDate === wakeDate} onClick={() => chooseDate(wakeDate)}>Aynı gün</button>
      </div>
      <div className="sleep-preview" role="status" aria-live="polite">
        {error ? <p>{error}</p> : hours !== null ? (
          <>
            <strong>Uyku süren: {duration(hours * 3600)}</strong>
            <p>{formatDate(sleepDate)} {bedtime} → {formatDate(wakeDate)} {wake}</p>
          </>
        ) : (
          <p>{hasTimes
            ? 'Bu saati tek başına kaydedebilirsin. Diğer saati eklediğinde süre hesaplanır.'
            : 'İstersen yalnızca kalkışını kaydet; yatışını daha sonra ekle.'}</p>
        )}
      </div>
      <p className="helper">
        Örnek: 23.30 → 08.00 için yatış önceki gün; 02.30 → 08.00 için aynı takvim günü olur.
        Tamamlanmamış uyku kayıtları haftalık ortalamaya katılmaz.
      </p>
    </section>
  );
}
