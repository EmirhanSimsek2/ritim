export function importChunks<T>(records: T[], maxBytes = 220000): T[][] {
  const chunks: T[][] = [];
  let batch: T[] = [], size = 2;
  const encoder = new TextEncoder();
  for (const record of records) {
    const bytes = encoder.encode(JSON.stringify(record)).byteLength;
    if (bytes + 2 > maxBytes)
      throw Error('Yedekte tek bir kayıt aktarım sınırını aşıyor. Mevcut kayıtların korunuyor.');
    if (batch.length && (batch.length === 20 || size + bytes + 1 > maxBytes)) {
      chunks.push(batch);
      batch = [];
      size = 2;
    }
    batch.push(record);
    size += bytes + (batch.length > 1 ? 1 : 0);
  }
  if (batch.length) chunks.push(batch);
  return chunks;
}
