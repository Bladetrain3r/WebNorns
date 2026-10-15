/* Paint the room. Knobs stay on the world. A link loads a saved body. */
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
  var MUTE = "#8d80a0";
  var GOOD = "#a8dcb0";
  var sim = WebBleb.createSim({});
  var logEl = document.getElementById("log");
  var lastSave = 0;
  var holdLink = false;
  var pending = null;

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
    document.getElementById("traits").textContent = view.traitsText;
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

  function packet() {
    return WebBleb.exportState(sim);
  }

  function showSeed(snap) {
    var input = document.getElementById("seed-code");
    if (document.activeElement === input) return;
    var code = WebLink.encodeSeed(snap);
    input.value = code || "";
  }

  function persist(force) {
    if (holdLink && !force) return;
    var now = Date.now();
    if (!WebLink.due(now, lastSave, force)) return;
    lastSave = now;
    var snap = packet();
    WebLink.saveLocal(localStorage, snap);
    showSeed(snap);
    var next = "#" + WebLink.encodeFragment(snap);
    if (location.hash !== next) history.replaceState(null, "", next);
  }

  function hideOffer() {
    pending = null;
    holdLink = false;
    document.getElementById("offer").hidden = true;
  }

  function showOffer(kind, localName, linkName) {
    pending = kind;
    holdLink = true;
    var text = kind.kind === "seed"
      ? "The seed names " + linkName + ". " + localName + " is already here."
      : "This link carries " + linkName + ". " + localName + " is already saved here.";
    document.getElementById("offer-text").textContent = text;
    document.getElementById("offer-keep").textContent = "Keep " + localName;
    document.getElementById("offer-bring").textContent = "Bring " + linkName + " in";
    document.getElementById("offer").hidden = false;
  }

  function arriveFrom(snap, line) {
    WebBleb.importState(sim, snap);
    pushLog({ msg: line, color: GOOD });
    persist(true);
  }

  function boot() {
    var stored = WebLink.loadLocal(localStorage);
    var incoming = WebLink.decodeFragment(location.hash);
    var plan = WebLink.decideBoot(stored, incoming);
    if (plan.warn) {
      pushLog({
        msg: plan.action === "hatch"
          ? "That link didn't carry a norn."
          : "That link didn't carry a norn. Keeping the one here.",
        color: MUTE
      });
    }
    if (plan.action === "hatch") {
      pushLog(WebBleb.hatch(sim));
      persist(true);
      return;
    }
    if (plan.action === "offer") {
      WebBleb.importState(sim, plan.local);
      showOffer({ kind: "link", packet: plan.link }, plan.local.name, plan.link.name);
      showSeed(packet());
      pushLog({ msg: plan.local.name + " is here. A link has someone else.", color: MUTE });
      return;
    }
    var line = plan.from === "link"
      ? plan.packet.name + " arrives from the link."
      : plan.packet.name + " is back, just as you left them.";
    arriveFrom(plan.packet, line);
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
  bind("btn-hatch", function () {
    hideOffer();
    var ev = WebBleb.hatch(sim);
    persist(true);
    return ev;
  });

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      try {
        var ok = document.execCommand("copy");
        document.body.removeChild(area);
        if (ok) resolve();
        else reject(new Error("copy"));
      } catch (err) {
        document.body.removeChild(area);
        reject(err);
      }
    });
  }

  document.getElementById("btn-share").addEventListener("click", function () {
    var snap = packet();
    var url = WebLink.withFragment(location.href, WebLink.encodeFragment(snap));
    var code = WebLink.encodeSeed(snap);
    var note = document.getElementById("share-note");
    showSeed(snap);
    copyText(url).then(function () {
      note.textContent = code ? "Link copied. Seed: " + code : "Link copied.";
    }, function () {
      note.textContent = code
        ? "Seed: " + code + ". Copy the address if the link stayed put."
        : "Copy the address bar to share this norn.";
    });
  });

  document.getElementById("seed-code").addEventListener("keydown", function (ev) {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    var got = WebLink.decodeSeed(this.value);
    if (!got.ok) {
      pushLog({ msg: "That seed didn't read.", color: MUTE });
      return;
    }
    if (sim.bleb.name === got.name && sim.bleb.genome.join(",") === got.g.join(",")) {
      pushLog({ msg: "That seed is this norn.", color: MUTE });
      return;
    }
    showOffer({ kind: "seed", name: got.name, g: got.g }, sim.bleb.name, got.name);
  });

  document.getElementById("offer-keep").addEventListener("click", function () {
    hideOffer();
    persist(true);
    pushLog({ msg: sim.bleb.name + " stays.", color: GOOD });
    render();
  });

  document.getElementById("offer-bring").addEventListener("click", function () {
    if (!pending) return;
    var kind = pending;
    hideOffer();
    if (kind.kind === "seed") {
      var color = WebBleb.COLORS[kind.g[0] % WebBleb.COLORS.length];
      pushLog(WebBleb.summon(sim, { name: kind.name, genes: kind.g, color: color }));
    } else {
      WebBleb.importState(sim, kind.packet);
      pushLog({ msg: sim.bleb.name + " arrives from the link.", color: GOOD });
    }
    persist(true);
    render();
  });

  window.addEventListener("pagehide", function () {
    if (!holdLink) persist(true);
  });

  boot();
  setInterval(function () {
    var events = WebBleb.step(sim);
    for (var i = 0; i < events.length; i++) pushLog(events[i]);
    render();
    persist(false);
  }, TICK_MS);
  render();
})();
