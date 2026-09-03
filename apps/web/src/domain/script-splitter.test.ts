import { describe, expect, it } from "vitest";

import { CARD_MAX_SECONDS, CARD_MIN_SECONDS, splitIntoCards, splitSummary } from "./script-splitter";

const WORDS_PER_CARD_MIN = Math.ceil(CARD_MIN_SECONDS * (140 / 60));

describe("splitIntoCards", () => {
  it("gives each sentence its own card and keeps the terminator", () => {
    const cards = splitIntoCards(
      "Quy trình gồm bốn bước, mình đi lần lượt từng bước một. " +
        "Bước một, kiểm tra nguồn điện và đảm bảo đèn báo đang sáng màu xanh.",
    );

    expect(cards).toHaveLength(2);
    expect(cards[0].text.endsWith(".")).toBe(true);
    expect(cards[1].text.startsWith("Bước một")).toBe(true);
  });

  it("never lets a card straddle a sentence end", () => {
    const cards = splitIntoCards("Một hai ba bốn năm sáu. Bảy tám chín mười mười một mười hai.");

    expect(cards.every((card) => (card.text.match(/[.!?]/gu) ?? []).length <= 1)).toBe(true);
  });

  it("merges a fragment forward instead of leaving an unrecordable card", () => {
    const cards = splitIntoCards("Thôi. Em tắt máy đây, mai tính tiếp cho xong việc.");

    expect(cards).toHaveLength(1);
    expect(cards[0].text).toBe("Thôi. Em tắt máy đây, mai tính tiếp cho xong việc.");
  });

  it("merges a trailing fragment backwards, since nothing follows it", () => {
    const cards = splitIntoCards("Em tắt máy đây, mai tính tiếp cho xong việc rồi nghỉ. Thôi.");

    expect(cards).toHaveLength(1);
    expect(cards[0].text.endsWith("Thôi.")).toBe(true);
  });

  it("splits an over-long sentence at clause punctuation, not mid-clause", () => {
    const long = `Hôm nay ${Array.from({ length: 12 }, () => "chúng tôi kiểm tra toàn bộ").join(", ")}.`;
    const cards = splitIntoCards(long);

    expect(cards.length).toBeGreaterThan(1);
    expect(cards.every((card) => card.estimatedSeconds <= CARD_MAX_SECONDS)).toBe(true);
    // Every piece ends where a clause ended, so nothing is cut mid-phrase.
    expect(cards.slice(0, -1).every((card) => /[,;:]$/u.test(card.text))).toBe(true);
  });

  it("honours a hard line break as a boundary even without punctuation", () => {
    const cards = splitIntoCards("Dòng thứ nhất không có dấu chấm câu gì cả\nDòng thứ hai cũng vậy thôi");

    expect(cards).toHaveLength(2);
  });

  it("flags what it could not fix rather than silently shipping it", () => {
    const cards = splitIntoCards("Ừ.");

    expect(cards).toHaveLength(1);
    expect(cards[0].warning).toBe("short");
    expect(cards[0].wordCount).toBeLessThan(WORDS_PER_CARD_MIN);
  });

  it("returns nothing for empty or whitespace-only input", () => {
    expect(splitIntoCards("")).toEqual([]);
    expect(splitIntoCards("   \n  ")).toEqual([]);
  });
});

describe("splitSummary", () => {
  it("totals what the author is about to save", () => {
    const summary = splitSummary(splitIntoCards("Một hai ba bốn năm sáu bảy. Tám chín mười mười một mười hai."));

    expect(summary.cards).toBe(2);
    expect(summary.words).toBe(14);
    expect(summary.seconds).toBeGreaterThan(0);
    expect(summary.warnings).toBe(0);
  });
});
