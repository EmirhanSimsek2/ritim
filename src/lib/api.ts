type ApiData<T> = T & { error?: string };

function responseError(status: number, fallback: string) {
  if (status === 401) return 'Oturumun sona erdi. Yeniden giriş yap.';
  if (status === 409)
    return 'Kayıtlar başka bir sekmede veya cihazda değişti. Yeniden dene.';
  if (status === 413) return fallback + ' Gönderilen veri boyutu sınırı aşıyor.';
  if (status === 429) return 'Çok fazla deneme yapıldı. Biraz bekleyip yeniden dene.';
  if (status >= 500)
    return fallback + ' Sunucuya şu anda ulaşılamıyor. Biraz sonra yeniden dene.';
  return fallback;
}

// Keep HTTP status available: a rejected save must still follow the 409 recovery path.
export async function fetchJson<T extends object>(
  path: string,
  options: RequestInit,
  fallback: string,
  timeoutMs?: number,
): Promise<{ response: Response; data: ApiData<T> }> {
  const hasTimeout = timeoutMs !== undefined && timeoutMs > 0;
  const external = options.signal;
  const controller = external || hasTimeout ? new AbortController() : null;
  const onAbort = () => controller?.abort();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  if (controller) {
    if (external?.aborted) controller.abort();
    else external?.addEventListener('abort', onAbort, { once: true });
    if (hasTimeout) {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
    }
  }
  const timeoutMessage =
    fallback + ' Sunucu zamanında yanıt vermedi. Bağlantını kontrol edip yeniden dene.';
  try {
    let response: Response;
    try {
      response = await fetch(
        path,
        controller ? { ...options, signal: controller.signal } : options,
      );
    } catch {
      throw Error(
        timedOut ? timeoutMessage : fallback + ' Bağlantını kontrol edip yeniden dene.',
      );
    }
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      if (timedOut) throw Error(timeoutMessage);
      if (external?.aborted)
        throw Error(fallback + ' Bağlantını kontrol edip yeniden dene.');
      if (response.ok)
        throw Error(fallback + ' Sunucudan geçerli bir yanıt alınamadı. Yeniden dene.');
    }
    const object = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
    if (!response.ok) {
      const error = object ? (parsed as { error?: unknown }).error : undefined;
      return {
        response,
        data: {
          error: typeof error === 'string' && error.trim()
            ? error
            : responseError(response.status, fallback),
        } as ApiData<T>,
      };
    }
    if (!object)
      throw Error(fallback + ' Sunucudan geçerli bir yanıt alınamadı. Yeniden dene.');
    return { response, data: parsed as ApiData<T> };
  } finally {
    if (timer !== null) clearTimeout(timer);
    external?.removeEventListener('abort', onAbort);
  }
}
