/* Plain checks for the chemistry and the knob rule.
   node js/checks.js    or open test.html */
(function (root) {
  "use strict";

    function runChecks(api, fs, path) {
    var chem = api.chem;
    var world = api.world;
    var bleb = api.bleb;
    var genome = api.genome;
    var link = api.link;
    var lines = [];
    var ok = 0;
    var fail = 0;

    function check(name, cond) {
      if (cond) { ok++; lines.push("ok   " + name); }
      else { fail++; lines.push("FAIL " + name); }
    }

    function snap(sim) {
      return Array.from(sim.bleb.body.conc);
    }

    function same(a, b) {
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
      return true;
    }

    function setDrives(sim, hunger, boredom, loneliness, sleepiness) {
      var c = sim.bleb.body.conc;
      c[chem.HUNGER] = hunger;
      c[chem.BOREDOM] = boredom;
      c[chem.LONELINESS] = loneliness;
      c[chem.SLEEPINESS] = sleepiness;
    }

    function fresh(opts) {
      return placed(bleb.createSim({ seed: 1, noise: 0, genes: opts.genes }), opts);
    }

    function placed(sim, opts) {
      setDrives(sim, opts.hunger, opts.boredom, opts.loneliness, opts.sleepiness);
      if (opts.x != null) sim.bleb.x = opts.x;
      if (opts.food != null) sim.world.food = { kind: "food", x: opts.food, age: 0, life: 80, bites: 1 };
      if (opts.ball != null) sim.world.ball = { kind: "ball", x: opts.ball, age: 0, life: 80, bouts: 4 };
      if (opts.nest != null) sim.world.nest = { kind: "nest", x: opts.nest, age: 0, life: 80 };
      return sim;
    }

    function msgs(events) {
      return events.map(function (e) { return e.msg; }).join(" | ");
    }

    check("decay tables are 32 entries", chem.EVERY.length === 32 && chem.MULTIPLIERS.length === 32);
    check("molecule decay 200 → 190", chem.decayChemical(200, 6 << 3, 0) === 190);
    check("drive decay waits for its mask", chem.decayChemical(200, 13 << 3, 0) === 200);
    check("drive decay on tick 63 → 194", chem.decayChemical(200, 13 << 3, 63) === 194);
    check("reaction-rate decay 100 → 44", chem.decayChemical(100, 2 << 3, 1) === 44);
    check("saturating add/sub/mul", chem.addSat(250, 10) === 255 && chem.subSat(3, 9) === 0 && chem.mulSat(20, 20) === 255);

    var conc = new Uint8Array(256);
    conc[chem.FOOD] = 100;
    conc[chem.HUNGER] = 100;
    chem.runReaction(conc, [1, chem.FOOD, 1, chem.HUNGER, 2 << 3, 0, 0, 0, 0], 1);
    check("food × hunger cancels to 44/44", conc[chem.FOOD] === 44 && conc[chem.HUNGER] === 44);

    var body = new chem.Body();
    body.conc[chem.FOOD] = 100;
    body.conc[chem.HUNGER] = 100;
    body.tick();
    check("body tick digests to food 41 hunger 46", body.conc[chem.FOOD] === 41 && body.conc[chem.HUNGER] === 46);
    check("pressure raised the other drives", body.conc[chem.BOREDOM] === 2 && body.conc[chem.SLEEPINESS] === 1 && body.conc[chem.LONELINESS] === 1);
    check("emit records a source", body.lastSource[chem.HUNGER] === "time" || body.lastSource[chem.FOOD] === "eat" || body.lastSource[chem.BOREDOM] === "time");

    var sleepy = new chem.Body();
    sleepy.asleep = 8;
    sleepy.conc[chem.SLEEPINESS] = 180;
    for (var s = 0; s < 8; s++) sleepy.tick();
    check("eight sleeps clear sleepiness", sleepy.conc[chem.SLEEPINESS] === 0 && sleepy.asleep === 0);
    check("rest and a little hunger remain", sleepy.conc[chem.REST] === 241 && sleepy.conc[chem.HUNGER] === 8);

    var scaled = new chem.Body();
    scaled.pressure.hunger = 2;
    scaled.tick();
    check("pressure seam scales hunger weather", scaled.conc[chem.HUNGER] === 4);

    function fixedCreature() {
      var c = new Uint8Array(256);
      var decay = new Uint8Array(256);
      c[chem.FOOD] = 100;
      c[chem.HUNGER] = 80;
      c[chem.BOREDOM] = 10;
      decay[chem.FOOD] = 6 << 3;
      decay[chem.HUNGER] = 13 << 3;
      decay[chem.BOREDOM] = 8 << 3;
      return {
        conc: c,
        decay: decay,
        reactions: [
          [1, chem.FOOD, 1, chem.HUNGER, 2 << 3, 0, 0, 0, 0],
          [0, 0, 0, 0, 40, 1, chem.BOREDOM, 0, 0]
        ],
        active: [chem.FOOD, chem.HUNGER, chem.BOREDOM],
        biotick: 0
      };
    }

    function cloneState(state) {
      return {
        conc: new Uint8Array(state.conc),
        decay: new Uint8Array(state.decay),
        reactions: state.reactions,
        active: state.active.slice(),
        biotick: state.biotick
      };
    }

    var naive = fixedCreature();
    var sparse = cloneState(naive);
    var matched = true;
    for (var t = 0; t < 80; t++) {
      chem.engineTick(naive, false);
      chem.engineTick(sparse, true);
      if (t === 0) {
        check("engine tick golden food/hunger/boredom", naive.conc[chem.FOOD] === 50 && naive.conc[chem.HUNGER] === 35 && naive.conc[chem.BOREDOM] === 35);
      }
      if (!same(naive.conc, sparse.conc)) matched = false;
    }
    check("sparse and full chemistry stay identical", matched);

    var fed = fresh({ hunger: 140, boredom: 20, loneliness: 20, sleepiness: 20, x: 30 });
    var beforeFeed = snap(fed);
    var feedMsg = world.knobFeed(fed.world, fed.bleb.x, fed.rng);
    check("Feed places a pellet", !!fed.world.food && /pellet/.test(feedMsg.msg));
    check("Feed does not touch chemistry", same(beforeFeed, snap(fed)) && fed.bleb.body.asleep === 0);

    var approach = fresh({ hunger: 140, boredom: 10, loneliness: 10, sleepiness: 10, x: 20, food: 78 });
    bleb.step(approach);
    check("hungry bleb walks toward food", approach.bleb.verb === "move" && approach.bleb.body.conc[chem.FOOD] === 0);
    var ate = false;
    var sawFoodChem = false;
    var relievedEarly = false;
    for (var i = 0; i < 16; i++) {
      var ev = bleb.step(approach);
      var chew = /starts chewing/.test(msgs(ev));
      if (approach.bleb.body.conc[chem.FOOD] > 0) sawFoodChem = true;
      if (!ate && !chew && approach.bleb.body.conc[chem.HUNGER] < 140) relievedEarly = true;
      if (chew) ate = true;
    }
    check("bleb eats after arriving", ate && sawFoodChem);
    check("hunger does not fall while walking", !relievedEarly);
    check("hunger falls only once the meal is digesting", approach.bleb.body.conc[chem.HUNGER] < 140);

    var bored = fresh({ hunger: 20, boredom: 160, loneliness: 20, sleepiness: 20, x: 40, ball: 40 });
    var boredomBefore = bored.bleb.body.conc[chem.BOREDOM];
    var playEv = bleb.step(bored);
    check("bored bleb plays", bored.bleb.verb === "play" && /bats the ball/.test(msgs(playEv)));
    check("boredom falls through the novelty reaction", bored.bleb.body.conc[chem.BOREDOM] < boredomBefore);

    var tired = fresh({ hunger: 10, boredom: 220, loneliness: 10, sleepiness: 190, x: 40, ball: 40 });
    var tiredEv = bleb.step(tired);
    check("a tired bleb does not play", tired.bleb.body.conc[chem.NOVELTY] === 0 && tired.bleb.verb !== "play");
    check("the ball is only glanced at", /too tired/.test(msgs(tiredEv)));

    var lonely = fresh({ hunger: 10, boredom: 10, loneliness: 160, sleepiness: 10, x: 40 });
    var beforePet = snap(lonely);
    world.knobPet(lonely.world, lonely.bleb.x);
    check("Pet does not write loneliness", same(beforePet, snap(lonely)));
    var petEv = bleb.step(lonely);
    check("accepted contact eases loneliness", /leans into/.test(msgs(petEv)) && lonely.bleb.body.conc[chem.LONELINESS] < 160);

    var aloof = fresh({ hunger: 10, boredom: 10, loneliness: 10, sleepiness: 10, x: 40 });
    world.knobPet(aloof.world, aloof.bleb.x);
    bleb.step(aloof);
    check("a content bleb does not take company", aloof.bleb.body.conc[chem.COMPANY] === 0);

    var nap = fresh({ hunger: 10, boredom: 10, loneliness: 10, sleepiness: 170, x: 40, nest: 40 });
    var napEv = bleb.step(nap);
    check("sleepy bleb chooses the nest", nap.bleb.body.asleep > 0 && /curls up/.test(msgs(napEv)));
    check("sleepiness falls by resting, not by the offer", nap.bleb.body.conc[chem.SLEEPINESS] < 170);

    var wideAwake = fresh({ hunger: 10, boredom: 10, loneliness: 10, sleepiness: 40, x: 40, nest: 40 });
    var beforeNest = snap(wideAwake);
    var nestOffer = world.knobSleep(wideAwake.world, 10);
    check("Sleep only offers a nest", wideAwake.bleb.body.asleep === 0 && same(beforeNest, snap(wideAwake)) && /nest/.test(nestOffer.msg));
    var refuseNap = bleb.step(wideAwake);
    check("a wakeful bleb can refuse the nest", wideAwake.bleb.body.asleep === 0);

    var warm = fresh({ hunger: 80, boredom: 80, loneliness: 80, sleepiness: 80, x: 40 });
    var beforeWarm = snap(warm);
    world.knobWarm(warm.world);
    world.knobWarm(warm.world);
    check("Warm does not write the body", same(beforeWarm, snap(warm)) && warm.world.ambient === 74);
    var panted = false;
    var heatBefore = warm.bleb.body.conc[chem.HEAT];
    for (var w = 0; w < 24; w++) {
      var wev = bleb.step(warm);
      if (/pants/.test(msgs(wev))) panted = true;
    }
    check("felt heat follows the room and the bleb notices", panted && warm.bleb.body.conc[chem.HEAT] > heatBefore);

    var cool = fresh({ hunger: 80, boredom: 40, loneliness: 40, sleepiness: 40, x: 40 });
    var beforeCool = snap(cool);
    world.knobCool(cool.world);
    world.knobCool(cool.world);
    world.knobCool(cool.world);
    check("Cool does not write the body", same(beforeCool, snap(cool)) && cool.world.ambient === 14);
    var shivered = false;
    for (var k = 0; k < 24; k++) {
      if (/shivers/.test(msgs(bleb.step(cool)))) shivered = true;
    }
    check("a cooled room is felt, not assigned", shivered);

    var stuffed = fresh({ hunger: 60, boredom: 5, loneliness: 5, sleepiness: 5, x: 40, food: 40 });
    stuffed.bleb.body.conc[chem.FOOD] = 130;
    var vomitEv = bleb.step(stuffed);
    check("overeating is a spit-up, not a hunger write", /spits/.test(msgs(vomitEv)) && stuffed.world.food === null);
    check("vomit emits punishment", stuffed.bleb.body.conc[chem.PUNISHMENT] > 0 && stuffed.bleb.body.conc[chem.HUNGER] >= 60);

    var asleep = fresh({ hunger: 10, boredom: 200, loneliness: 10, sleepiness: 10, x: 40, ball: 40 });
    asleep.bleb.body.asleep = 5;
    bleb.step(asleep);
    check("sleep is not interrupted by a ball", asleep.bleb.verb === "sleep" && asleep.bleb.body.conc[chem.NOVELTY] === 0);

    var view = bleb.present(fed);
    check("bars are need readouts", view.bars.hunger === fed.bleb.body.needs().hunger && view.bars.social === fed.bleb.body.needs().social && view.bars.temp >= 0);

    var carried = fresh({ hunger: 140, boredom: 40, loneliness: 55, sleepiness: 70, x: 22, food: 80 });
    for (var c = 0; c < 6; c++) bleb.step(carried);
    var packet = bleb.exportState(carried);
    var packed = JSON.stringify(packet);
    check("creature packet is plain and compact", packet.v === 1 && !packet.world && !packet.traits && packed.length < 2000 && Object.keys(packet.body.chem).length < 20);
    check("genome is seven bytes", packet.g.length === 7 && packet.g.join() === "128,128,128,128,128,128,128");
    var restored = bleb.createSim({ seed: 9, noise: 0 });
    restored.world.ambient = 77;
    bleb.importState(restored, JSON.parse(packed));
    check("packet round-trips the body", restored.bleb.body.conc[chem.HUNGER] === carried.bleb.body.conc[chem.HUNGER] && restored.bleb.body.conc[chem.BOREDOM] === carried.bleb.body.conc[chem.BOREDOM] && restored.bleb.body.biotick === carried.bleb.body.biotick && restored.bleb.x === carried.bleb.x);
    check("packet round-trips the genome", restored.bleb.genome.join() === carried.bleb.genome.join() && restored.bleb.traits.refuseEatBelow === carried.bleb.traits.refuseEatBelow);
    check("packet leaves the room behind", restored.world.food === null && restored.world.ambient === 77 && restored.lifecycle === "stasis");
    var liveHunger = carried.bleb.body.conc[chem.HUNGER];
    packet.body.chem[chem.HUNGER] = liveHunger === 3 ? 4 : 3;
    check("export does not share the live chemistry", carried.bleb.body.conc[chem.HUNGER] === liveHunger);

    var ruined = fresh({ hunger: 255, boredom: 255, loneliness: 255, sleepiness: 255, x: 40 });
    for (var r = 0; r < 20; r++) bleb.step(ruined);
    check("stasis does not end a ruined creature", ruined.phase === "awake" && ruined.lifecycle === "stasis" && ruined.bleb.body.biotick === 20);

    var paused = fresh({ hunger: 80, boredom: 20, loneliness: 20, sleepiness: 20, x: 40 });
    paused.phase = "dormant";
    var pausedTick = paused.bleb.body.biotick;
    bleb.step(paused);
    check("a dormant phase skips chemistry", paused.bleb.body.biotick === pausedTick);
    check("stasis returns a paused creature to awake", paused.phase === "awake");

    var unnamed = fresh({ hunger: 80, boredom: 20, loneliness: 20, sleepiness: 20, x: 40 });
    unnamed.lifecycle = "mortal";
    bleb.step(unnamed);
    check("an unplugged mortality does not kill", unnamed.phase === "awake" && unnamed.bleb.body.biotick === 1);

    var mid = genome.express(genome.neutral());
    check("neutral genome keeps the even thresholds", mid.refuseEatBelow === 48 && mid.playMinBoredom === 36 && mid.sleepMin === 50 && mid.companyMin === 33 && mid.comfort.low === 76 && mid.comfort.high === 178 && mid.noveltyFromPet === 8);
    check("neutral pressure stays on the page pace", mid.pressure.hunger > 0.34 && mid.pressure.hunger < 0.36 && mid.pressure.sleepiness > 0.21 && mid.pressure.sleepiness < 0.23);
    check("an unhatched sim stays even", bleb.createSim({ seed: 1, noise: 0 }).bleb.genome.join() === "128,128,128,128,128,128,128");

    var dainty = fresh({ genes: [0, 128, 128, 128, 128, 128, 128], hunger: 60, boredom: 5, loneliness: 5, sleepiness: 5, x: 40, food: 40 });
    var daintyEv = bleb.step(dainty);
    check("a dainty norn refuses a mild hunger", dainty.bleb.body.conc[chem.FOOD] === 0 && /too full/.test(msgs(daintyEv)));
    var greedy = fresh({ genes: [255, 128, 128, 128, 128, 128, 128], hunger: 40, boredom: 5, loneliness: 5, sleepiness: 5, x: 40, food: 40 });
    var greedyEv = bleb.step(greedy);
    check("a greedy norn eats sooner", greedy.bleb.body.conc[chem.FOOD] > 0 && /chewing/.test(msgs(greedyEv)));

    var solemn = fresh({ genes: [128, 0, 128, 128, 128, 128, 128], hunger: 10, boredom: 40, loneliness: 10, sleepiness: 10, x: 40, ball: 40 });
    var solemnEv = bleb.step(solemn);
    check("a solemn norn leaves the ball", solemn.bleb.body.conc[chem.NOVELTY] === 0 && /glances at the ball/.test(msgs(solemnEv)));
    var playful = fresh({ genes: [128, 255, 128, 128, 128, 128, 128], hunger: 10, boredom: 40, loneliness: 10, sleepiness: 10, x: 40, ball: 40 });
    var playfulEv = bleb.step(playful);
    check("a playful norn bats a mild boredom", playful.bleb.verb === "play" && playful.bleb.body.conc[chem.BOREDOM] < 40 && /bats the ball/.test(msgs(playfulEv)));

    var clingy = fresh({ genes: [128, 128, 255, 128, 128, 128, 128], hunger: 10, boredom: 10, loneliness: 40, sleepiness: 10, x: 40 });
    world.knobPet(clingy.world, clingy.bleb.x);
    var clingEv = bleb.step(clingy);
    check("a clingy norn accepts a mild loneliness", /leans into/.test(msgs(clingEv)) && clingy.bleb.body.conc[chem.COMPANY] > 0);
    var indie = fresh({ genes: [128, 128, 0, 128, 128, 128, 128], hunger: 10, boredom: 10, loneliness: 40, sleepiness: 10, x: 40 });
    world.knobPet(indie.world, indie.bleb.x);
    bleb.step(indie);
    check("an independent norn skips a mild loneliness", indie.bleb.body.conc[chem.COMPANY] === 0);

    function warmed(gene) {
      var sim = fresh({ genes: [128, 128, 128, gene, 128, 128, 128], hunger: 10, boredom: 10, loneliness: 10, sleepiness: 40, x: 40 });
      sim.world.ambient = 0;
      sim.bleb.body.conc[chem.HEAT] = 200;
      return sim;
    }
    var coolLove = warmed(0);
    var warmLove = warmed(255);
    bleb.step(coolLove);
    bleb.step(warmLove);
    check("cool-loving feels heat that warm-loving tolerates", coolLove.bleb.traits.comfort.high < 200 && warmLove.bleb.traits.comfort.high > 200 && coolLove.bleb.body.conc[chem.SLEEPINESS] > warmLove.bleb.body.conc[chem.SLEEPINESS]);

    function metabolise(gene) {
      return placed(bleb.createSim({ seed: 3, noise: 0, genes: [128, 128, 128, 128, gene, 128, 128] }), { hunger: 0, boredom: 0, loneliness: 0, sleepiness: 0, x: 40 });
    }
    var delicate = metabolise(255);
    var hardy = metabolise(0);
    for (var meta = 0; meta < 30; meta++) {
      bleb.step(delicate);
      bleb.step(hardy);
    }
    check("a delicate metabolism hungers faster than a hardy one", delicate.bleb.body.conc[chem.HUNGER] > hardy.bleb.body.conc[chem.HUNGER]);

    var drowsy = fresh({ genes: [128, 128, 128, 128, 128, 255, 128], hunger: 10, boredom: 10, loneliness: 10, sleepiness: 45, x: 40, nest: 40 });
    var drowsyEv = bleb.step(drowsy);
    check("a drowsy norn takes a mild sleepiness to the nest", drowsy.bleb.body.asleep > 0 && /curls up/.test(msgs(drowsyEv)));
    var alertNorn = fresh({ genes: [128, 128, 128, 128, 128, 0, 128], hunger: 10, boredom: 10, loneliness: 10, sleepiness: 45, x: 40, nest: 40 });
    var alertEv = bleb.step(alertNorn);
    check("an alert norn refuses that same nest", alertNorn.bleb.body.asleep === 0 && /isn't sleepy/.test(msgs(alertEv)));

    var quiet = fresh({ genes: [128, 128, 128, 128, 128, 128, 0], hunger: 10, boredom: 40, loneliness: 160, sleepiness: 10, x: 40 });
    var chatty = fresh({ genes: [128, 128, 128, 128, 128, 128, 255], hunger: 10, boredom: 40, loneliness: 160, sleepiness: 10, x: 40 });
    world.knobPet(quiet.world, quiet.bleb.x);
    world.knobPet(chatty.world, chatty.bleb.x);
    bleb.step(quiet);
    bleb.step(chatty);
    check("a chatty norn takes more novelty from a hand", chatty.bleb.body.conc[chem.BOREDOM] < quiet.bleb.body.conc[chem.BOREDOM]);

    var parent = [200, 10, 128, 255, 0, 90, 140];
    var child = genome.inherit(parent.slice(), bleb.createSim({ seed: 2, noise: 0 }).rng);
    var near = child.length === 7;
    for (var gene = 0; gene < 7; gene++) {
      if (child[gene] < 0 || child[gene] > 255 || Math.abs(child[gene] - parent[gene]) > 8) near = false;
    }
    check("a child genome stays near its parent", near && parent.join() === "200,10,128,255,0,90,140");

    var egg = fresh({ hunger: 255, boredom: 255, loneliness: 255, sleepiness: 255, x: 40, food: 40 });
    egg.world.ambient = 63;
    var hatched = bleb.hatch(egg);
    check("hatch is a new body, not a drive write", egg.bleb.body.conc[chem.HUNGER] === bleb.BIRTH.hunger && egg.bleb.body.conc[chem.BOREDOM] === bleb.BIRTH.boredom && egg.bleb.body.conc[chem.LONELINESS] === bleb.BIRTH.loneliness && egg.world.food === null && egg.world.ambient === 63 && /hatches/.test(hatched.msg));
    var rolled = egg.bleb.genome;
    var rolledOk = rolled.length === 7 && rolled.join() !== "128,128,128,128,128,128,128";
    for (var byte = 0; byte < rolled.length; byte++) if (rolled[byte] < 0 || rolled[byte] > 255) rolledOk = false;
    check("hatch rolls a genome", rolledOk);
    check("traits show as words, not bars", bleb.present(egg).traitsText && bleb.present(bleb.createSim({ seed: 1, noise: 0 })).traitsText === "even-tempered");

    var carriedLink = fresh({ hunger: 180, boredom: 40, loneliness: 55, sleepiness: 70, x: 44 });
    carriedLink.bleb.name = "Pip";
    carriedLink.bleb.born = 1700000000000;
    carriedLink.bleb.color = "#9cd0ee";
    carriedLink.bleb.genome = [9, 8, 7, 6, 5, 4, 3];
    carriedLink.bleb.traits = genome.express(carriedLink.bleb.genome);
    carriedLink.world.ambient = 61;
    carriedLink.world.food = { kind: "food", x: 10, age: 0, life: 10, bites: 1 };
    var snap = bleb.exportState(carriedLink);
    var frag = link.encodeFragment(snap);
    var opened = link.decodeFragment("#" + frag);
    var host = bleb.createSim({ seed: 3, noise: 0 });
    host.world.ambient = 61;
    host.world.food = { kind: "food", x: 10, age: 0, life: 10, bites: 1 };
    bleb.importState(host, opened.packet);
    check("a link round-trips the saved body", opened.ok && opened.packet.v === 1 && host.bleb.name === "Pip" && host.bleb.born === 1700000000000 && host.bleb.genome.join() === "9,8,7,6,5,4,3" && host.bleb.body.conc[chem.HUNGER] === carriedLink.bleb.body.conc[chem.HUNGER] && host.bleb.x === 44 && host.bleb.body.biotick === carriedLink.bleb.body.biotick);
    check("a link leaves the room behind", host.world.ambient === 61 && host.world.food && !opened.packet.world && frag.indexOf("n1.") === 0);

    function spoil(text) {
      var at = text.indexOf(".") + 4;
      var ch = text.charAt(at) === "a" ? "b" : "a";
      return text.slice(0, at) + ch + text.slice(at + 1);
    }
    var damaged = link.decodeFragment(spoil(frag));
    var old = link.decodeFragment("#n0.aaaa.00000000");
    var junk = link.decodeFragment("#nope");
    var blank = link.decodeFragment("");
    var future = link.decodeFragment(link.encodeFragment({ v: 2, name: "Pip", g: [1, 2, 3, 4, 5, 6, 7], born: 1, body: { chem: {} } }));
    var wild = link.decodeFragment(link.encodeFragment({ v: 1, name: "Pip", g: [1, 2, 3, 4, 5, 6, 7], born: 1, body: { chem: { 150: 999 } } }));
    check("a damaged fragment is refused", !damaged.ok && damaged.reason === "checksum" && !old.ok && old.reason === "version" && !junk.ok && junk.reason === "version" && !blank.ok && blank.reason === "empty" && future.reason === "version" && wild.reason === "corrupt");

    var code = link.encodeSeed({ name: "Pip", g: [9, 8, 7, 6, 5, 4, 3] });
    var spoken = link.decodeSeed(code);
    var said = code.split(" ");
    said[2] = said[2] === said[0] ? said[1] : said[0];
    var typo = link.decodeSeed(said.join(" "));
    var custom = link.decodeSeed(link.encodeSeed({ name: "Ziggy", g: [128, 128, 128, 128, 128, 128, 128] }));
    check("a seed round-trips name and genome", spoken.ok && spoken.name === "Pip" && spoken.g.join() === "9,8,7,6,5,4,3" && said.length === 7 && !spoken.body);
    check("a mistyped seed is refused", !typo.ok && !link.decodeSeed("").ok && !link.decodeSeed("not-a-seed").ok);
    check("a custom name still fits in a seed", custom.ok && custom.name === "Ziggy" && custom.g.join() === "128,128,128,128,128,128,128");
    check("seed names match hatch names", link.NAMES.join() === bleb.NAMES.join());

    var memory = { bag: {}, getItem: function (k) { return this.bag[k] == null ? null : this.bag[k]; }, setItem: function (k, v) { this.bag[k] = String(v); } };
    link.saveLocal(memory, snap);
    var kept = link.loadLocal(memory);
    check("local storage keeps the packet", kept && kept.name === "Pip" && kept.g.join() === "9,8,7,6,5,4,3" && kept.body.chem[chem.HUNGER] === snap.body.chem[chem.HUNGER]);
    check("a broken local save is ignored", link.loadLocal({ getItem: function () { return "{"; } }) === null);

    var resident = { name: "Mote", born: 42, g: [1, 1, 1, 1, 1, 1, 1] };
    check("a link for someone else asks first", link.decideBoot(resident, opened).action === "offer" && link.decideBoot(null, opened).action === "restore" && link.decideBoot(resident, opened).link.name === "Pip");
    check("the same norn comes back from the link", link.decideBoot(snap, opened).action === "restore" && link.decideBoot(snap, opened).from === "link" && link.sameNorn(snap, opened.packet));
    check("an empty address keeps the local norn", link.decideBoot(snap, blank).action === "restore" && link.decideBoot(snap, blank).from === "local");
    check("a bad link does not replace a saved norn", link.decideBoot(snap, damaged).from === "local" && link.decideBoot(snap, damaged).warn === "checksum" && link.decideBoot(null, damaged).action === "hatch");
    check("the fragment waits before rewriting history", link.due(3999, 0, false) === false && link.due(4000, 0, false) === true && link.due(10, 0, true) === true && resident.name === "Mote");

    var seeded = fresh({ hunger: 255, boredom: 10, loneliness: 10, sleepiness: 10, x: 70, food: 70 });
    seeded.world.ambient = 63;
    bleb.summon(seeded, { name: spoken.name, genes: spoken.g, color: "#9cd0ee" });
    check("a seed arrives as birth chemistry", seeded.bleb.name === "Pip" && seeded.bleb.body.conc[chem.HUNGER] === bleb.BIRTH.hunger && seeded.world.food === null && seeded.world.ambient === 63);

    if (fs && path) {
      var worldSrc = fs.readFileSync(path.join(__dirname, "world.js"), "utf8");
      var uiSrc = fs.readFileSync(path.join(__dirname, "ui.js"), "utf8");
      check("world.js never emits or touches concentrations", !/\.emit\(/.test(worldSrc) && !/\.conc\[/.test(worldSrc) && !/asleep/.test(worldSrc));
      check("ui.js never emits or touches concentrations", !/\.emit\(/.test(uiSrc) && !/\.conc\[/.test(uiSrc));
      var names = ["chem.js", "world.js", "genome.js", "face.js", "carry.js", "life.js", "bleb.js", "link.js", "ui.js", "checks.js"];
      var tooBig = "";
      for (var f = 0; f < names.length; f++) {
        var linesIn = fs.readFileSync(path.join(__dirname, names[f]), "utf8").split("\n").length;
        if (linesIn > 500) tooBig += names[f] + " " + linesIn + " ";
      }
      check("js files stay under 500 lines", tooBig === "");
    }

    lines.push("");
    lines.push(fail === 0 ? (ok + " passed") : (fail + " failed, " + ok + " passed"));
    return { ok: ok, fail: fail, lines: lines };
  }

  if (typeof module === "object" && module.exports && typeof require === "function" && require.main === module) {
    var result = runChecks({
      chem: require("./chem.js"),
      world: require("./world.js"),
      bleb: require("./bleb.js"),
      genome: require("./genome.js"),
      link: require("./link.js")
    }, require("fs"), require("path"));
    for (var i = 0; i < result.lines.length; i++) console.log(result.lines[i]);
    process.exit(result.fail ? 1 : 0);
  } else if (typeof window !== "undefined") {
    window.runWebagotchiChecks = function () {
      return runChecks({ chem: window.WebChem, world: window.WebWorld, bleb: window.WebBleb, genome: window.WebGenome, link: window.WebLink }, null, null);
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
