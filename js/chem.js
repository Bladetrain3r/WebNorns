/* Creatures-style chemistry, arithmetic only.
   Drives are chemicals. emit() is the only inlet. Bars read needs(); nothing here
   is a keeper button. Tables follow the napkin body / biochem proof (uint8). */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WebChem = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Top 5 bits of a decay rate pick a column. EVERY[0..7] are 0 so those
  // rates fire every biotick; higher columns fire on a tick mask.
  var EVERY = [
    0, 0, 0, 0, 0, 0, 0, 0,
    1, 3, 7, 15, 31, 63, 127, 255,
    511, 1023, 2047, 4095, 8191, 16383, 32767, 65535,
    131071, 262143, 524287, 1048575, 2097151, 4194303, 8388607, 16777215
  ];

  var MULTIPLIERS = [
    0.0,
    0.1978302001953125,
    0.4447784423828125,
    0.6669158935546875,
    0.816650390625,
    0.9036865234375,
    0.95062255859375,
    0.9749908447265625
  ];
  while (MULTIPLIERS.length < 31) MULTIPLIERS.push(0.9749908447265625);
  MULTIPLIERS.push(0.9999847412109375);

  var HUNGER = 150, SLEEPINESS = 154, LONELINESS = 155, BOREDOM = 158;
  var FOOD = 20, REST = 21, COMPANY = 22, NOVELTY = 23, HEAT = 24, PUNISHMENT = 61;

  var DRIVES = {
    hunger: HUNGER,
    boredom: BOREDOM,
    loneliness: LONELINESS,
    sleepiness: SLEEPINESS
  };

  var NAMES = {
    150: "hunger",
    158: "boredom",
    155: "loneliness",
    154: "sleepiness",
    20: "food",
    21: "rest",
    22: "company",
    23: "novelty",
    24: "heat",
    61: "punishment"
  };

  // Drives barely decay (the verbs move them). Molecules linger a few ticks.
  // Heat is a fast sensor so it can follow the room without being assigned.
  var RATE = {};
  RATE[HUNGER] = 13 << 3;
  RATE[SLEEPINESS] = 13 << 3;
  RATE[LONELINESS] = 13 << 3;
  RATE[BOREDOM] = 13 << 3;
  RATE[FOOD] = 6 << 3;
  RATE[REST] = 6 << 3;
  RATE[COMPANY] = 6 << 3;
  RATE[NOVELTY] = 6 << 3;
  RATE[HEAT] = 4 << 3;
  RATE[PUNISHMENT] = 2 << 3;

  // Reactant, reactant, rate, product, product. Chemical 0 is "none".
  // Food cancels hunger, rest cancels sleepiness, and so on. No products:
  // the drive is eaten, not rewritten by the UI.
  var REACTIONS = [
    [1, FOOD, 1, HUNGER, 2 << 3, 0, 0, 0, 0],
    [1, REST, 1, SLEEPINESS, 2 << 3, 0, 0, 0, 0],
    [1, COMPANY, 1, LONELINESS, 2 << 3, 0, 0, 0, 0],
    [1, NOVELTY, 1, BOREDOM, 2 << 3, 0, 0, 0, 0]
  ];

  // Passive emitters while awake: time as weather, not a button.
  var PRESSURE = {};
  PRESSURE[HUNGER] = 2;
  PRESSURE[BOREDOM] = 2;
  PRESSURE[LONELINESS] = 1;
  PRESSURE[SLEEPINESS] = 1;

  function decayChemical(concentration, rate, biotick) {
    var r = rate >> 3;
    var every = EVERY[r];
    if ((biotick & every) === every) {
      var c = Math.trunc(concentration * MULTIPLIERS[r]);
      return c > 255 ? 255 : c;
    }
    return concentration;
  }

  function addSat(a, b) {
    var v = a + b;
    return v > 255 ? 255 : v;
  }

  function subSat(a, b) {
    var v = a - b;
    return v < 0 ? 0 : v;
  }

  function mulSat(a, b) {
    var v = a * b;
    return v > 255 ? 255 : v;
  }

  function runReaction(conc, rxn, biotick) {
    var r1Prop = rxn[0], r1Chem = rxn[1], r2Prop = rxn[2], r2Chem = rxn[3];
    var rate = rxn[4], p1Prop = rxn[5], p1Chem = rxn[6], p2Prop = rxn[7], p2Chem = rxn[8];
    var availability = 255;
    if (r1Chem !== 0 && r1Prop !== 0) availability = Math.floor(conc[r1Chem] / r1Prop);
    if (r2Chem !== 0 && r2Prop !== 0) {
      var availability2 = Math.floor(conc[r2Chem] / r2Prop);
      if (availability2 < availability) availability = availability2;
    }
    if (availability === 0) return;
    var diff = availability - decayChemical(availability, rate, biotick);
    if (diff === 0) return;
    conc[r1Chem] = subSat(conc[r1Chem], mulSat(diff, r1Prop));
    conc[r2Chem] = subSat(conc[r2Chem], mulSat(diff, r2Prop));
    conc[p1Chem] = addSat(conc[p1Chem], mulSat(diff, p1Prop));
    conc[p2Chem] = addSat(conc[p2Chem], mulSat(diff, p2Prop));
  }

  // Proof order: decay, then reactions. Sparse skips empty slots; a zero
  // concentration times a multiplier is still zero, so the trajectories match.
  function engineTick(state, sparse) {
    var biotick = state.biotick;
    var conc = state.conc;
    if (sparse) {
      for (var a = 0; a < state.active.length; a++) {
        var i = state.active[a];
        if (state.decay[i]) conc[i] = decayChemical(conc[i], state.decay[i], biotick);
      }
    } else {
      for (var n = 0; n < 256; n++) {
        if (state.decay[n]) conc[n] = decayChemical(conc[n], state.decay[n], biotick);
      }
    }
    for (var r = 0; r < state.reactions.length; r++) {
      runReaction(conc, state.reactions[r], biotick);
    }
    state.biotick = biotick + 1;
  }

  function Body() {
    this.conc = new Uint8Array(256);
    this.biotick = 0;
    this.asleep = 0;
    this.lastSource = {};
    this.acc = {};
    // Seam: a later hatch can scale these. 1.0 is the neutral genome.
    this.pressure = { hunger: 1, boredom: 1, loneliness: 1, sleepiness: 1 };
  }

  Body.prototype.emit = function (chem, amount, source) {
    var n = Math.floor(amount);
    if (n <= 0 || chem <= 0) return;
    this.conc[chem] = addSat(this.conc[chem], n);
    this.lastSource[chem] = source;
  };

  // Napkin order: weather, then reactions, then decay.
  Body.prototype.tick = function () {
    this.biotick += 1;
    if (this.asleep > 0) {
      this.asleep -= 1;
      this.emit(REST, 60, "sleep");
      this.emit(HUNGER, 1, "time");
    } else {
      for (var key in PRESSURE) {
        if (!Object.prototype.hasOwnProperty.call(PRESSURE, key)) continue;
        var chem = Number(key);
        var name = NAMES[chem];
        var scale = this.pressure[name] == null ? 1 : this.pressure[name];
        this.acc[chem] = (this.acc[chem] || 0) + PRESSURE[key] * scale;
        var whole = Math.floor(this.acc[chem]);
        if (whole > 0) {
          this.acc[chem] -= whole;
          this.emit(chem, whole, "time");
        }
      }
    }
    for (var i = 0; i < REACTIONS.length; i++) runReaction(this.conc, REACTIONS[i], this.biotick);
    for (var c = 1; c < 256; c++) {
      if (!this.conc[c]) continue;
      var rate = RATE[c] != null ? RATE[c] : (8 << 3);
      this.conc[c] = decayChemical(this.conc[c], rate, this.biotick);
    }
  };

  Body.prototype.drives = function () {
    return {
      hunger: this.conc[HUNGER],
      boredom: this.conc[BOREDOM],
      loneliness: this.conc[LONELINESS],
      sleepiness: this.conc[SLEEPINESS]
    };
  };

  // A full drive is an empty need. Bars are this readout, not a second store.
  Body.prototype.needs = function () {
    var d = this.drives();
    function inv(v) { return 100 - Math.floor(v * 100 / 255); }
    return {
      hunger: inv(d.hunger),
      energy: inv(d.sleepiness),
      fun: inv(d.boredom),
      social: inv(d.loneliness)
    };
  };

  return {
    EVERY: EVERY,
    MULTIPLIERS: MULTIPLIERS,
    HUNGER: HUNGER,
    SLEEPINESS: SLEEPINESS,
    LONELINESS: LONELINESS,
    BOREDOM: BOREDOM,
    FOOD: FOOD,
    REST: REST,
    COMPANY: COMPANY,
    NOVELTY: NOVELTY,
    HEAT: HEAT,
    PUNISHMENT: PUNISHMENT,
    DRIVES: DRIVES,
    NAMES: NAMES,
    RATE: RATE,
    REACTIONS: REACTIONS,
    PRESSURE: PRESSURE,
    decayChemical: decayChemical,
    addSat: addSat,
    subSat: subSat,
    mulSat: mulSat,
    runReaction: runReaction,
    engineTick: engineTick,
    Body: Body
  };
});
