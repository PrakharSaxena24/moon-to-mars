/* ============================================================================
 * sprites.js — Ogasawara Rehearsal · the sprite atelier (Harbor Complete §1).
 * One plain file, vanilla ES5, no library, offline (§11). A hand-crafted SVG
 * sprite library for the 11 duty-holders (+1 generic guest body): sumi-e brush
 * confidence — few strokes, decisive silhouettes, flat washi fills (NO
 * gradients inside figures: the world owns light), ink outlines, each figure
 * anchored on its engine role colour (window.PRS.role(id).color).
 *
 * PINNED API (stage.js builds against this blindly — spec §1):
 *   window.PRS_SPRITES = {
 *     ready: false,                    // flips true only when ALL sheets decoded
 *     init(cb),                        // decode SVGs -> 2x canvases; idempotent;
 *                                      // cb() fires once loading settles (even on
 *                                      // failure — check .ready). Extra init(cb)
 *                                      // calls after settle fire cb immediately.
 *     get(roleId, pose, frame, facing) // -> HTMLCanvasElement | null
 *   }
 *   pose:   'idle' | 'walk' | 'work' | 'stall'
 *   frame:  0 | 1   (walk/work cycle; idle/stall ignore it)
 *   facing: 1 (faces +x / right, the authored direction) | -1 (pre-mirrored)
 *   Any decode failure leaves ready=false and get() returning null — the stage
 *   falls back to its procedural pawns. Sprites are an ENHANCEMENT layer; the
 *   game must be perfect without this file loaded at all.
 *
 * GEOMETRY (for the consumer, also exposed as PRS_SPRITES.meta):
 *   Each canvas is drawn from a 48x56 viewBox at RES=2 (96x112 px backing).
 *   The figure's FEET-CENTRE anchor is at viewBox (24, 52): to place a pawn
 *   whose feet sit at (cx, feetY) at display scale s, drawImage with
 *   dx = cx - 24*s, dy = feetY - 52*s, dw = 48*s, dh = 56*s.
 *   Body proportions mirror the procedural pawn (head top ~y15, feet y52,
 *   torso ~12-15 wide) so sprites drop into the same shadow/aura/bubble stack.
 *
 * Rendering never touches sim state; no Math.random()/Date.now() anywhere —
 * every stroke below is a pure function of (roleId, pose, frame).
 * ==========================================================================*/
