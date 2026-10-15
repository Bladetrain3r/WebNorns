/* Sense → choose → act → emit → tick.
   Keeper code must not call emit. A verb fires it only after the bleb commits. */
(function (root, factory) {
  var Chem = root.WebChem || (typeof require === "function" ? require("./chem.js") : null);
  var World = root.WebWorld || (typeof require === "function" ? require("./world.js") : null);
  var Carry = root.WebCarry || (typeof require === "function" ? require("./carry.js") : null);
  var Life = root.WebLife || (typeof require === "function" ? require("./life.js") : null);
  var api = factory(Chem, World, Carry, Life);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WebBleb = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Chem, World, Carry, Life) {
  "use strict";

  var REACH = 10;
  var SEE = 120;
  var SPEED = 8;
  var MEAL = 150;
  var SLEEP_BOUT = 10;
  var IDLE_BELOW = 30;
  var STARVE = 200;
  var ARBITRATION = 0.25;

  // Innate answers only. A habit table can replace weight() later; same shape.
  var INNATE = {
    hunger: { eat: 1.0, move: 0.6 },
    boredom: { play: 1.0, move: 0.5 },
    loneliness: { nuzzle: 0.9, move: 0.45 },
    sleepiness: { sleep: 1.0, move: 0.4 }
  };

  var COLOR = {
    food: "#f6c66a",
    play: "#f8a8c6",
    sleep: "#c3aef0",
    bad: "#f5a98f",
    cold: "#9cd0ee",
    mute: "#8d80a0",
    good: "#a8dcb0"
  };

  // Starting body, not a keeper action. Needs read out near the middle of the bars.
  var BIRTH = { hunger: 120, boredom: 90, loneliness: 88, sleepiness: 74 };

  function defaultTraits() {
    // Seam: hatch will scale these. They change salience and thresholds, never drives.
    return {
      salience: { food: 1, ball: 1, nest: 1, hand: 1 },
      // Ranch pressure is 1.0 per biotick. This page ticks every 0.7s, so the
// temperament is lower or every drive would rail inside a minute.
pressure: { hunger: 0.35, boredom: 0.35, loneliness: 0.25, sleepiness: 0.22 },
      refuseEatBelow: 48,
      playMinBoredom: 36,
      tiredIgnorePlay: 185,
      lonelyIgnorePlay: 200,
      sleepMin: 50,
      companyMin: 32,
      recoilHeat: 220,
      noveltyFromPet: 8,
      comfort: { low: 76, high: 178 }
    };
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createBleb() {
    var body = new Chem.Body();
    var traits = defaultTraits();
    var key;
    for (key in traits.pressure) {
      if (Object.prototype.hasOwnProperty.call(traits.pressure, key)) {
        body.pressure[key] = traits.pressure[key];
      }
    }
    body.conc[Chem.HUNGER] = BIRTH.hunger;
    body.conc[Chem.BOREDOM] = BIRTH.boredom;
    body.conc[Chem.LONELINESS] = BIRTH.loneliness;
    body.conc[Chem.SLEEPINESS] = BIRTH.sleepiness;
    body.conc[Chem.HEAT] = Math.round(50 * 255 / 100);
    return {
      name: "Bleb",
      color: "#f8a8c6",
      body: body,
      traits: traits,
      x: 30,
      sig: "",
      verb: "idle",
      detail: "content",
      noticed: {},
      heatAcc: 0,
      flags: { hot: false, cold: false },
      justWoke: false,
      born: Date.now()
    };
  }

  function createSim(opts) {
    opts = opts || {};
    var seed = opts.seed == null ? (Date.now() % 1000000000) : opts.seed;
    return {
      world: World.createWorld(),
      bleb: createBleb(),
      rng: mulberry32(seed),
      noise: opts.noise == null ? 0.08 : opts.noise,
      // "stasis" is the default life. "mortal" is not registered; unknown
      // names fall back to stasis, so nothing here ends the creature.
      lifecycle: "stasis",
      phase: "awake"
    };
  }

  function clampX(x) {
    if (x < 8) return 8;
    if (x > 92) return 92;
    return x;
  }

  function weight(drive, verb) {
    var row = INNATE[drive];
    if (row && Object.prototype.hasOwnProperty.call(row, verb)) return row[verb];
    return 0.2;
  }

  function topDrive(drives) {
    var names = ["hunger", "boredom", "loneliness", "sleepiness"];
    var top = names[0];
    for (var i = 1; i < names.length; i++) {
      if (drives[names[i]] > drives[top]) top = names[i];
    }
    return top;
  }

  function wantsFood(drives, traits) { return drives.hunger >= traits.refuseEatBelow; }

  function wantsBall(drives, traits) {
    if (drives.boredom < traits.playMinBoredom) return false;
    if (drives.sleepiness >= traits.tiredIgnorePlay) return false;
    if (drives.loneliness >= traits.lonelyIgnorePlay && drives.boredom < 120) return false;
    return true;
  }

  function wantsNest(drives, traits) { return drives.sleepiness >= traits.sleepMin; }
  function wantsHand(drives, traits) { return drives.loneliness >= traits.companyMin; }

  function senseWorld(sim) {
    var x = sim.bleb.x;
    function feel(obj) {
      if (!obj) return null;
      var dist = Math.abs(obj.x - x);
      return { x: obj.x, dist: dist, visible: dist <= SEE };
    }
    return {
      food: feel(sim.world.food),
      ball: feel(sim.world.ball),
      nest: feel(sim.world.nest),
      hand: feel(sim.world.hand)
    };
  }

  function inReach(senseObj) {
    return !!(senseObj && senseObj.visible && senseObj.dist <= REACH);
  }

  function moveTarget(sim, sense, drives) {
    var traits = sim.bleb.traits;
    var options = [];
    if (sense.food && sense.food.visible && sense.food.dist > REACH && wantsFood(drives, traits)) {
      options.push({ kind: "food", x: sense.food.x, label: "pellet", drive: "hunger" });
    }
    if (sense.ball && sense.ball.visible && sense.ball.dist > REACH && wantsBall(drives, traits)) {
      options.push({ kind: "ball", x: sense.ball.x, label: "ball", drive: "boredom" });
    }
    if (sense.nest && sense.nest.visible && sense.nest.dist > REACH && wantsNest(drives, traits)) {
      options.push({ kind: "nest", x: sense.nest.x, label: "nest", drive: "sleepiness" });
    }
    if (sense.hand && sense.hand.visible && sense.hand.dist > REACH && wantsHand(drives, traits)) {
      options.push({ kind: "hand", x: sense.hand.x, label: "hand", drive: "loneliness" });
    }
    if (!options.length) return null;
    var top = topDrive(drives);
    var best = null;
    var bestScore = -1;
    for (var i = 0; i < options.length; i++) {
      var opt = options[i];
      var score = drives[opt.drive] / 255 + (opt.drive === top ? 0.75 : 0);
      if (score > bestScore) { bestScore = score; best = opt; }
    }
    return best;
  }

  function affordance(verb, sim, sense, drives) {
    var traits = sim.bleb.traits;
    var sal = traits.salience;
    if (verb === "eat") return inReach(sense.food) && wantsFood(drives, traits) ? sal.food : 0;
    if (verb === "play") return inReach(sense.ball) && wantsBall(drives, traits) ? sal.ball : 0;
    if (verb === "nuzzle") {
      if (!inReach(sense.hand) || !wantsHand(drives, traits)) return 0;
      if (sim.bleb.body.conc[Chem.HEAT] >= traits.recoilHeat) return 0;
      return sal.hand;
    }
    if (verb === "sleep") return inReach(sense.nest) && wantsNest(drives, traits) ? sal.nest : 0;
    if (verb === "move") return moveTarget(sim, sense, drives) ? 1 : 0;
    return 0;
  }

  function choose(sim, sense) {
    var drives = sim.bleb.body.drives();
    if (drives.hunger >= STARVE && inReach(sense.food)) return { verb: "eat", drive: "hunger" };
    var top = topDrive(drives);
    if (drives[top] < IDLE_BELOW && !(inReach(sense.food) && !wantsFood(drives, sim.bleb.traits))) {
      return { verb: "idle", drive: top };
    }
    var verbs = ["eat", "play", "nuzzle", "sleep", "move"];
    var names = ["hunger", "boredom", "loneliness", "sleepiness"];
    var best = null;
    var bestScore = -1;
    for (var i = 0; i < verbs.length; i++) {
      var verb = verbs[i];
      var gate = affordance(verb, sim, sense, drives);
      if (gate <= 0) continue;
      var score = (drives[top] / 255) * weight(top, verb);
      for (var d = 0; d < names.length; d++) {
        if (names[d] === top) continue;
        score += ARBITRATION * (drives[names[d]] / 255) * weight(names[d], verb);
      }
      score *= gate;
      // A yawn is a nudge on the sleep score, not an injection of sleepiness.
      if (verb === "sleep" && sim.world.yawn > 0) score *= 1.15;
      if (sim.noise > 0) score += sim.rng() * sim.noise;
      if (score > bestScore) { bestScore = score; best = verb; }
    }
    return { verb: best || "idle", drive: top };
  }

  function pack(verb, detail, msg, color) {
    return { verb: verb, detail: detail, sig: verb + "|" + detail, msg: msg, color: color };
  }

  function describeIdle(sim, sense, drives) {
    var name = sim.bleb.name;
    var traits = sim.bleb.traits;
    var top = topDrive(drives);
    if (inReach(sense.food) && !wantsFood(drives, traits)) {
      return pack("idle", "refuse-full", name + " noses the pellet, too full to eat.", COLOR.food);
    }
    if (inReach(sense.ball) && !wantsBall(drives, traits)) {
      if (drives.sleepiness >= traits.tiredIgnorePlay) {
        return pack("idle", "glance-tired", name + " glances at the ball, too tired to play.", COLOR.play);
      }
      if (drives.loneliness >= traits.lonelyIgnorePlay) {
        return pack("idle", "glance-miserable", name + " glances at the ball and looks away.", COLOR.play);
      }
      return pack("idle", "glance-ball", name + " glances at the ball, not in the mood.", COLOR.play);
    }
    if (inReach(sense.nest) && !wantsNest(drives, traits)) {
      return pack("idle", "refuse-sleep", name + " isn't sleepy enough for the nest.", COLOR.sleep);
    }
    if (inReach(sense.hand) && !wantsHand(drives, traits)) {
      return pack("idle", "glance-hand", name + " barely notices the hand.", COLOR.play);
    }
    if (drives[top] < IDLE_BELOW) return pack("idle", "content", null, null);
    if (top === "hunger") return pack("idle", "want-food", name + " looks around for a bite.", COLOR.food);
    if (top === "boredom") return pack("idle", "want-play", name + " fidgets, nothing fun in reach.", COLOR.play);
    if (top === "sleepiness") return pack("idle", "want-sleep", name + " is drowsy, and there's nowhere soft.", COLOR.sleep);
    return pack("idle", "want-company", name + " looks around for company.", COLOR.play);
  }

  function act(sim, choice, sense) {
    var body = sim.bleb.body;
    var world = sim.world;
    var name = sim.bleb.name;
    var drives = body.drives();
    if (choice.verb === "idle") return describeIdle(sim, sense, drives);

    if (choice.verb === "move") {
      var target = moveTarget(sim, sense, drives);
      if (!target) return pack("idle", "content", null, null);
      var dist = Math.abs(target.x - sim.bleb.x);
      var step = Math.min(SPEED, dist);
      sim.bleb.x = clampX(sim.bleb.x + (target.x > sim.bleb.x ? step : -step));
      var tone = target.kind === "food" ? COLOR.food : target.kind === "nest" ? COLOR.sleep : COLOR.play;
      return pack("move", "approach-" + target.kind, name + " heads toward the " + target.label + ".", tone);
    }

    if (choice.verb === "eat") {
      // Spit the mouthful out. Leaving it in the stomach would digest it into
      // less hunger; the refusal has to empty the chemical, not edit the drive.
      if (body.conc[Chem.FOOD] > 100 && drives.hunger < 80) {
        world.food = null;
        body.conc[Chem.FOOD] = 0;
        body.emit(Chem.PUNISHMENT, 80, "vomit");
        return pack("eat", "vomit", name + " gags and spits the food out.", COLOR.bad);
      }
      body.emit(Chem.FOOD, MEAL, "eat");
      if (world.food) {
        world.food.bites -= 1;
        if (world.food.bites <= 0) world.food = null;
      }
      return pack("eat", "bite", name + " takes a bite and starts chewing.", COLOR.food);
    }

    if (choice.verb === "play") {
      body.emit(Chem.NOVELTY, 64, "play");
      body.emit(Chem.HUNGER, 3, "play");
      body.emit(Chem.SLEEPINESS, 4, "play");
      if (world.ball) {
        world.ball.bouts -= 1;
        if (world.ball.bouts <= 0) world.ball = null;
      }
      return pack("play", "bout", name + " bats the ball around.", COLOR.play);
    }

    if (choice.verb === "nuzzle") {
      body.emit(Chem.COMPANY, 52, "nuzzle");
      if (drives.loneliness > 100) body.emit(Chem.NOVELTY, sim.bleb.traits.noveltyFromPet, "nuzzle");
      world.hand = null;
      return pack("nuzzle", "accept", name + " leans into your hand.", COLOR.play);
    }

    if (choice.verb === "sleep") {
      body.asleep = SLEEP_BOUT;
      world.nest = null;
      world.yawn = 0;
      return pack("sleep", "asleep", name + " curls up in the nest.", COLOR.sleep);
    }

    return pack("idle", "content", null, null);
  }

  function notice(sim, sense, events) {
    var name = sim.bleb.name;
    var seen = sim.bleb.noticed;
    function once(key, obj, msg, color) {
      if (obj && obj.visible) {
        if (!seen[key]) {
          seen[key] = true;
          events.push({ msg: msg, color: color });
        }
      } else {
        seen[key] = false;
      }
    }
    once("food", sense.food, name + " notices a pellet.", COLOR.food);
    once("ball", sense.ball, name + " notices the ball.", COLOR.play);
    once("nest", sense.nest, name + " notices the nest.", COLOR.sleep);
    once("hand", sense.hand, name + " notices your hand.", COLOR.play);
  }

  // Room → heat chemical. Flow toward ambient, then decay in tick(). Never a pin.
  function coupleHeat(bleb, ambient) {
    var target = Math.round(ambient * 255 / 100);
    var m = Chem.MULTIPLIERS[4];
    bleb.heatAcc += target * (1 - m) / m;
    var whole = Math.floor(bleb.heatAcc);
    if (whole > 0) {
      bleb.body.emit(Chem.HEAT, whole, "room");
      bleb.heatAcc -= whole;
    }
  }

  function feltEdges(sim, events) {
    var pct = Math.round(sim.bleb.body.conc[Chem.HEAT] * 100 / 255);
    var flags = sim.bleb.flags;
    var name = sim.bleb.name;
    if (pct > 70 && !flags.hot) {
      flags.hot = true;
      events.push({ msg: name + " pants. The room is too warm.", color: COLOR.bad });
    }
    if (pct < 62) flags.hot = false;
    if (pct < 30 && !flags.cold) {
      flags.cold = true;
      events.push({ msg: name + " shivers in the cool air.", color: COLOR.cold });
    }
    if (pct > 38) flags.cold = false;
  }

  function applyLife(sim, events) {
    var report = Life.afterTick(sim);
    var extra = report.events || [];
    for (var i = 0; i < extra.length; i++) events.push(extra[i]);
  }

  function step(sim) {
    var events = [];
    // Dormant or dead is whatever the policy last reported. This slice's
    // policy never reports either; the branch is the plug for stasis and mortality.
    if (sim.phase === "dormant" || sim.phase === "dead") {
      applyLife(sim, events);
      return events;
    }
    var bleb = sim.bleb;
    var body = bleb.body;
    var wasAsleep = body.asleep > 0;
    var outcome;

    coupleHeat(bleb, sim.world.ambient);

    if (wasAsleep) {
      outcome = pack("sleep", "asleep", null, null);
    } else {
      var sense = senseWorld(sim);
      notice(sim, sense, events);
      outcome = act(sim, choose(sim, sense), sense);
      if (body.asleep === 0) {
        var heat = body.conc[Chem.HEAT];
        if (heat > bleb.traits.comfort.high) body.emit(Chem.SLEEPINESS, 1, "heat");
        else if (heat < bleb.traits.comfort.low) body.emit(Chem.HUNGER, 1, "cold");
      }
    }

    body.tick();
    bleb.justWoke = wasAsleep && body.asleep === 0;
    if (bleb.justWoke) events.push({ msg: bleb.name + " wakes up.", color: COLOR.good });

    feltEdges(sim, events);

    if (outcome.sig !== bleb.sig) {
      bleb.sig = outcome.sig;
      if (outcome.msg) events.push({ msg: outcome.msg, color: outcome.color });
    }

    bleb.verb = body.asleep > 0 ? "sleep" : (bleb.justWoke ? "idle" : outcome.verb);
    bleb.detail = outcome.detail;

    var expired = World.ageWorld(sim.world);
    for (var i = 0; i < expired.length; i++) events.push(expired[i]);
    applyLife(sim, events);
    return events;
  }

  function joinAnd(parts) {
    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return parts[0] + " and " + parts[1];
    return parts.slice(0, -1).join(", ") + ", and " + parts[parts.length - 1];
  }

  function moodOf(body) {
    if (body.asleep > 0) return { key: "sleeping", label: "sleeping", emoji: "😴" };
    var d = body.drives();
    var n = body.needs();
    if (d.loneliness > 175 && n.fun < 50) return { key: "lonely", label: "feeling lonely", emoji: "🥺" };
    var avg = (n.hunger + n.energy + n.fun) / 3;
    if (avg > 70) return { key: "happy", label: "happy", emoji: "😊" };
    if (avg > 50) return { key: "content", label: "content", emoji: "🙂" };
    if (avg > 30) return { key: "grumpy", label: "grumpy", emoji: "😒" };
    if (avg > 10) return { key: "miserable", label: "miserable", emoji: "😞" };
    return { key: "wilting", label: "wilting", emoji: "🫠" };
  }

  function statusLine(sim) {
    var name = sim.bleb.name;
    var body = sim.bleb.body;
    if (body.asleep > 0) return name + " is curled up, asleep.";
    if (sim.bleb.justWoke) return name + " blinks awake.";
    if (sim.bleb.verb === "play") return name + " is batting the ball.";
    if (sim.bleb.verb === "eat" && sim.bleb.detail === "vomit") return name + " spat the food out.";
    if (sim.bleb.verb === "eat") return name + " is chewing.";
    if (body.conc[Chem.FOOD] > 12) return name + " is digesting.";
    if (sim.bleb.verb === "nuzzle") return name + " leans into the touch.";
    if (sim.bleb.verb === "move") return name + " waddles across the rug.";
    var d = body.drives();
    var temp = Math.round(body.conc[Chem.HEAT] * 100 / 255);
    var bits = [];
    if (d.loneliness > 170) bits.push("lonely");
    if (d.hunger > 190) bits.push("starving");
    else if (d.hunger > 120) bits.push("hungry");
    else if (d.hunger < 40) bits.push("stuffed");
    if (d.sleepiness > 190) bits.push("exhausted");
    else if (d.sleepiness > 130) bits.push("tired");
    if (d.boredom > 170) bits.push("bored");
    if (temp > 70) bits.push("too warm");
    else if (temp < 30) bits.push("cold");
    if (!bits.length) return name + " is doing okay.";
    return name + " is " + joinAnd(bits) + ".";
  }

  function present(sim) {
    var bleb = sim.bleb;
    var body = bleb.body;
    var needs = body.needs();
    var drives = body.drives();
    var mood = moodOf(body);
    var temp = Math.round(body.conc[Chem.HEAT] * 100 / 255);
    var mouth = "small";
    if (body.asleep > 0) mouth = "tiny";
    else if (bleb.verb === "play" || mood.key === "happy") mouth = "big";
    else if (mood.key === "grumpy") mouth = "flat";
    else if (mood.key === "lonely" || mood.key === "miserable" || mood.key === "wilting") mouth = "frown";
    var obj = function (o) { return o ? o.x : null; };
    return {
      name: bleb.name,
      color: bleb.color,
      born: bleb.born,
      x: bleb.x,
      ambient: sim.world.ambient,
      place: sim.world.place,
      mood: mood,
      status: statusLine(sim),
      verb: bleb.verb,
      bars: {
        hunger: needs.hunger,
        energy: needs.energy,
        fun: needs.fun,
        social: needs.social,
        temp: temp
      },
      face: {
        eyes: body.asleep > 0 ? "sleep" : "open",
        mouth: mouth,
        tear: mood.key === "lonely" || mood.key === "miserable" || mood.key === "wilting" || drives.loneliness > 175,
        sweat: temp > 70,
        shiver: temp < 30,
        cheeks: mood.key === "happy" || bleb.verb === "play",
        zzz: body.asleep > 0,
        anim: body.asleep > 0 ? "sleep" : (bleb.verb === "play" ? "play" : "idle")
      },
      objects: {
        food: obj(sim.world.food),
        ball: obj(sim.world.ball),
        nest: obj(sim.world.nest),
        hand: obj(sim.world.hand)
      }
    };
  }

  return {
    REACH: REACH,
    SEE: SEE,
    SPEED: SPEED,
    IDLE_BELOW: IDLE_BELOW,
    STARVE: STARVE,
    BIRTH: BIRTH,
    defaultTraits: defaultTraits,
    createBleb: createBleb,
    createSim: createSim,
    step: step,
    present: present,
    senseWorld: senseWorld,
    exportState: Carry.exportState,
    importState: Carry.importState
  };
});
