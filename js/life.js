/* Lifecycle hook. The tick asks a policy; it does not contain a death.
   Default policy is stasis. Mortality is opt-in and is not registered. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WebLife = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Neglect does not end the creature. A later stasis can return phase
  // "dormant" (cocoon, wake when tended). It must not write drives.
  function stasis(sim) {
    return { phase: "awake", life: sim.lifecycle };
  }

  var policies = { stasis: stasis };
  var PHASES = { awake: 1, dormant: 1, dead: 1 };

  function register(name, fn) {
    policies[name] = fn;
  }

  function afterTick(sim) {
    var name = sim.lifecycle || "stasis";
    var policy = policies[name] || policies.stasis;
    var report = policy(sim) || {};
    if (!PHASES[report.phase]) report = { phase: "awake" };
    sim.phase = report.phase;
    return report;
  }

  return {
    register: register,
    afterTick: afterTick,
    policy: function (name) { return policies[name]; }
  };
});
