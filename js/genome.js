/* Seven-byte genome. 128 is the even norn the first slice was.
   Genes scale salience, pressure, and refuse points. They never are drives. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WebGenome = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var COUNT = 7;
  var NEUTRAL = 128;
  var BAND = 28;
  // Page ticks every 0.7s. Ranch pressure is 1; this pace keeps drives off the rail.
  var PACE = { hunger: 0.35, boredom: 0.35, loneliness: 0.25, sleepiness: 0.22 };
  var POLES = [
    ["dainty", "greedy"],
    ["solemn", "playful"],
    ["independent", "clingy"],
    ["cool-loving", "warm-loving"],
    ["hardy", "delicate"],
    ["alert", "drowsy"],
    ["quiet", "chatty"]
  ];

  function clamp(n) {
    n = Math.round(Number(n));
    if (n !== n) return NEUTRAL;
    if (n < 0) return 0;
    if (n > 255) return 255;
    return n;
  }

  function neutral() {
    var g = [];
    for (var i = 0; i < COUNT; i++) g.push(NEUTRAL);
    return g;
  }

  function normalize(genes) {
    var g = neutral();
    if (!genes) return g;
    for (var i = 0; i < COUNT; i++) {
      if (genes[i] == null) continue;
      g[i] = clamp(genes[i]);
    }
    return g;
  }

  function unit(gene) {
    return gene / 255;
  }

  function lerp(gene, lo, hi) {
    return Math.round(lo + unit(gene) * (hi - lo));
  }

  // About 1 at 128, so an even norn matches the untraited thresholds.
  function span(gene) {
    return 0.55 + unit(gene) * 0.9;
  }

  function scale(gene) {
    return 0.65 + unit(gene) * 0.7;
  }

  function express(genes) {
    var g = normalize(genes);
    var appetite = g[0];
    var play = g[1];
    var social = g[2];
    var warmth = g[3];
    var metabolism = g[4];
    var sleep = g[5];
    var voice = g[6];
    var meta = scale(metabolism);
    var low = lerp(warmth, 52, 100);
    var high = lerp(warmth, 150, 206);
    return {
      genes: g,
      salience: {
        food: span(appetite),
        ball: span(play),
        nest: span(sleep),
        hand: span(social)
      },
      pressure: {
        hunger: PACE.hunger * meta * scale(appetite),
        boredom: PACE.boredom * meta * scale(play),
        loneliness: PACE.loneliness * meta * scale(social),
        sleepiness: PACE.sleepiness * meta * scale(sleep)
      },
      refuseEatBelow: lerp(appetite, 78, 18),
      playMinBoredom: lerp(play, 56, 16),
      tiredIgnorePlay: 185,
      lonelyIgnorePlay: 200,
      sleepMin: lerp(sleep, 78, 22),
      companyMin: lerp(social, 58, 8),
      recoilHeat: high,
      noveltyFromPet: lerp(voice, 2, 14),
      comfort: { low: low, high: high }
    };
  }

  function roll(rng) {
    var g = [];
    for (var i = 0; i < COUNT; i++) g.push(Math.floor(rng() * 256));
    return g;
  }

  // Copy plus a small step. Breeding can call this later; nothing here mates.
  function inherit(parent, rng) {
    var g = normalize(parent);
    for (var i = 0; i < COUNT; i++) {
      g[i] = clamp(g[i] + (Math.floor(rng() * 17) - 8));
    }
    return g;
  }

  function words(genes) {
    var g = normalize(genes);
    var bits = [];
    for (var i = 0; i < COUNT; i++) {
      if (g[i] < NEUTRAL - BAND) bits.push(POLES[i][0]);
      else if (g[i] > NEUTRAL + BAND) bits.push(POLES[i][1]);
    }
    if (!bits.length) return "even-tempered";
    return bits.join(" · ");
  }

  return {
    COUNT: COUNT,
    NEUTRAL: NEUTRAL,
    PACE: PACE,
    neutral: neutral,
    normalize: normalize,
    express: express,
    roll: roll,
    inherit: inherit,
    words: words
  };
});
