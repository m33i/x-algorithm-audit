import { describe, it, expect } from "vitest";
import {
  POSITIVE_WEIGHTS,
  NEGATIVE_WEIGHTS,
  POSITIVE_SUM,
  BIDIRECTIONAL_FOLLOW_REPLY_BOOST,
  diversityMultiplier,
} from "./weights";

describe("pesos positivos", () => {
  it("transcribe param.rs", () => {
    expect(POSITIVE_WEIGHTS.favorite).toBe(0.5);
    expect(POSITIVE_WEIGHTS.reply).toBe(5.0);
    expect(POSITIVE_WEIGHTS.retweet).toBe(1.0);
    expect(POSITIVE_WEIGHTS.quote).toBe(5.0);
    expect(POSITIVE_WEIGHTS.share).toBe(2.0);
    expect(POSITIVE_WEIGHTS.shareViaDm).toBe(5.0);
    expect(POSITIVE_WEIGHTS.shareViaCopyLink).toBe(20.0);
    expect(POSITIVE_WEIGHTS.followAuthor).toBe(4.0);
    expect(POSITIVE_WEIGHTS.click).toBe(0.4);
    expect(POSITIVE_WEIGHTS.openLink).toBe(0.2);
    expect(POSITIVE_WEIGHTS.photoExpand).toBe(0.05);
    expect(POSITIVE_WEIGHTS.videoOpen).toBe(0.05);
    expect(POSITIVE_WEIGHTS.vqv).toBe(0.05);
    expect(POSITIVE_WEIGHTS.quotedClick).toBe(0.05);
    expect(POSITIVE_WEIGHTS.postUnexplored).toBe(0.02);
  });

  it("excluye los pesos a cero", () => {
    // profile_click, dwell, quoted_vqv y cont_click_dwell_time valen 0.0
    // en param.rs y no deben existir en la tabla.
    expect(POSITIVE_WEIGHTS).not.toHaveProperty("profileClick");
    expect(POSITIVE_WEIGHTS).not.toHaveProperty("dwell");
    expect(POSITIVE_WEIGHTS).not.toHaveProperty("quotedVqv");
    expect(POSITIVE_WEIGHTS).not.toHaveProperty("bookmark");
  });

  it("suma 43.32, el positive_sum de ranking_scorer.rs", () => {
    // 8 decimales, no 10: POSITIVE_SUM se acumula en coma flotante y 43.32
    // no es exactamente representable. 8 basta para distinguirlo de 43.3.
    expect(POSITIVE_SUM).toBeCloseTo(43.32, 8);
  });
});

describe("pesos negativos", () => {
  it("transcribe param.rs", () => {
    expect(NEGATIVE_WEIGHTS.notInterested).toBe(-43.2);
    expect(NEGATIVE_WEIGHTS.blockAuthor).toBe(-31.2);
    expect(NEGATIVE_WEIGHTS.muteAuthor).toBe(-58.8);
    expect(NEGATIVE_WEIGHTS.report).toBe(-234.0);
    expect(NEGATIVE_WEIGHTS.notDwelled).toBe(-0.02);
  });
});

describe("boost por follow mutuo", () => {
  it("lleva la reply de 5.0 a 20.0", () => {
    expect(BIDIRECTIONAL_FOLLOW_REPLY_BOOST).toBe(15.0);
    expect(POSITIVE_WEIGHTS.reply + BIDIRECTIONAL_FOLLOW_REPLY_BOOST).toBe(20.0);
  });
});

describe("diversityMultiplier", () => {
  it("sigue (1 - floor) * decay^k + floor", () => {
    expect(diversityMultiplier(0)).toBeCloseTo(1.0, 10);
    expect(diversityMultiplier(1)).toBeCloseTo(0.625, 10);
    expect(diversityMultiplier(2)).toBeCloseTo(0.4375, 10);
    expect(diversityMultiplier(3)).toBeCloseTo(0.34375, 10);
    expect(diversityMultiplier(4)).toBeCloseTo(0.296875, 10);
  });

  it("tiende al suelo de 0.25", () => {
    expect(diversityMultiplier(50)).toBeCloseTo(0.25, 10);
  });
});
