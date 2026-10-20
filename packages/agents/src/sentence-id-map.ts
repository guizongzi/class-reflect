export type SentenceIdMappable = { id: string };

export type SentenceIdMap = {
  toShortId: (realId: string) => string;
  toRealId: (shortOrRealId: string) => string;
};

export function buildSentenceIdMap(items: SentenceIdMappable[]): SentenceIdMap {
  const realToShort = new Map<string, string>();
  const shortToReal = new Map<string, string>();
  items.forEach((item, index) => {
    const shortId = `s${index}`;
    realToShort.set(item.id, shortId);
    shortToReal.set(shortId, item.id);
  });
  return {
    toShortId(realId) {
      return realToShort.get(realId) || realId;
    },
    toRealId(shortOrRealId) {
      return shortToReal.get(shortOrRealId) || shortOrRealId;
    }
  };
}

export function restoreMappedSentenceIds(ids: string[], mapper: SentenceIdMap): string[] {
  return ids.map((id) => mapper.toRealId(id));
}
