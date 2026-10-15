/* Room knobs. Safe for a click handler to call.
   Food, ball, nest, hand, and ambient heat live here. No chemistry, no drives. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WebWorld = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var FOOD_COLOR = "#f6c66a";
  var PLAY_COLOR = "#f8a8c6";
  var SLEEP_COLOR = "#c3aef0";
  var HEAT_COLOR = "#f5a98f";
  var COLD_COLOR = "#9cd0ee";
  var MUTE = "#8d80a0";

  function createWorld() {
    return {
      // Seam: a later slice swaps place ("park", "beach") and the object table.
      place: "home",
      ambient: 50,
      yawn: 0,
      food: null,
      ball: null,
      nest: null,
      hand: null
    };
  }

  function clampX(x) {
    return Math.max(8, Math.min(92, Math.round(x)));
  }

function awayFrom(blebX, rng) {
  var x = 8 + Math.floor(rng() * 84);
  // Keep the stimulus a short walk away, so approach is visible.
  if (Math.abs(x - blebX) < 34) x = blebX < 50 ? blebX + 42 : blebX - 42;
  return clampX(x);
}

  function knobFeed(world, blebX, rng) {
    if (world.food) return { msg: "A pellet is already on the floor.", color: MUTE };
    world.food = { kind: "food", x: awayFrom(blebX, rng), age: 0, life: 55, bites: 1 };
    return { msg: "You set a pellet on the floor.", color: FOOD_COLOR };
  }

  function knobPlay(world, blebX, rng) {
    world.ball = { kind: "ball", x: awayFrom(blebX, rng), age: 0, life: 36, bouts: 4 };
    return { msg: "You toss a ball across the room.", color: PLAY_COLOR };
  }

  function knobSleep(world, blebX) {
    world.nest = { kind: "nest", x: blebX < 50 ? 82 : 16, age: 0, life: 48 };
    world.yawn = 10;
    return { msg: "You fluff a nest and dim the lights.", color: SLEEP_COLOR };
  }

  function knobPet(world, blebX) {
    world.hand = { kind: "hand", x: clampX(blebX), age: 0, life: 14 };
    return { msg: "You offer your hand.", color: PLAY_COLOR };
  }

  function knobWarm(world) {
    if (world.ambient >= 100) return { msg: "The room can't get any warmer.", color: HEAT_COLOR };
    world.ambient = Math.min(100, world.ambient + 12);
    return { msg: "You warm the room.", color: HEAT_COLOR };
  }

  function knobCool(world) {
    if (world.ambient <= 0) return { msg: "The room can't get any cooler.", color: COLD_COLOR };
    world.ambient = Math.max(0, world.ambient - 12);
    return { msg: "You cool the room.", color: COLD_COLOR };
  }

  // Stimuli expire on their own if the creature never takes them up.
  function ageWorld(world) {
    var notes = {
      food: ["The pellet goes stale, untouched.", MUTE],
      ball: ["The ball rolls away, unnoticed.", MUTE],
      nest: ["The nest cools off, unused.", MUTE],
      hand: ["Your hand withdraws.", MUTE]
    };
    var events = [];
    var keys = ["food", "ball", "nest", "hand"];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var obj = world[key];
      if (!obj) continue;
      obj.age += 1;
      if (obj.age >= obj.life) {
        world[key] = null;
        events.push({ msg: notes[key][0], color: notes[key][1] });
      }
    }
    if (world.yawn > 0) world.yawn -= 1;
    return events;
  }

  return {
    createWorld: createWorld,
    knobFeed: knobFeed,
    knobPlay: knobPlay,
    knobSleep: knobSleep,
    knobPet: knobPet,
    knobWarm: knobWarm,
    knobCool: knobCool,
    ageWorld: ageWorld
  };
});
