const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });

export function segmentRevealText(text: string): string[] {
  const words: string[] = [];
  for (const { segment, isWordLike } of segmenter.segment(text)) {
    if (isWordLike || words.length === 0) {
      words.push(segment);
    } else {
      words[words.length - 1] += segment;
    }
  }
  return words;
}
