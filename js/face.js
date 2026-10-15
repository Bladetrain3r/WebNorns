/* Readouts from chemicals and the verb. The buttons never feed this. */
(function (root, factory) {
  var Chem = root.WebChem || (typeof require === "function" ? require("./chem.js") : null);
  var Genome = root.WebGenome || (typeof require === "function" ? require("./genome.js") : null);
  var api = factory(Chem, Genome);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WebFace = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Chem, Genome) {
  "use strict";

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
    var heat = body.conc[Chem.HEAT];
    var comfort = sim.bleb.traits.comfort;
    var bits = [];
    if (d.loneliness > 170) bits.push("lonely");
    if (d.hunger > 190) bits.push("starving");
    else if (d.hunger > 120) bits.push("hungry");
    else if (d.hunger < 40) bits.push("stuffed");
    if (d.sleepiness > 190) bits.push("exhausted");
    else if (d.sleepiness > 130) bits.push("tired");
    if (d.boredom > 170) bits.push("bored");
    if (heat > comfort.high) bits.push("too warm");
    else if (heat < comfort.low) bits.push("cold");
    if (!bits.length) return name + " is doing okay.";
    return name + " is " + joinAnd(bits) + ".";
  }

  function present(sim) {
    var bleb = sim.bleb;
    var body = bleb.body;
    var needs = body.needs();
    var drives = body.drives();
    var mood = moodOf(body);
    var heat = body.conc[Chem.HEAT];
    var comfort = bleb.traits.comfort;
    var temp = Math.round(heat * 100 / 255);
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
      traitsText: Genome.words(bleb.genome),
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
        sweat: heat > comfort.high,
        shiver: heat < comfort.low,
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

  return { present: present };
});