(function () {
  'use strict';

  // =========================================================================
  // Palette — washi/lacquer constants (style.css :root / stage.js PAL)
  // =========================================================================
  var INK = '#241d15';         // sumi ink
  var SKIN = '#e9cfa4';        // figure skin
  var WASHI = '#f6efdc';       // paper white
  var WASHI_WARM = '#f0e5cc';  // warm paper mid-tone
  var LEG = '#2b241c';         // trouser ink (procedural pawn's leg colour)
  var HAIR = '#2b241c';        // hair ink
  var INDIGO = '#232f3a';      // lacquer indigo (owner's haori)
  var HANKO = '#a13d2f';       // hanko red (safety cross, fan sun)
  var GOLD = '#e3c46b';        // gold trim (reel, headband, whistle)
  var HANDLE = '#4a3b28';      // tool-wood brown

  // engine role colours, mirrored as a fallback for standalone use (the live
  // value is always read from window.PRS.role(id).color when present).
  var FALLBACK = {
    owner: '#b8892b', pm: '#3d5a6c', siteLead: '#5b6b45', budgetLead: '#7a4a68',
    safetyLead: '#a13d2f', logi: '#b5622e', comms: '#2f6b63',
    specialist: '#c17a1f', chef: '#8a6a3a', guest: '#8c7f65'
  };
  var ROLE_IDS = ['owner', 'pm', 'siteLead', 'budgetLead', 'safetyLead',
                  'logi', 'comms', 'specialist', 'chef', 'guest'];
  var POSES = ['idle', 'walk', 'work', 'stall'];
  var FRAMES = { idle: 1, walk: 2, work: 2, stall: 1 };

  // viewBox + anchor + oversample (see header GEOMETRY)
  var VW = 48, VH = 56, FEET_X = 24, FEET_Y = 52, RES = 2;

  function roleColor(id) {
    var key = (id === 'crew') ? 'guest' : id;
    try {
      if (window.PRS && window.PRS.role) {
        var r = window.PRS.role(key === 'guest' ? 'crew' : key);
        if (r && r.color) return r.color;
      }
    } catch (e) { /* fall through to the mirror */ }
    return FALLBACK[key] || FALLBACK.guest;
  }

  // =========================================================================
  // Tiny colour + SVG string kit (ES5, no deps)
  // =========================================================================
  function hexRGB(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    return [parseInt(h.substr(0, 2), 16) || 0, parseInt(h.substr(2, 2), 16) || 0, parseInt(h.substr(4, 2), 16) || 0];
  }
  // shade toward ink (amt<0) or toward washi (amt>0); amt in -100..100
  function shade(hex, amt) {
    var c = hexRGB(hex), t = amt < 0 ? [26, 21, 15] : [246, 239, 220];
    var k = Math.abs(amt) / 100, o = [], i;
    for (i = 0; i < 3; i++) o.push(Math.round(c[i] + (t[i] - c[i]) * k));
    return 'rgb(' + o[0] + ',' + o[1] + ',' + o[2] + ')';
  }
  function N(v) { return String(Math.round(v * 100) / 100); }
  function merge(a, b) {
    var o = {}, k;
    for (k in a) if (a.hasOwnProperty(k)) o[k] = a[k];
    if (b) for (k in b) if (b.hasOwnProperty(k)) o[k] = b[k];
    return o;
  }
  function el(name, attrs) {
    var s = '<' + name, k, v;
    for (k in attrs) {
      if (!attrs.hasOwnProperty(k)) continue;
      v = attrs[k];
      if (v == null) continue;
      s += ' ' + k + '="' + (typeof v === 'number' ? N(v) : v) + '"';
    }
    return s + '/>';
  }
  function g(tr, inner) { return '<g' + (tr ? ' transform="' + tr + '"' : '') + '>' + inner + '</g>'; }
  // ink outline attrs (sumi weight)
  function ink(w, op) {
    return { stroke: INK, 'stroke-width': N(w == null ? 1.2 : w),
             'stroke-opacity': N(op == null ? 0.55 : op), 'stroke-linejoin': 'round' };
  }
  function crc(cx, cy, r, fill, ex) {
    return el('circle', merge({ cx: N(cx), cy: N(cy), r: N(r), fill: fill }, ex));
  }
  function ell(cx, cy, rx, ry, fill, ex) {
    return el('ellipse', merge({ cx: N(cx), cy: N(cy), rx: N(rx), ry: N(ry), fill: fill }, ex));
  }
  function rr(x, y, w, h, rx, fill, ex) {
    return el('rect', merge({ x: N(x), y: N(y), width: N(w), height: N(h), rx: N(rx), fill: fill }, ex));
  }
  function ln(x1, y1, x2, y2, stroke, w, ex) {
    return el('line', merge({ x1: N(x1), y1: N(y1), x2: N(x2), y2: N(y2), stroke: stroke,
                              'stroke-width': N(w), 'stroke-linecap': 'round' }, ex));
  }
  function pth(d, fill, ex) { return el('path', merge({ d: d, fill: fill }, ex)); }
  function rot(a, x, y) { return 'rotate(' + N(a) + ' ' + N(x) + ' ' + N(y) + ')'; }

  // =========================================================================
  // Skeleton — pose parameters shared by every role
  // =========================================================================
  var HIP_Y = 41, SH_Y = 29.8, SH_FX = 28.4, SH_BX = 19.6;
  var HEAD_CY = 20.5, HEAD_R = 5.4;

  function skel(pose, frame) {
    var s = { lean: 0, slump: 0, headDx: 0, headDy: 0, headTilt: 0,
              legL: 0, legR: 0, brow: 'neutral', eyes: 'dot', mouth: false };
    if (pose === 'walk') {
      var sw = frame ? -1 : 1;
      s.legL = -19 * sw; s.legR = 19 * sw; s.lean = 3.5; s.headDy = -0.2;
    } else if (pose === 'work') {
      s.lean = 1.5; s.brow = 'focus'; s.headDx = 0.3;
    } else if (pose === 'stall') {
      // the diagnostic star: slumped shoulders, bowed head, tool lowered
      s.lean = 7; s.slump = 1.5; s.headDx = 1.3; s.headDy = 2.4; s.headTilt = 11;
      s.brow = 'sad'; s.eyes = 'shut'; s.mouth = true;
    }
    return s;
  }
  // default hand positions (fx/fy = front/right hand, bx/by = back/left hand);
  // roles override for tool keyframes via ROLE_ART[id].hands(pose, frame)
  function handsFor(pose, frame) {
    if (pose === 'walk') {
      return frame ? { fx: 30.4, fy: 40.2, bx: 17.6, by: 34.8 }
                   : { fx: 30.4, fy: 34.8, bx: 17.6, by: 40.2 };
    }
    if (pose === 'stall') return { fx: 28.4, fy: 41.8, bx: 19.6, by: 41.8 };
    if (pose === 'work') return { fx: 30.2, fy: 34.0, bx: 18.0, by: 37.4 };
    return { fx: 30.2, fy: 37.6, bx: 17.8, by: 37.6 };
  }

  // ---- body pieces ---------------------------------------------------------
  function legPiece(x, ang) {
    var leg = rr(x - 1.7, HIP_Y, 3.4, 11.2, 1.6, LEG);
    return ang ? g(rot(ang, x, HIP_Y), leg) : leg;
  }
  // A-line coat path: rounded shoulders + hem, slight flare
  function coatPath(topY, botY, topHW, botHW) {
    var cx = 24;
    return 'M' + N(cx - topHW + 1.3) + ' ' + N(topY) +
      'Q' + N(cx - topHW) + ' ' + N(topY) + ' ' + N(cx - topHW - 0.15) + ' ' + N(topY + 1.6) +
      'L' + N(cx - botHW + 0.2) + ' ' + N(botY - 1.4) +
      'Q' + N(cx - botHW) + ' ' + N(botY) + ' ' + N(cx - botHW + 1.4) + ' ' + N(botY) +
      'L' + N(cx + botHW - 1.4) + ' ' + N(botY) +
      'Q' + N(cx + botHW) + ' ' + N(botY) + ' ' + N(cx + botHW - 0.2) + ' ' + N(botY - 1.4) +
      'L' + N(cx + topHW + 0.15) + ' ' + N(topY + 1.6) +
      'Q' + N(cx + topHW) + ' ' + N(topY) + ' ' + N(cx + topHW - 1.3) + ' ' + N(topY) + 'Z';
  }
  // torso: coat + kimono collar V + obi sash (roles may restyle the sash)
  function torso(q) {
    var topY = 26.8 + q.slump, botY = 42.6;
    var s = pth(coatPath(topY, botY, 5.6, 7.6), q.C, ink(1.25, 0.55));
    // kimono collar overlap — two decisive washi strokes to the sash knot
    s += ln(21.7, topY + 0.9, 24.5, 36.2, WASHI, 1.15, { 'stroke-opacity': 0.8 });
    s += ln(26.3, topY + 0.9, 24.5, 36.2, WASHI, 1.15, { 'stroke-opacity': 0.8 });
    if (!q.noSash) s += rr(17.4, 37.3, 13.2, 2.5, 1.1, q.sashColor || WASHI, { 'fill-opacity': 0.78 });
    return s;
  }
  function armPiece(sx, sy, hx, hy, color) {
    return ln(sx, sy, hx, hy, color, 3.1) + crc(hx, hy, 1.65, SKIN, ink(0.5, 0.35));
  }
  // face: dot eyes (or tired shut lines), expressive brows, stall frown
  function face(q) {
    var dx = 0.7 + q.headDx, dy = q.headDy, s = '';
    var eyL = 22.7 + dx, eyR = 26.1 + dx, eyY = 20.6 + dy;
    if (q.eyes === 'shut') {
      s += ln(eyL - 0.85, eyY + 0.15, eyL + 0.85, eyY + 0.15, INK, 0.85, { 'stroke-opacity': 0.85 });
      s += ln(eyR - 0.85, eyY + 0.15, eyR + 0.85, eyY + 0.15, INK, 0.85, { 'stroke-opacity': 0.85 });
    } else {
      s += crc(eyL, eyY, 0.82, INK, { 'fill-opacity': 0.88 });
      s += crc(eyR, eyY, 0.82, INK, { 'fill-opacity': 0.88 });
    }
    var b = q.brow, bl, br;
    if (b === 'focus')    { bl = [eyL - 1.05, eyY - 2.35, eyL + 1.05, eyY - 1.75]; br = [eyR - 1.05, eyY - 1.75, eyR + 1.05, eyY - 2.35]; }
    else if (b === 'sad') { bl = [eyL - 1.0, eyY - 1.5, eyL + 1.0, eyY - 2.3];    br = [eyR - 1.0, eyY - 2.3, eyR + 1.0, eyY - 1.5]; }
    else                  { bl = [eyL - 1.05, eyY - 2.0, eyL + 1.05, eyY - 2.15]; br = [eyR - 1.05, eyY - 2.15, eyR + 1.05, eyY - 2.0]; }
    s += ln(bl[0], bl[1], bl[2], bl[3], INK, 0.8, { 'stroke-opacity': 0.8 });
    s += ln(br[0], br[1], br[2], br[3], INK, 0.8, { 'stroke-opacity': 0.8 });
    if (q.mouth) { // small worried frown
      var mx = 24.4 + dx - 0.7;
      s += pth('M' + N(mx - 1.1) + ' ' + N(23.9 + dy) + 'Q' + N(mx) + ' ' + N(23.1 + dy) + ' ' + N(mx + 1.1) + ' ' + N(23.9 + dy),
               'none', { stroke: INK, 'stroke-width': 0.7, 'stroke-opacity': 0.7, 'stroke-linecap': 'round' });
    }
    return s;
  }
  // default hair — ink cap-of-circle above the brow line
  function hairArc() {
    return pth('M18.82 19.2A5.4 5.4 0 0 1 29.18 19.2Z', HAIR, { 'fill-opacity': 0.92 });
  }

  // =========================================================================
  // Shared tool fragments
  // =========================================================================
  function knifeAt(x, y, ang) {
    var s = rr(x - 0.75, y - 3.5, 1.5, 3.6, 0.7, HANDLE, ink(0.5, 0.5)) +
            pth('M' + N(x - 1.2) + ' ' + N(y) + 'L' + N(x + 1.2) + ' ' + N(y) +
                'L' + N(x + 0.6) + ' ' + N(y + 6) +
                'Q' + N(x) + ' ' + N(y + 6.9) + ' ' + N(x - 0.6) + ' ' + N(y + 6) + 'Z',
                '#dcd6c2', ink(0.75, 0.78));
    return ang ? g(rot(ang, x, y), s) : s;
  }
  function clipboardAt(x, y, ang, tone) {
    var s = rr(x - 2.5, y - 3.3, 5, 6.6, 0.7, WASHI, ink(0.8, 0.55)) +
            rr(x - 1.1, y - 4.0, 2.2, 1.5, 0.5, tone, ink(0.5, 0.5)) +
            ln(x - 1.5, y - 1.5, x + 1.5, y - 1.5, INK, 0.5, { 'stroke-opacity': 0.38 }) +
            ln(x - 1.5, y + 0.1, x + 1.5, y + 0.1, INK, 0.5, { 'stroke-opacity': 0.38 }) +
            ln(x - 1.5, y + 1.7, x + 0.7, y + 1.7, INK, 0.5, { 'stroke-opacity': 0.38 });
    return ang ? g(rot(ang, x, y), s) : s;
  }
  function sorobanAt(x, y, ang) {
    var s = rr(x - 3.2, y - 2.1, 6.4, 4.2, 0.8, WASHI_WARM, ink(0.9, 0.6)) +
            ln(x - 3.2, y - 0.7, x + 3.2, y - 0.7, INK, 0.55, { 'stroke-opacity': 0.6 });
    var i, bx;
    for (i = 0; i < 4; i++) {
      bx = x - 2.25 + i * 1.5;
      s += ln(bx, y - 2.1, bx, y + 2.1, INK, 0.4, { 'stroke-opacity': 0.35 });
      s += crc(bx, y - 1.35, 0.55, INK, { 'fill-opacity': 0.75 });
      s += crc(bx, y + 0.3 + (i % 2) * 0.9, 0.55, INK, { 'fill-opacity': 0.75 });
    }
    return ang ? g(rot(ang, x, y), s) : s;
  }
  function crateAt(x, y) {
    return rr(x - 4, y - 3, 8, 6, 0.9, WASHI_WARM, ink(0.9, 0.6)) +
           ln(x - 4, y - 1, x + 4, y - 1, INK, 0.5, { 'stroke-opacity': 0.45 }) +
           ln(x - 4, y + 1, x + 4, y + 1, INK, 0.5, { 'stroke-opacity': 0.45 }) +
           rr(x + 1.3, y - 2.6, 1.7, 1.7, 0.3, HANKO, { 'fill-opacity': 0.72 });
  }
  function binocAt(x, y) {
    return crc(x - 1.6, y, 1.5, INK, { 'fill-opacity': 0.88 }) +
           crc(x + 1.6, y, 1.5, INK, { 'fill-opacity': 0.88 }) +
           rr(x - 0.7, y - 0.6, 1.4, 1.2, 0.3, INK, { 'fill-opacity': 0.88 }) +
           crc(x - 1.6, y, 0.6, WASHI, { 'fill-opacity': 0.4 });
  }
  // fishing rod as a subtle quadratic bend from butt to tip + thread from tip
  function rodPath(bx, by, tx, ty, sag) {
    var mx = (bx + tx) / 2, my = (by + ty) / 2 + (sag || 0);
    return pth('M' + N(bx) + ' ' + N(by) + 'Q' + N(mx) + ' ' + N(my) + ' ' + N(tx) + ' ' + N(ty),
               'none', { stroke: INK, 'stroke-width': 1.15, 'stroke-opacity': 0.72, 'stroke-linecap': 'round' });
  }
  function threadPath(tx, ty, dx, len) {
    return pth('M' + N(tx) + ' ' + N(ty) + 'Q' + N(tx + dx) + ' ' + N(ty + len * 0.55) + ' ' + N(tx + dx * 0.6) + ' ' + N(ty + len) +
               'q0.5 0.9 1.2 0.6', 'none',
               { stroke: INK, 'stroke-width': 0.5, 'stroke-opacity': 0.5, 'stroke-linecap': 'round' });
  }

  // =========================================================================
  // ROLE_ART — per-role differentiation: headwear, torso extras, tools, hands.
  // Every hook receives q = { pose, frame, C, dark, lite, work, walk, stall,
  //                           idle, slump, fx, fy, bx, by, shy }
  // =========================================================================
  var ROLE_ART = {

    // 👑 owner — gold coat under an indigo haori, topknot + gold band, sensu fan
    owner: {
      hair: function () {
        return hairArc() + rr(22.8, 12.7, 2.4, 2.9, 1.1, HAIR) +
               ln(22.8, 14.1, 25.2, 14.1, GOLD, 0.7, { 'stroke-opacity': 0.9 }) +
               rr(19.3, 16.7, 9.4, 1.35, 0.6, GOLD, { 'fill-opacity': 0.92 });
      },
      torsoExtra: function (q) {
        var t = 27 + q.slump;
        return pth('M' + N(19.6) + ' ' + N(t) + 'L17.7 42.4L19.9 42.4L21.4 ' + N(t) + 'Z', INDIGO, { 'fill-opacity': 0.92 }) +
               pth('M' + N(28.4) + ' ' + N(t) + 'L30.3 42.4L28.1 42.4L26.6 ' + N(t) + 'Z', INDIGO, { 'fill-opacity': 0.92 }) +
               ln(22.6, 33.1, 25.4, 34.3, GOLD, 0.7, { 'stroke-opacity': 0.85 }) +
               ln(25.4, 33.1, 22.6, 34.3, GOLD, 0.7, { 'stroke-opacity': 0.85 });
      },
      hands: function (pose, frame) {
        if (pose === 'work') return frame ? { fx: 31.0, fy: 31.6, bx: 18.0, by: 37.4 }
                                          : { fx: 30.6, fy: 32.2, bx: 18.0, by: 37.4 };
        return null;
      },
      toolFront: function (q) {
        if (q.work && q.frame === 1) { // open fan: washi wedge, gold ribs, hanko sun
          var px0 = q.fx + 0.5, py0 = q.fy - 0.5, r = 6.2;
          var a0 = -95 * Math.PI / 180, a1 = -18 * Math.PI / 180;
          var x0 = px0 + r * Math.cos(a0), y0 = py0 + r * Math.sin(a0);
          var x1 = px0 + r * Math.cos(a1), y1 = py0 + r * Math.sin(a1);
          var mid = (-95 - 18) / 2 * Math.PI / 180;
          var s = pth('M' + N(px0) + ' ' + N(py0) + 'L' + N(x0) + ' ' + N(y0) +
                      'A' + N(r) + ' ' + N(r) + ' 0 0 1 ' + N(x1) + ' ' + N(y1) + 'Z',
                      WASHI, ink(0.8, 0.6));
          s += ln(px0, py0, px0 + r * 0.92 * Math.cos(-63 * Math.PI / 180), py0 + r * 0.92 * Math.sin(-63 * Math.PI / 180), GOLD, 0.55, { 'stroke-opacity': 0.9 });
          s += ln(px0, py0, px0 + r * 0.92 * Math.cos(-40 * Math.PI / 180), py0 + r * 0.92 * Math.sin(-40 * Math.PI / 180), GOLD, 0.55, { 'stroke-opacity': 0.9 });
          s += crc(px0 + r * 0.58 * Math.cos(mid), py0 + r * 0.58 * Math.sin(mid), 1.05, HANKO, { 'fill-opacity': 0.85 });
          return s;
        }
        if (q.work) { // closed fan raised
          return g(rot(-52, q.fx, q.fy),
                   ln(q.fx, q.fy, q.fx, q.fy - 5.4, HANDLE, 1.35) +
                   crc(q.fx, q.fy - 5.4, 0.62, GOLD, null));
        }
        if (q.stall) { // fan hangs, tip to the ground
          return ln(q.fx, q.fy, q.fx + 0.5, q.fy + 5.2, HANDLE, 1.3) +
                 crc(q.fx + 0.5, q.fy + 5.2, 0.58, GOLD, null);
        }
        return g(rot(30, q.fx, q.fy),
                 ln(q.fx, q.fy, q.fx, q.fy + 4.8, HANDLE, 1.3) +
                 crc(q.fx, q.fy + 4.8, 0.58, GOLD, null));
      }
    },

    // 📋 pm — flat cap with brim, lanyard whistle, notebook + beckoning arm
    pm: {
      headwear: function (q) {
        return rr(19.2, 14.5, 9.6, 3.9, 1.9, q.C, ink(0.7, 0.45)) +
               pth('M27.2 18.1L31.1 17.5L30.7 18.8L27.2 18.7Z', shade(q.C, -28), ink(0.5, 0.4)) +
               ln(19.6, 18.35, 28.6, 18.35, WASHI, 0.6, { 'stroke-opacity': 0.6 });
      },
      torsoExtra: function (q) {
        var t = 28 + q.slump;
        return ln(22.2, t, 24.5, 33.6, WASHI_WARM, 0.65, { 'stroke-opacity': 0.8 }) +
               ln(25.8, t, 24.5, 33.6, WASHI_WARM, 0.65, { 'stroke-opacity': 0.8 }) +
               crc(24.5, 34.1, 0.75, GOLD, ink(0.4, 0.4));
      },
      hands: function (pose, frame) {
        if (pose === 'work') return frame ? { fx: 32.4, fy: 33.4, bx: 19.0, by: 33.4 }
                                          : { fx: 32.8, fy: 30.6, bx: 19.0, by: 33.4 };
        return null;
      },
      toolMid: function (q) { // notebook rides the back hand
        var a = q.stall ? 6 : -12;
        return g(rot(a, q.bx, q.by),
                 rr(q.bx - 2.2, q.by - 2.9, 4.4, 5.6, 0.7, WASHI, ink(0.8, 0.55)) +
                 ln(q.bx, q.by - 2.9, q.bx, q.by + 2.7, INK, 0.5, { 'stroke-opacity': 0.45 }));
      },
      toolFront: function (q) {
        if (q.work) { // open pointing hand — a decisive index stroke
          return ln(q.fx, q.fy, q.fx + 2.2, q.fy - 1.1, SKIN, 1.4);
        }
        return '';
      }
    },

    // 🧭 siteLead — captain's cap (white crown, dark band + visor), binoculars
    siteLead: {
      headwear: function (q) {
        return rr(19.1, 13.5, 9.8, 4.1, 2, WASHI, ink(0.75, 0.5)) +
               rr(19.1, 16.9, 9.8, 1.6, 0.7, shade(q.C, -34), null) +
               pth('M25.8 18.5L31.2 18.2L30.6 19.7L25.8 19.3Z', INK, { 'fill-opacity': 0.85 }) +
               crc(26.4, 17.7, 0.55, GOLD, null);
      },
      torsoExtra: function (q) {
        if (q.work) return '';
        var t = 28.2 + q.slump; // neck strap down to the hanging binoculars
        return ln(21.2, t, 24, 31.4, INK, 0.55, { 'stroke-opacity': 0.5 }) +
               ln(26.8, t, 24, 31.4, INK, 0.55, { 'stroke-opacity': 0.5 });
      },
      hands: function (pose, frame) {
        if (pose === 'work') return frame ? { fx: 27.2, fy: 22.2, bx: 22.0, by: 22.2 }
                                          : { fx: 26.6, fy: 22.4, bx: 21.4, by: 22.4 };
        return null;
      },
      toolFront: function (q) {
        if (q.work) return binocAt(24.6 + (q.frame ? 0.9 : 0.3), 20.9);
        return binocAt(24, 32.4); // hanging on the chest strap
      }
    },

    // 🧮 budgetLead — hair bun + round glasses, soroban (abacus)
    budgetLead: {
      hair: function () {
        return hairArc() + crc(19.5, 14.7, 1.9, HAIR, null) +
               ln(18.4, 13.7, 20.7, 15.6, GOLD, 0.55, { 'stroke-opacity': 0.85 });
      },
      faceExtra: function (q) {
        var dx = 0.7 + q.headDx, dy = q.headDy;
        var eL = 22.7 + dx, eR = 26.1 + dx, ey = 20.6 + dy;
        return crc(eL, ey, 1.8, 'none', { stroke: INK, 'stroke-width': 0.7, 'stroke-opacity': 0.72 }) +
               crc(eR, ey, 1.8, 'none', { stroke: INK, 'stroke-width': 0.7, 'stroke-opacity': 0.72 }) +
               ln(eL + 1.8, ey - 0.3, eR - 1.8, ey - 0.3, INK, 0.6, { 'stroke-opacity': 0.72 });
      },
      hands: function (pose, frame) {
        if (pose === 'work') return frame ? { fx: 25.0, fy: 34.6, bx: 19.8, by: 33.8 }
                                          : { fx: 23.8, fy: 33.9, bx: 19.8, by: 33.8 };
        if (pose === 'idle') return { fx: 30.2, fy: 37.6, bx: 19.8, by: 34.4 };
        return null;
      },
      toolMid: function (q) {
        if (q.work) return sorobanAt(21.6, 34.2, -6);
        if (q.stall) return g(rot(78, q.bx, q.by), sorobanAt(q.bx, q.by + 2.6, 0));
        if (q.idle) return sorobanAt(q.bx, q.by, -8);
        return sorobanAt(q.bx, q.by, -14); // carried while walking
      }
    },

    // ⛑️ safetyLead — white helmet with hanko stripe, armband, medic satchel
    safetyLead: {
      headwear: function () {
        return pth('M18.3 18A5.9 5.9 0 0 1 29.7 18Z', WASHI, ink(0.8, 0.55)) +
               rr(23.15, 12.5, 1.8, 5.1, 0.8, HANKO, { 'fill-opacity': 0.92 }) +
               rr(17.5, 17.6, 13, 1.6, 0.8, WASHI, ink(0.7, 0.5));
      },
      torsoExtra: function (q) {
        // shoulder strap -> hip satchel with red cross, + armband on the back arm
        var ax = SH_BX + (q.bx - SH_BX) * 0.32, ay = q.shy + (q.by - q.shy) * 0.32;
        return ln(SH_BX + 0.4, q.shy + 0.4, 27.6, 37.2, INK, 0.7, { 'stroke-opacity': 0.4 }) +
               rr(25.9, 36.4, 4.2, 3.5, 0.8, WASHI, ink(0.7, 0.5)) +
               ln(28, 37.1, 28, 39.2, HANKO, 0.9, null) +
               ln(26.95, 38.15, 29.05, 38.15, HANKO, 0.9, null) +
               rr(ax - 1.5, ay - 1.2, 3, 2.4, 0.5, WASHI, ink(0.5, 0.5)) +
               ln(ax, ay - 0.7, ax, ay + 0.7, HANKO, 0.7, null) +
               ln(ax - 0.7, ay, ax + 0.7, ay, HANKO, 0.7, null);
      },
      hands: function (pose, frame) {
        // horizon scan: hand shading the eyes (mirrors the stage gesture)
        if (pose === 'work') return frame ? { fx: 28.8, fy: 20.6, bx: 18.0, by: 37.4 }
                                          : { fx: 28.0, fy: 21.0, bx: 18.0, by: 37.4 };
        return null;
      },
      toolFront: function (q) {
        if (q.work) return ln(q.fx - 0.4, q.fy - 0.5, q.fx + 2.6, q.fy - 1.5, SKIN, 1.5);
        return '';
      }
    },

    // 📦 logi — hachimaki headband, rope coil, the crate (set DOWN when stalled)
    logi: {
      headwear: function () {
        return rr(18.6, 16.3, 10.8, 2.1, 1, WASHI, ink(0.7, 0.5)) +
               ln(18.9, 17.2, 16.7, 15.8, WASHI, 1.05, null) +
               ln(18.9, 17.6, 16.5, 17.9, WASHI, 1.05, null);
      },
      torsoExtra: function (q) {
        if (q.work) return '';
        return crc(27.7, 37, 1.7, 'none', { stroke: HANDLE, 'stroke-width': 1.05, 'stroke-opacity': 0.85 }) +
               crc(27.7, 37, 0.75, 'none', { stroke: HANDLE, 'stroke-width': 0.8, 'stroke-opacity': 0.7 });
      },
      hands: function (pose, frame) {
        if (pose === 'work') return frame ? { fx: 33.0, fy: 32.4, bx: 27.6, by: 32.8 }
                                          : { fx: 33.4, fy: 37.6, bx: 28.0, by: 38.0 };
        return null;
      },
      toolFront: function (q) {
        if (q.work) return crateAt(q.frame ? 30.4 : 30.8, q.frame ? 32.4 : 37.2);
        if (q.stall) return crateAt(34.2, 48.2); // the box set down on the ground — work interrupted
        return '';
      }
    },

    // 🎧 comms — headset over the hair + mic, clipboard and pen
    comms: {
      headwear: function (q) {
        return pth('M19 17.8Q24 12.6 29 17.8', 'none',
                   { stroke: INK, 'stroke-width': 1.1, 'stroke-opacity': 0.8, 'stroke-linecap': 'round' }) +
               crc(19.2, 19.5, 1.5, q.C, ink(0.5, 0.5)) +
               crc(28.8, 19.5, 1.5, q.C, ink(0.5, 0.5)) +
               pth('M28.8 20.8Q28 22.8 26.7 23.1', 'none',
                   { stroke: INK, 'stroke-width': 0.7, 'stroke-opacity': 0.7, 'stroke-linecap': 'round' }) +
               crc(26.5, 23.2, 0.55, q.C, null);
      },
      hands: function (pose, frame) {
        if (pose === 'work') return frame ? { fx: 24.4, fy: 31.6, bx: 20.2, by: 33.0 }
                                          : { fx: 23.6, fy: 33.2, bx: 20.2, by: 33.0 };
        if (pose === 'idle') return { fx: 30.2, fy: 37.6, bx: 19.6, by: 34.2 };
        return null;
      },
      toolMid: function (q) {
        if (q.work) return clipboardAt(21.0, 33.4, -16, shade(q.C, -20));
        if (q.stall) return g(rot(84, q.bx, q.by), clipboardAt(q.bx, q.by + 3, 0, shade(q.C, -20)));
        if (q.idle) return clipboardAt(q.bx, q.by, -10, shade(q.C, -20));
        return clipboardAt(q.bx, q.by, -18, shade(q.C, -20)); // carried on the walk
      },
      toolFront: function (q) {
        if (q.work) return ln(q.fx, q.fy, q.fx - 1.7, q.fy - 2.1, HANDLE, 0.9);
        return '';
      }
    },

    // 🎣 specialist — bucket hat, fishing vest, the rod (tip DROOPS when stalled)
    specialist: {
      headwear: function (q) {
        return rr(19.6, 13.3, 8.8, 3.7, 1.8, q.C, ink(0.6, 0.45)) +
               ell(24, 17.2, 7.3, 1.55, shade(q.C, -22), ink(0.6, 0.45)) +
               crc(27.6, 16.4, 0.5, GOLD, null);
      },
      torsoExtra: function (q) {
        var t = 28 + q.slump, d = shade(q.C, -32);
        return pth('M19.2 ' + N(t) + 'L18.2 42.2L20.7 42.2L21.3 ' + N(t) + 'Z', d, { 'fill-opacity': 0.5 }) +
               pth('M28.8 ' + N(t) + 'L29.8 42.2L27.3 42.2L26.7 ' + N(t) + 'Z', d, { 'fill-opacity': 0.5 }) +
               rr(20.9, 33.2, 2.6, 2.9, 0.4, WASHI, merge(ink(0.5, 0.45), { 'fill-opacity': 0.5 })) +
               rr(24.5, 33.2, 2.6, 2.9, 0.4, WASHI, merge(ink(0.5, 0.45), { 'fill-opacity': 0.5 }));
      },
      hands: function (pose, frame) {
        if (pose === 'work') return frame ? { fx: 29.6, fy: 32.8, bx: 18.0, by: 37.4 }
                                          : { fx: 29.8, fy: 33.6, bx: 18.0, by: 37.4 };
        return null;
      },
      toolBack: function (q) {
        if (q.work || q.stall) return '';
        // rod shouldered over the back while idle/walking — the tip clears the
        // head to the upper-left so the silhouette reads at a squint
        return rodPath(q.fx + 0.4, q.fy, q.fx - 14.6, q.fy - 24.4, 1.4) +
               crc(q.fx - 1.1, q.fy - 1.6, 0.85, GOLD, ink(0.4, 0.4));
      },
      toolFront: function (q) {
        if (q.work) {
          var tx = q.frame ? q.fx + 10.2 : q.fx + 11.3;
          var ty = q.frame ? q.fy - 11.3 : q.fy - 8.8;
          return rodPath(q.fx, q.fy, tx, ty, q.frame ? 1.6 : 0.9) +
                 threadPath(tx, ty, q.frame ? 1.5 : 0.7, q.frame ? 9.5 : 8) +
                 crc(q.fx + 1.3, q.fy - 1.3, 0.85, GOLD, ink(0.4, 0.4));
        }
        if (q.stall) { // the rod droops, tip touching the ground — the day on hold
          return rodPath(q.fx, q.fy, q.fx + 9.2, q.fy + 9.9, 3.4) +
                 ln(q.fx + 9.2, q.fy + 9.9, q.fx + 9.4, q.fy + 10.1, INK, 0.5, { 'stroke-opacity': 0.5 }) +
                 crc(q.fx + 1.1, q.fy + 0.6, 0.8, GOLD, ink(0.4, 0.4));
        }
        return '';
      }
    },

    // 🍳 chef — white toque, washi apron, the knife
    chef: {
      headwear: function () {
        return crc(21.3, 10.5, 2, WASHI, null) + crc(24, 9.7, 2.3, WASHI, null) +
               crc(26.7, 10.5, 2, WASHI, null) +
               rr(20.2, 9.9, 7.6, 6.5, 1.6, WASHI, ink(0.7, 0.42)) +
               rr(20.2, 15.5, 7.6, 1.7, 0.8, WASHI_WARM, ink(0.55, 0.4));
      },
      torsoExtra: function (q) {
        var t = 30.2 + q.slump;
        return pth('M20.3 ' + N(t) + 'L27.7 ' + N(t) + 'L28.9 41.7Q29 42.6 28.1 42.6L19.9 42.6Q19 42.6 19.1 41.7Z',
                   WASHI, merge(ink(0.55, 0.4), { 'fill-opacity': 0.92 })) +
               ln(21.5, t, 23.3, t - 3.1, WASHI, 1, { 'stroke-opacity': 0.9 }) +
               ln(26.5, t, 24.7, t - 3.1, WASHI, 1, { 'stroke-opacity': 0.9 });
      },
      hands: function (pose, frame) {
        if (pose === 'work') return frame ? { fx: 30.9, fy: 35.6, bx: 18.0, by: 37.4 }
                                          : { fx: 30.6, fy: 31.4, bx: 18.0, by: 37.4 };
        return null;
      },
      toolFront: function (q) {
        if (q.work) return knifeAt(q.fx, q.fy, q.frame ? 4 : -42);
        if (q.stall) return knifeAt(q.fx, q.fy, 12); // knife lowered, blade down
        return '';
      }
    },

    // 🧑 guest — one muted yukata body (the engine varies the palette)
    guest: {
      noSash: true,
      torsoExtra: function (q) {
        var t = 26.8 + q.slump;
        return rr(17.5, 37.3, 13.2, 2.5, 1.1, shade(q.C, -36), { 'fill-opacity': 0.85 }) +
               ln(21.4, t + 2.6, 20.6, 42.2, INK, 0.5, { 'stroke-opacity': 0.16 }) +
               ln(26.6, t + 2.6, 27.4, 42.2, INK, 0.5, { 'stroke-opacity': 0.16 });
      },
      hands: function (pose, frame) {
        if (pose === 'work') return frame ? { fx: 30.2, fy: 35.2, bx: 17.8, by: 37.6 }
                                          : { fx: 29.9, fy: 33.4, bx: 17.8, by: 37.6 };
        return null;
      }
    }
  };

  // =========================================================================
  // Figure assembly — one SVG string per (roleId, pose, frame)
  // =========================================================================
  function buildSVG(roleId, pose, frame) {
    var C = roleColor(roleId);
    var R = ROLE_ART[roleId] || ROLE_ART.guest;
    var s = skel(pose, frame);
    var hands = handsFor(pose, frame);
    if (R.hands) { var ho = R.hands(pose, frame); if (ho) hands = ho; }
    var q = {
      pose: pose, frame: frame, C: C, dark: shade(C, -24), lite: shade(C, 20),
      work: pose === 'work', walk: pose === 'walk', stall: pose === 'stall', idle: pose === 'idle',
      slump: s.slump, headDx: s.headDx, headDy: s.headDy,
      fx: hands.fx, fy: hands.fy, bx: hands.bx, by: hands.by, shy: SH_Y + s.slump * 0.9,
      brow: s.brow, eyes: s.eyes, mouth: s.mouth,
      noSash: !!R.noSash, sashColor: R.sashColor
    };

    // ---- head group (tilts + drops as one unit on a stall) ----
    var headTr = '';
    if (s.headDx || s.headDy) headTr += 'translate(' + N(s.headDx) + ' ' + N(s.headDy) + ')';
    if (s.headTilt) headTr += (headTr ? ' ' : '') + rot(s.headTilt, 24, HEAD_CY);
    var headInner =
      crc(24, HEAD_CY, HEAD_R, SKIN, ink(1, 0.32)) +
      (R.hair ? R.hair(q) : hairArc());
    // face is drawn WITHOUT the group's own dx (the group translate already
    // carries the bow) — pass a face-local q with zeroed offsets
    var qFace = merge(q, { headDx: q.stall ? 0.3 : q.headDx, headDy: 0 });
    headInner += face(qFace);
    if (R.faceExtra) headInner += R.faceExtra(qFace);
    if (R.headwear) headInner += R.headwear(q);
    var headGroup = headTr ? g(headTr, headInner) : headInner;

    // ---- upper body (rotates about the hip for lean/slump) ----
    var upper =
      (R.toolBack ? R.toolBack(q) : '') +               // truly behind (shouldered rod)
      armPiece(SH_BX, q.shy, q.bx, q.by, q.dark) +
      torso(q) +
      (R.torsoExtra ? R.torsoExtra(q) : '') +
      (R.toolMid ? R.toolMid(q) : '') +                 // held in front of the coat
      headGroup +
      armPiece(SH_FX, q.shy, q.fx, q.fy, q.dark) +
      (R.toolFront ? R.toolFront(q) : '');
    if (s.lean) upper = g(rot(s.lean, 24, HIP_Y), upper);

    var body = legPiece(21.4, s.legL) + legPiece(26.6, s.legR) + upper;

    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + VW + '" height="' + VH +
           '" viewBox="0 0 ' + VW + ' ' + VH + '">' + body + '</svg>';
  }

  // =========================================================================
  // Loader — decode every sheet to a 2x offscreen canvas (both facings)
  // =========================================================================
  var _store = {};        // 'role|pose|frame|facing' -> canvas
  var _state = 0;         // 0 = untouched · 1 = loading · 2 = settled
  var _cbs = [];

  var api = {
    ready: false,
    meta: { w: VW, h: VH, feetX: FEET_X, feetY: FEET_Y, res: RES },
    init: init,
    get: get
  };

  function flushCbs() {
    var list = _cbs; _cbs = [];
    for (var i = 0; i < list.length; i++) {
      try { list[i](); } catch (e) { /* a consumer error must not wedge the loader */ }
    }
  }

  function init(cb) {
    if (typeof cb === 'function') _cbs.push(cb);
    if (_state === 2) { flushCbs(); return; }
    if (_state === 1) return;
    _state = 1;

    var jobs = [], r, p, f, i;
    for (r = 0; r < ROLE_IDS.length; r++) {
      for (p = 0; p < POSES.length; p++) {
        for (f = 0; f < FRAMES[POSES[p]]; f++) {
          jobs.push({ role: ROLE_IDS[r], pose: POSES[p], frame: f });
        }
      }
    }
    var pending = jobs.length, failed = false;

    function settle() {
      if (failed) _store = {};          // all-or-nothing: partial sheets never ship
      else api.ready = true;
      _state = 2;
      flushCbs();
    }
    function makeJob(job) {
      var img, svg, key;
      try {
        svg = buildSVG(job.role, job.pose, job.frame);
        img = new window.Image();
      } catch (e) { failed = true; if (--pending === 0) settle(); return; }
      key = job.role + '|' + job.pose + '|' + job.frame;
      img.onload = function () {
        try {
          _store[key + '|1'] = bake(img, 1);
          _store[key + '|-1'] = bake(img, -1);
        } catch (e2) { failed = true; }
        if (--pending === 0) settle();
      };
      img.onerror = function () {
        failed = true;
        if (--pending === 0) settle();
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }
    function bake(img, facing) {
      var cv = window.document.createElement('canvas');
      cv.width = VW * RES; cv.height = VH * RES;
      var cx = cv.getContext('2d');
      if (facing === -1) { cx.translate(cv.width, 0); cx.scale(-1, 1); }
      cx.drawImage(img, 0, 0, cv.width, cv.height);
      return cv;
    }

    try {
      if (!window.document || !window.Image) { _state = 2; flushCbs(); return; }
      for (i = 0; i < jobs.length; i++) makeJob(jobs[i]);
    } catch (e) {
      _state = 2; flushCbs();
    }
  }

  function get(roleId, pose, frame, facing) {
    if (!api.ready) return null;
    var role = (roleId === 'crew') ? 'guest' : roleId;
    if (!ROLE_ART.hasOwnProperty(role)) return null;
    if (FRAMES[pose] == null) return null;
    var f = (frame === 1 && FRAMES[pose] > 1) ? 1 : 0;
    var face2 = (facing === -1) ? '-1' : '1';
    return _store[role + '|' + pose + '|' + f + '|' + face2] || null;
  }

  window.PRS_SPRITES = api;
})();
