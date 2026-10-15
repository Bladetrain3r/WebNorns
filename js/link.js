/* The norn in the URL. localStorage is the copy that lives here.
   The fragment is the portable one: versioned, checksummed, no room. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WebLink = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var KEY = "webnorn.v1";
  var INTERVAL = 4000;
  var NAMES = ["Bleb", "Pip", "Mote", "Nub", "Peb", "Dot", "Lumen", "Sprout", "Puff", "Wisp", "Nim", "Bub"];
  var ONSET = ["b", "c", "d", "f", "g", "h", "j", "l", "m", "n", "p", "r", "s", "t", "v", "w"];
  var NUCLEUS = ["a", "e", "i", "o", "u", "ai", "oo", "ea"];
  var CODA = ["", "n", "m", "s", "t", "l", "r", "sh"];

  function crc32(str) {
    var c = ~0;
    for (var i = 0; i < str.length; i++) {
      c ^= str.charCodeAt(i);
      for (var k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
    return (~c) >>> 0;
  }

  function crc8(bytes) {
    var c = 0;
    for (var i = 0; i < bytes.length; i++) {
      c ^= bytes[i];
      for (var k = 0; k < 8; k++) {
        c = (c & 0x80) ? ((c << 1) ^ 0x07) & 255 : (c << 1) & 255;
      }
    }
    return c;
  }

  function hex8(n) {
    var s = (n >>> 0).toString(16);
    while (s.length < 8) s = "0" + s;
    return s;
  }

  function b64urlEncode(str) {
    var b64;
    if (typeof Buffer !== "undefined") b64 = Buffer.from(str, "utf8").toString("base64");
    else b64 = btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function b64urlDecode(s) {
    var pad = s.length % 4 === 0 ? "" : "====".slice(s.length % 4);
    var b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
    if (typeof Buffer !== "undefined") return Buffer.from(b64, "base64").toString("utf8");
    return decodeURIComponent(escape(atob(b64)));
  }

  function utf8(str) {
    var raw = unescape(encodeURIComponent(str));
    var out = [];
    for (var i = 0; i < raw.length; i++) out.push(raw.charCodeAt(i));
    return out;
  }

  function fromUtf8(bytes) {
    var raw = "";
    for (var i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
    try { return decodeURIComponent(escape(raw)); }
    catch (e) { return null; }
  }

  function wordAt(i) {
    return ONSET[(i >> 6) & 15] + NUCLEUS[(i >> 3) & 7] + CODA[i & 7];
  }

  function wordIndex(word) {
    var lower = String(word || "").toLowerCase();
    for (var i = 0; i < 1024; i++) if (wordAt(i) === lower) return i;
    return -1;
  }

  function fail(reason) {
    return { ok: false, reason: reason };
  }

  function validGenes(g) {
    if (!g || g.length !== 7) return false;
    for (var i = 0; i < 7; i++) {
      if ((g[i] | 0) !== g[i] || g[i] < 0 || g[i] > 255) return false;
    }
    return true;
  }

  function validPacket(p) {
    if (!p || p.v !== 1) return false;
    if (typeof p.name !== "string" || !p.name || p.name.length > 40) return false;
    if (!validGenes(p.g)) return false;
    if (typeof p.born !== "number" || p.born !== p.born || !isFinite(p.born)) return false;
    if (!p.body || typeof p.body.chem !== "object" || p.body.chem === null) return false;
    var chem = p.body.chem;
    for (var key in chem) {
      if (!Object.prototype.hasOwnProperty.call(chem, key)) continue;
      var at = Number(key);
      var val = chem[key];
      if ((at | 0) !== at || at < 1 || at > 255) return false;
      if ((val | 0) !== val || val < 0 || val > 255) return false;
    }
    return true;
  }

  function encodeFragment(packet) {
    var body = b64urlEncode(JSON.stringify(packet));
    return "n1." + body + "." + hex8(crc32(body));
  }

  function decodeFragment(hash) {
    var text = String(hash || "").replace(/^#/, "");
    if (!text) return fail("empty");
    if (text.indexOf("n1.") !== 0) return fail("version");
    var match = /^n1\.([A-Za-z0-9_-]{1,8000})\.([0-9a-fA-F]{8})$/.exec(text);
    if (!match) return fail("checksum");
    if (hex8(crc32(match[1])) !== match[2].toLowerCase()) return fail("checksum");
    var packet;
    try { packet = JSON.parse(b64urlDecode(match[1])); }
    catch (e) { return fail("corrupt"); }
    if (!packet || packet.v !== 1) return fail("version");
    if (!validPacket(packet)) return fail("corrupt");
    return { ok: true, packet: packet };
  }

  function pushBits(bits, value, width) {
    for (var i = width - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  }

  function wordsFromBits(bits) {
    while (bits.length % 10) bits.push(0);
    var words = [];
    for (var i = 0; i < bits.length; i += 10) {
      var n = 0;
      for (var b = 0; b < 10; b++) n = (n << 1) | bits[i + b];
      words.push(wordAt(n));
    }
    return words.join(" ");
  }

  function encodeSeed(packet) {
    if (!packet || typeof packet.name !== "string" || !validGenes(packet.g)) return null;
    var genes = packet.g;
    var idx = NAMES.indexOf(packet.name);
    var data = [];
    var bits = [];
    if (idx >= 0) {
      data = [idx].concat(genes);
      pushBits(bits, idx, 4);
    } else {
      var raw = utf8(packet.name);
      if (!raw.length || raw.length > 16) return null;
      data = [0xF0 | raw.length].concat(raw, genes);
      pushBits(bits, 15, 4);
      pushBits(bits, raw.length, 5);
      for (var c = 0; c < raw.length; c++) pushBits(bits, raw[c], 8);
    }
    for (var g = 0; g < 7; g++) pushBits(bits, genes[g], 8);
    pushBits(bits, crc8(data), 8);
    return wordsFromBits(bits);
  }

  function bitsOf(text) {
    var parts = String(text || "").trim().toLowerCase().split(/[\s,.-]+/);
    if (!parts.length || (parts.length === 1 && !parts[0])) return null;
    var bits = [];
    for (var i = 0; i < parts.length; i++) {
      var n = wordIndex(parts[i]);
      if (n < 0) return null;
      pushBits(bits, n, 10);
    }
    return bits;
  }

  function take(bits, cursor, width) {
    if (cursor.i + width > bits.length) return null;
    var n = 0;
    for (var b = 0; b < width; b++) n = (n << 1) | bits[cursor.i++];
    return n;
  }

  function decodeSeed(text) {
    var bits = bitsOf(text);
    if (!bits) return fail("corrupt");
    var cursor = { i: 0 };
    var tag = take(bits, cursor, 4);
    if (tag === null) return fail("corrupt");
    var name;
    var data;
    if (tag < 12) {
      name = NAMES[tag];
      data = [tag];
    } else if (tag === 15) {
      var len = take(bits, cursor, 5);
      if (!len) return fail("corrupt");
      var raw = [];
      for (var c = 0; c < len; c++) {
        var byte = take(bits, cursor, 8);
        if (byte === null) return fail("corrupt");
        raw.push(byte);
      }
      name = fromUtf8(raw);
      if (!name) return fail("corrupt");
      data = [0xF0 | len].concat(raw);
    } else {
      return fail("corrupt");
    }
    var genes = [];
    for (var g = 0; g < 7; g++) {
      var gene = take(bits, cursor, 8);
      if (gene === null) return fail("corrupt");
      genes.push(gene);
    }
    data = data.concat(genes);
    var sum = take(bits, cursor, 8);
    if (sum === null || sum !== crc8(data)) return fail("checksum");
    while (cursor.i < bits.length) {
      if (bits[cursor.i++] !== 0) return fail("corrupt");
    }
    if (!validGenes(genes)) return fail("corrupt");
    return { ok: true, name: name, g: genes };
  }

  function sameNorn(a, b) {
    return !!(a && b && a.born === b.born && a.name === b.name);
  }

  // A link restores its norn. A different norn already saved here is a choice.
  function decideBoot(stored, incoming) {
    if (incoming && incoming.ok) {
      if (stored && !sameNorn(stored, incoming.packet)) {
        return { action: "offer", local: stored, link: incoming.packet };
      }
      return { action: "restore", packet: incoming.packet, from: "link" };
    }
    var reason = incoming && incoming.reason;
    if (reason && reason !== "empty") {
      if (stored) return { action: "restore", packet: stored, from: "local", warn: reason };
      return { action: "hatch", warn: reason };
    }
    if (stored) return { action: "restore", packet: stored, from: "local" };
    return { action: "hatch" };
  }

  function due(now, last, force) {
    if (force) return true;
    return now - last >= INTERVAL;
  }

  function loadLocal(storage) {
    try {
      var raw = storage.getItem(KEY);
      if (!raw) return null;
      var packet = JSON.parse(raw);
      if (!validPacket(packet)) return null;
      return packet;
    } catch (e) {
      return null;
    }
  }

  function saveLocal(storage, packet) {
    try {
      storage.setItem(KEY, JSON.stringify(packet));
      return true;
    } catch (e) {
      return false;
    }
  }

  function withFragment(href, fragment) {
    var hash = fragment.charAt(0) === "#" ? fragment : "#" + fragment;
    var cut = String(href).indexOf("#");
    return (cut === -1 ? href : href.slice(0, cut)) + hash;
  }

  return {
    KEY: KEY,
    INTERVAL: INTERVAL,
    NAMES: NAMES,
    encodeFragment: encodeFragment,
    decodeFragment: decodeFragment,
    encodeSeed: encodeSeed,
    decodeSeed: decodeSeed,
    sameNorn: sameNorn,
    decideBoot: decideBoot,
    due: due,
    loadLocal: loadLocal,
    saveLocal: saveLocal,
    withFragment: withFragment
  };
});
