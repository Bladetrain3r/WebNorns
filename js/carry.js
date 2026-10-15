/* Compact creature packet. A later bookmark can encode this in a URL
   fragment. The room stays behind: a link carries the norn, not the pellet. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WebCarry = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function round4(n) {
    return Math.round(n * 10000) / 10000;
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function sparseChem(conc) {
    var chem = {};
    for (var i = 1; i < conc.length; i++) {
      if (conc[i]) chem[i] = conc[i];
    }
    return chem;
  }

  function sparseAcc(acc) {
    var out = {};
    for (var key in acc) {
      if (!Object.prototype.hasOwnProperty.call(acc, key)) continue;
      if (!acc[key]) continue;
      out[key] = round4(acc[key]);
    }
    return out;
  }

  function exportState(sim) {
    var bleb = sim.bleb;
    var body = bleb.body;
    var packet = {
      v: 1,
      name: bleb.name,
      color: bleb.color,
      born: bleb.born,
      x: bleb.x,
      life: sim.lifecycle || "stasis",
      phase: sim.phase || "awake",
      traits: clone(bleb.traits),
      body: {
        tick: body.biotick,
        asleep: body.asleep,
        pressure: clone(body.pressure),
        acc: sparseAcc(body.acc),
        chem: sparseChem(body.conc)
      }
    };
    if (bleb.heatAcc) packet.heatAcc = round4(bleb.heatAcc);
    return packet;
  }

  function importState(sim, packet) {
    if (!packet || packet.v !== 1) throw new Error("unknown creature packet");
    var bleb = sim.bleb;
    var body = bleb.body;
    bleb.name = packet.name || bleb.name;
    bleb.color = packet.color || bleb.color;
    bleb.born = packet.born || bleb.born;
    bleb.x = packet.x == null ? bleb.x : packet.x;
    bleb.heatAcc = packet.heatAcc || 0;
    bleb.traits = clone(packet.traits || bleb.traits);
    bleb.sig = "";
    bleb.verb = "idle";
    bleb.detail = "content";
    bleb.noticed = {};
    bleb.flags = { hot: false, cold: false };
    bleb.justWoke = false;
    sim.lifecycle = packet.life || "stasis";
    sim.phase = packet.phase === "dormant" || packet.phase === "dead" ? packet.phase : "awake";

    body.conc = new Uint8Array(256);
    body.acc = {};
    body.lastSource = {};
    body.biotick = packet.body && packet.body.tick ? packet.body.tick : 0;
    body.asleep = packet.body && packet.body.asleep ? packet.body.asleep : 0;
    var chem = (packet.body && packet.body.chem) || {};
    var index;
    for (index in chem) {
      if (!Object.prototype.hasOwnProperty.call(chem, index)) continue;
      var at = Number(index);
      if (at > 0 && at < 256) body.conc[at] = chem[index];
    }
    var pressure = (packet.body && packet.body.pressure) || bleb.traits.pressure || {};
    var name;
    for (name in body.pressure) {
      if (!Object.prototype.hasOwnProperty.call(body.pressure, name)) continue;
      if (pressure[name] != null) body.pressure[name] = pressure[name];
    }
    var acc = (packet.body && packet.body.acc) || {};
    for (index in acc) {
      if (Object.prototype.hasOwnProperty.call(acc, index)) body.acc[index] = acc[index];
    }
    return sim;
  }

  return { exportState: exportState, importState: importState };
});
