/* Paint the room. Buttons call world knobs only; the tick calls bleb.step. */
(function () {
  "use strict";

  var MOUTH = {
    big: "M86,112 Q100,128 114,112",
    small: "M92,116 Q100,123 108,116",
    tiny: "M94,118 Q100,122 106,118",
    flat: "M90,119 L110,119",
    frown: "M88,123 Q100,111 112,123"
  };

  var TICK_MS = 700;
  var sim = WebBleb.createSim({});
  var logEl = document.getElementById("log");

  function pushLog(ev) {
    if (!ev || !ev.msg) return;
    var row = document.createElement("div");
    var time = document.createElement("span");
    time.className = "time";
    var now = new Date();
    time.textContent = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    var msg = document.createElement("span");
    msg.style.color = ev.color || "#d8cfe6";
    msg.textContent = " " + ev.msg;
    row.appendChild(time);
    row.appendChild(msg);
    logEl.appendChild(row);
    while (logEl.children.length > 120) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function ageLabel(ms) {
    var m = Math.floor(ms / 60000);
    var h = Math.floor(m / 60);
    var d = Math.floor(h / 24);
    if (d > 0) return d + "d " + (h % 24) + "h old";
    if (h > 0) return h + "h " + (m % 60) + "m old";
    if (m > 0) return m + "m old";
    return "just hatched";
  }

  function render() {
    var view = WebBleb.present(sim);
    document.getElementById("pet-name").textContent = view.name;
    document.getElementById("mood-label").textContent = view.mood.label;
    document.getElementById("age-label").textContent = ageLabel(Date.now() - view.born);
    document.getElementById("mood-emoji").textContent = view.mood.emoji;
    document.getElementById("status").textContent = view.status;
    document.getElementById("room-pill").textContent = "room " + view.ambient;

    var bars = ["hunger", "energy", "fun", "social", "temp"];
    for (var i = 0; i < bars.length; i++) {
      var key = bars[i];
      var pct = Math.max(0, Math.min(100, view.bars[key]));
      document.getElementById("num-" + key).textContent = Math.round(pct) + "%";
      document.getElementById("fill-" + key).style.width = pct + "%";
    }
    var tempFill = document.getElementById("fill-temp");
    tempFill.style.background = view.bars.temp > 70 ? "#f5a98f" : view.bars.temp < 30 ? "#9cd0ee" : "#b9d6a8";

    var bleb = document.getElementById("bleb");
    bleb.style.left = view.x + "%";
    var skins = document.querySelectorAll(".skin");
    for (var s = 0; s < skins.length; s++) skins[s].setAttribute("fill", view.color);

    document.getElementById("eyes-open").hidden = view.face.eyes !== "open";
    document.getElementById("eyes-sleep").hidden = view.face.eyes !== "sleep";
    document.getElementById("mouth").setAttribute("d", MOUTH[view.face.mouth] || MOUTH.small);
    document.getElementById("tear").hidden = !view.face.tear;
    document.getElementById("sweat").hidden = !view.face.sweat;
    document.getElementById("zzz").hidden = !view.face.zzz;
    var cheek = view.face.cheeks ? "0.7" : "0.35";
    document.getElementById("cheek-l").setAttribute("opacity", cheek);
    document.getElementById("cheek-r").setAttribute("opacity", cheek);

    var bob = document.getElementById("bob");
    if (bob.dataset.anim !== view.face.anim) {
      bob.dataset.anim = view.face.anim;
      bob.className = "bob " + view.face.anim;
    }
    var shiver = document.getElementById("shiver");
    if (view.face.shiver) shiver.setAttribute("class", "shiver");
    else shiver.removeAttribute("class");

    var things = ["food", "ball", "nest", "hand"];
    for (var t = 0; t < things.length; t++) {
      var kind = things[t];
      var el = document.getElementById("obj-" + kind);
      var x = view.objects[kind];
      el.hidden = x == null;
      if (x != null) el.style.left = x + "%";
    }
    document.getElementById("obj-ball").classList.toggle("wobble", view.verb === "play");
  }

  function bind(id, fn) {
    document.getElementById(id).addEventListener("click", function () {
      pushLog(fn());
      render();
    });
  }

  bind("btn-feed", function () { return WebWorld.knobFeed(sim.world, sim.bleb.x, sim.rng); });
  bind("btn-play", function () { return WebWorld.knobPlay(sim.world, sim.bleb.x, sim.rng); });
  bind("btn-sleep", function () { return WebWorld.knobSleep(sim.world, sim.bleb.x); });
  bind("btn-pet", function () { return WebWorld.knobPet(sim.world, sim.bleb.x); });
  bind("btn-warm", function () { return WebWorld.knobWarm(sim.world); });
  bind("btn-cool", function () { return WebWorld.knobCool(sim.world); });

  pushLog({ msg: "Bleb blinks awake on the rug.", color: "#a8dcb0" });
  setInterval(function () {
    var events = WebBleb.step(sim);
    for (var i = 0; i < events.length; i++) pushLog(events[i]);
    render();
  }, TICK_MS);
  render();
})();
