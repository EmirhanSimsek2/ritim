import {
  Pencil,
  Download,
  ArrowUpRight,
  LoaderCircle,
  CloudAlert,
  CloudCheck,
  RefreshCw,
} from 'lucide-react';
import type { TrackerState } from '../lib/model';
import ThemeControl from '../theme';
import ImportControl from '../ImportControl';

type Props = {
  state: TrackerState;
  revision: number;
  demo: boolean;
  saving: boolean;
  syncError: string;
  syncLabel: string;
  exportData: () => void;
  logout: () => void;
  onEditActivities: () => void;
  reload: (silent?: boolean, force?: boolean) => Promise<boolean>;
};

export default function SettingsView({
  state,
  revision,
  demo,
  saving,
  syncError,
  syncLabel,
  exportData,
  logout,
  onEditActivities,
  reload,
}: Props) {
  return (
    <div className="settings-grid">
      <section className="card">
        <div className="card-heading">
          <div>
            <h2>Görünüm</h2>
            <p>Renk paletini ve açık, koyu veya sistem görünümünü seç.</p>
          </div>
        </div>
        <ThemeControl />
      </section>
      <section className="card">
        <div className="card-heading">
          <div>
            <h2>Faaliyet kategorileri</h2>
            <p>Sayaç ve geçmiş kayıtlarda kullanılan ders dışı faaliyetler.</p>
          </div>
        </div>
        <button className="button secondary" onClick={onEditActivities}>
          <Pencil size={16} />
          Kategorileri düzenle
        </button>
      </section>
      <section className="card settings-data">
        <div className="card-heading">
          <div>
            <h2>Verilerim</h2>
            <p>JSON yedeğini indir veya daha önce indirdiğin Ritim yedeğini geri yükle.</p>
          </div>
        </div>
        <button className="button secondary" onClick={exportData}>
          <Download size={16} />
          Verilerimi indir
        </button>
        {demo ? (
          <p className="helper">
            Yedekten geri yükleme kişisel hesabında kullanılabilir. Önizlemedeki değişiklikler sayfa
            yenilendiğinde sıfırlanır.
          </p>
        ) : (
          <ImportControl data={state} revision={revision} onImported={() => reload(false, true)} />
        )}
        <a className="text-button" href="/onizleme" target="_blank" rel="noreferrer">
          Örnek verilerle ön izleme <ArrowUpRight size={16} />
        </a>
      </section>
      <section className="card">
        <div className="card-heading">
          <div>
            <h2>Eşitleme</h2>
            <p>
              {demo
                ? 'Örnek veriler bu sayfanın belleğinde tutulur.'
                : 'Kayıtlar hesabın üzerinden diğer cihazlarınla eşitlenir.'}
            </p>
          </div>
        </div>
        <p
          className={`settings-sync ${syncError ? 'sync-failed' : ''}`}
          role="status"
          aria-live="polite"
        >
          {saving ? (
            <LoaderCircle size={18} className="spin" />
          ) : syncError ? (
            <CloudAlert size={18} />
          ) : (
            <CloudCheck size={18} />
          )}{' '}
          {syncLabel}
        </p>
        {syncError && (
          <p className="helper">
            {syncError} Son işlemin sonucunu kontrol edip yeniden deneyebilirsin.
          </p>
        )}
        {!demo && (
          <button className="button secondary" disabled={saving} onClick={() => reload(true)}>
            <RefreshCw size={16} />
            Eşitlemeyi kontrol et
          </button>
        )}
      </section>
      {!demo && (
        <section className="card">
          <h2>Hesap</h2>
          <button className="text-button" onClick={logout}>
            Çıkış yap <ArrowUpRight size={16} />
          </button>
        </section>
      )}
    </div>
  );
}
