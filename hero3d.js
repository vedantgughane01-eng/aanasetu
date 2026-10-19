'use strict';
/* Annasetu hero scene (Three.js r128).
   A donor kitchen sends food across a glowing bridge to an NGO. Every plate that arrives makes the heart beat.
   Click or tap the scene to sprinkle food; click a plate to make it hop.
   Built only from primitives and procedural textures. The layout is seeded, so every visit looks the same. */
const initHero3D = (() => {
  const SPAN = 2.7;                       // half the distance between the two platforms
  const seeded = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const smooth = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };

  return function initHero3D(cv) {
    const T = window.THREE; if (!T) return null;
    const still = matchMedia('(prefers-reduced-motion:reduce)').matches;
    let r;
    try { r = new T.WebGLRenderer({ canvas: cv, alpha: true, antialias: true }); } catch (e) { return null; }
    r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
    const scene = new T.Scene(), cam = new T.PerspectiveCamera(38, 1, .1, 90), world = new T.Group(), rng = seeded(7);
    scene.add(world);

    /* ---------- helpers ---------- */
    const std = (color, rough = .6, o = {}) => new T.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: 0 }, o));
    const canvasTex = (w, h, draw, srgb) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); if (srgb) t.encoding = T.sRGBEncoding; return t; };
    const radial = stops => canvasTex(128, 128, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); stops.forEach(s => g.addColorStop(s[0], s[1])); x.fillStyle = g; x.fillRect(0, 0, w, h); });
    const fit = (g, size) => { const b = new T.Box3().setFromObject(g), s = b.getSize(new T.Vector3()), c = b.getCenter(new T.Vector3()); g.children.forEach(ch => ch.position.sub(c)); g.scale.setScalar(size / Math.max(s.x, s.y, s.z)); const w = new T.Group(); w.add(g); return w; };
    const shadowTex = radial([[0, 'rgba(0,0,0,.55)'], [.6, 'rgba(0,0,0,.18)'], [1, 'rgba(0,0,0,0)']]);
    const softDot = radial([[0, 'rgba(255,255,255,1)'], [.35, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']]);

    /* ---------- lights ---------- */
    scene.add(new T.HemisphereLight(0xd6f3e8, 0x0b3028, .95));
    const sun = new T.DirectionalLight(0xffe2b8, 1.9); sun.position.set(4, 7, 6); scene.add(sun);
    const rim = new T.DirectionalLight(0x7fd1b0, .9); rim.position.set(-6, 3, -5); scene.add(rim);
    const heartLight = new T.PointLight(0xff8a70, 0, 9); heartLight.position.set(SPAN, -.1, 1.2); world.add(heartLight);

    /* ---------- the food ---------- */
    function loaf() {
      const g = new T.Group(), body = new T.Mesh(new T.SphereGeometry(.5, 28, 18), std(0xc98a4b, .8)); body.scale.set(1.25, .62, .7); g.add(body);
      [-.26, 0, .26].forEach(x => { const s = new T.Mesh(new T.SphereGeometry(.1, 12, 8), std(0xf0cc90, .8)); s.scale.set(.3, .1, 1.5); s.position.set(x, .31 * Math.sqrt(1 - (x / .625) ** 2) - .005, 0); s.rotation.y = .6; g.add(s); });
      return g;
    }
    function apple() {
      const g = new T.Group(), geo = new T.SphereGeometry(.45, 32, 24), p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (y > 0) p.setY(i, y - .12 * Math.exp(-(x * x + z * z) * 14)); }
      geo.computeVertexNormals(); g.add(new T.Mesh(geo, std(0xd7263d, .35)));
      const st = new T.Mesh(new T.CylinderGeometry(.02, .028, .16, 8), std(0x5b3a1e)); st.position.set(0, .4, 0); st.rotation.z = .2; g.add(st);
      const lf = new T.Mesh(new T.SphereGeometry(.1, 12, 8), std(0x3f9a46, .5)); lf.scale.set(1.3, .15, .6); lf.position.set(.1, .46, 0); lf.rotation.z = .35; g.add(lf);
      return g;
    }
    function samosa() {           // rounded tetrahedron: radius follows a soft-max over the four face normals
      const geo = new T.SphereGeometry(1, 40, 28), p = geo.attributes.position, n = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(a => new T.Vector3(...a).normalize()), d = new T.Vector3();
      for (let i = 0; i < p.count; i++) { d.fromBufferAttribute(p, i).normalize(); let k = 0; n.forEach(f => { k += Math.pow(Math.max(0, f.dot(d)), 7); }); d.multiplyScalar(.3 / Math.pow(k, 1 / 7)); p.setXYZ(i, d.x, d.y, d.z); }
      geo.computeVertexNormals(); const g = new T.Group(); g.add(new T.Mesh(geo, std(0xd9953a, .75))); return g;
    }
    function roti() {
      const tex = canvasTex(256, 256, (x, w, h) => {
        const rg = seeded(11); x.fillStyle = '#e3b26a'; x.fillRect(0, 0, w, h);
        for (let i = 0; i < 46; i++) { x.fillStyle = `rgba(${90 + rg() * 40},${50 + rg() * 20},20,${.25 + rg() * .35})`; x.beginPath(); x.ellipse(rg() * w, rg() * h, 6 + rg() * 16, 5 + rg() * 12, rg() * 3, 0, 6.3); x.fill(); }
        for (let i = 0; i < 30; i++) { x.fillStyle = 'rgba(255,235,190,.35)'; x.beginPath(); x.arc(rg() * w, rg() * h, 3 + rg() * 8, 0, 6.3); x.fill(); }
      }, true);
      const g = new T.Group(), side = std(0xd9a55c, .8), top = std(0xffffff, .8, { map: tex });
      const m = new T.Mesh(new T.CylinderGeometry(.55, .55, .07, 40), [side, top, side]); m.rotation.x = .75; g.add(m); return g;
    }
    function laddu() {
      const g = new T.Group(), geo = new T.SphereGeometry(.42, 40, 28), p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + .045 * Math.sin(x * 20) * Math.sin(y * 18 + 1) * Math.sin(z * 16 + 2); p.setXYZ(i, x * k, y * k, z * k); }
      geo.computeVertexNormals(); g.add(new T.Mesh(geo, std(0xf29a1f, .85)));
      for (let i = 0; i < 8; i++) { const a = rng() * 6.28, b = Math.acos(rng() * 1.6 - .8), s = new T.Mesh(new T.SphereGeometry(.05, 8, 6), std(0x6ea04a, .7)); s.scale.set(1.5, .7, .9); s.position.set(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)).multiplyScalar(.42); g.add(s); }
      return g;
    }
    function tomato() {
      const g = new T.Group(), b = new T.Mesh(new T.SphereGeometry(.4, 32, 24), std(0xe03a2f, .3)); b.scale.y = .85; g.add(b);
      for (let i = 0; i < 5; i++) { const l = new T.Mesh(new T.SphereGeometry(.07, 8, 6), std(0x3f9a46, .5)); l.scale.set(1.9, .25, .6); l.position.y = .34; l.rotation.y = i * 1.2566; l.translateX(.07); g.add(l); }
      return g;
    }
    function carrot() {
      const g = new T.Group(), b = new T.Mesh(new T.ConeGeometry(.17, .95, 24), std(0xf08a24, .55)); g.add(b);
      [-.3, 0, .3].forEach(a => { const l = new T.Mesh(new T.ConeGeometry(.045, .3, 8), std(0x3f9a46, .5)); l.position.set(Math.sin(a) * .1, .58, 0); l.rotation.z = -a; g.add(l); });
      g.rotation.z = .9; const w = new T.Group(); w.add(g); return w;
    }

    /* ---------- donor platform with a bowl of biryani ---------- */
    function platform(x, tint) {
      const g = new T.Group(); g.position.set(x, -1.2, 0);
      g.add(new T.Mesh(new T.CylinderGeometry(1.5, 1.38, .3, 56), std(tint, .5)));
      const ring = new T.Mesh(new T.TorusGeometry(1.5, .03, 8, 72), std(0xf2a900, .3, { emissive: 0xf2a900, emissiveIntensity: .55 })); ring.rotation.x = Math.PI / 2; ring.position.y = .15; g.add(ring);
      const sh = new T.Mesh(new T.PlaneGeometry(4.2, 4.2), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = -.9; g.add(sh);
      return g;
    }
    const donor = platform(-SPAN, 0x17594d), ngo = platform(SPAN, 0x17594d); world.add(donor, ngo);

    const bowl = new T.Group(); bowl.position.y = .15; bowl.scale.setScalar(.85); donor.add(bowl);
    const prof = [[0, 0], [.34, 0], [.46, .04], [.78, .3], [1, .66], [1.05, .72], [1, .76], [.94, .7], [.72, .36], [.45, .14], [0, .1]].map(a => new T.Vector2(a[0], a[1]));
    bowl.add(new T.Mesh(new T.LatheGeometry(prof, 48), std(0xf4ecdc, .3, { side: T.DoubleSide })));
    const band = new T.Mesh(new T.TorusGeometry(1.03, .035, 8, 64), std(0xf2a900, .4)); band.rotation.x = Math.PI / 2; band.position.y = .72; bowl.add(band);
    {
      const geo = new T.SphereGeometry(.98, 48, 28, 0, Math.PI * 2, 0, Math.PI / 2), p = geo.attributes.position, col = [], c1 = new T.Color(0xf3e4b8), c2 = new T.Color(0xf2a900), c3 = new T.Color(0xfff3d6), tmp = new T.Color();
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = Math.sin(x * 9) * Math.sin(z * 8 + 1) * Math.sin(y * 11 + 2);
        p.setXYZ(i, x * (1 + .025 * n), y * .62 * (1 + .05 * n), z * (1 + .025 * n));
        const k = .5 + .5 * Math.sin(x * 14 + z * 6 + Math.sin(y * 20) * 2); tmp.copy(c1).lerp(c2, k * k * .7).lerp(c3, Math.max(0, n) * .5); col.push(tmp.r, tmp.g, tmp.b);
      }
      geo.setAttribute('color', new T.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
      const rice = new T.Mesh(geo, std(0xffffff, .85, { vertexColors: true })); rice.position.y = .66; bowl.add(rice);
      const bits = new T.InstancedMesh(new T.SphereGeometry(1, 8, 6), std(0xffffff, .6), 80), m4 = new T.Matrix4(), q = new T.Quaternion(), pal = [0xe8761e, 0x4caf50, 0x7a4a1e, 0xfff8e8, 0xd62828, 0x4caf50];
      for (let i = 0; i < 80; i++) {
        const u = rng() * 6.283, f = rng() * 1.15, s = .035 + rng() * .035;
        m4.compose(new T.Vector3(Math.sin(f) * Math.cos(u) * .97, .66 + Math.cos(f) * .6 + .01, Math.sin(f) * Math.sin(u) * .97), q, new T.Vector3(s, s * .8, s));
        bits.setMatrixAt(i, m4); bits.setColorAt(i, new T.Color(pal[i % pal.length]));
      }
      bowl.add(bits);
    }
    const steam = []; for (let i = 0; i < 7; i++) { const s = new T.Sprite(new T.SpriteMaterial({ map: softDot, transparent: true, depthWrite: false, opacity: 0 })); bowl.add(s); steam.push(s); }

    /* ---------- NGO heart ---------- */
    const heartShape = new T.Shape();
    heartShape.moveTo(0, .35); heartShape.bezierCurveTo(0, .6, -.5, .95, -.95, .55); heartShape.bezierCurveTo(-1.4, .1, -.7, -.5, 0, -1);
    heartShape.bezierCurveTo(.7, -.5, 1.4, .1, .95, .55); heartShape.bezierCurveTo(.5, .95, 0, .6, 0, .35);
    const hg = new T.ExtrudeGeometry(heartShape, { depth: .45, bevelEnabled: true, bevelThickness: .12, bevelSize: .1, bevelSegments: 5, curveSegments: 28 }); hg.center();
    const heart = new T.Mesh(hg, std(0xef5b5b, .35, { emissive: 0x7a1414, emissiveIntensity: .35 })); heart.position.y = .95; heart.scale.setScalar(.56); ngo.add(heart);
    const halo = new T.Sprite(new T.SpriteMaterial({ map: radial([[0, 'rgba(255,150,120,.95)'], [.4, 'rgba(255,120,100,.28)'], [1, 'rgba(255,120,100,0)']]), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: .4 }));
    halo.scale.setScalar(4); halo.position.set(0, .95, -.3); ngo.add(halo);
    const ripples = []; for (let i = 0; i < 3; i++) { const m = new T.Mesh(new T.RingGeometry(.9, 1, 64), new T.MeshBasicMaterial({ color: 0xffb340, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false })); m.position.set(SPAN, -.25, .1); m.userData.age = 1; world.add(m); ripples.push(m); }
    let kick = 0, rippleI = 0;

    /* ---------- the bridge ---------- */
    const pts = [[-SPAN, .15], [-SPAN * .55, 1.55], [0, 2.05], [SPAN * .55, 1.55], [SPAN - .2, 0]];
    const curve = new T.CatmullRomCurve3(pts.map(a => new T.Vector3(a[0], a[1], 0)));
    const gold = std(0xf2a900, .35, { emissive: 0xf2a900, emissiveIntensity: .6 });
    [-.22, .22].forEach(z => world.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(a => new T.Vector3(a[0], a[1], z))), 90, .035, 8, false), gold)));
    const rungs = [], RN = 30, across = new T.Vector3(0, 0, 1), rg = new T.BoxGeometry(.05, .035, .5);
    for (let i = 0; i <= RN; i++) {
      const u = i / RN, tan = curve.getTangentAt(u), up = across.clone().cross(tan).normalize(), m = new T.Mesh(rg, std(0xf2a900, .4, { emissive: 0xf2a900, emissiveIntensity: .4 }));
      m.position.copy(curve.getPointAt(u)); m.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(tan, up, across)); world.add(m); rungs.push(m);
    }

    /* ---------- plates riding the bridge ---------- */
    const makers = [loaf, apple, samosa, roti, laddu, tomato, carrot], SPEED = .07;
    const carriers = makers.map((mk, i) => { const obj = fit(mk(), .74); world.add(obj); return { obj, t: i / makers.length, jump: 0, spin: rng() * 6.28 }; });
    const byObj = new Map(carriers.map(c => [c.obj, c]));
    function arrive() {
      kick = 1; const m = ripples[rippleI++ % 3]; m.userData.age = 0;
    }

    /* ---------- sparkles and click bursts ---------- */
    const SP = 90, spPos = new Float32Array(SP * 3); for (let i = 0; i < SP; i++) { spPos[i * 3] = (rng() - .5) * 18; spPos[i * 3 + 1] = -2.2 + rng() * 5.8; spPos[i * 3 + 2] = -3 + rng() * 6; }
    const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(spPos, 3));
    const sparkles = new T.Points(sg, new T.PointsMaterial({ size: .09, map: softDot, color: 0xffe2a0, transparent: true, opacity: .75, depthWrite: false, blending: T.AdditiveBlending })); scene.add(sparkles);
    const burst = [], bmats = [0xf2a900, 0x3fa34d, 0xe8505b, 0xfff3d6].map(c => new T.MeshBasicMaterial({ color: c })), bgeo = new T.IcosahedronGeometry(.07, 0); let bi = 0;
    for (let i = 0; i < 40; i++) { const m = new T.Mesh(bgeo, bmats[i % 4]); m.visible = false; scene.add(m); burst.push({ m, v: new T.Vector3(), life: 0 }); }
    function sprinkle(p, n = 14) { for (let i = 0; i < n; i++) { const b = burst[bi++ % burst.length], a = rng() * 6.283, s = 1.6 + rng() * 2.4; b.m.position.copy(p); b.v.set(Math.cos(a) * s, 2 + rng() * 2.5, (rng() - .5) * 2); b.life = 1; b.m.visible = true; } }

    /* ---------- pointer, scroll, layout ---------- */
    const ptr = { nx: 0, ny: 0, sx: 0, sy: 0, over: false, cx: 0, cy: 0 }, lay = { x: 0, y: 0 }, rc = new T.Raycaster(), v2 = new T.Vector2(), plane = new T.Plane(new T.Vector3(0, 0, 1), 0), hitPt = new T.Vector3();
    const onMove = e => { const b = cv.getBoundingClientRect(); ptr.nx = (e.clientX - b.left) / b.width * 2 - 1; ptr.ny = -((e.clientY - b.top) / b.height * 2 - 1); ptr.over = e.target === cv; };
    const pick = () => { v2.set(ptr.nx, ptr.ny); rc.setFromCamera(v2, cam); const hit = rc.intersectObjects(carriers.map(c => c.obj), true)[0]; if (!hit) return null; let o = hit.object; while (o && !byObj.has(o)) o = o.parent; return o ? { c: byObj.get(o), p: hit.point } : null; };
    const onDown = e => { onMove(e); const h = pick(); if (h) { h.c.jump = 1; sprinkle(h.p, 10); } else { v2.set(ptr.nx, ptr.ny); rc.setFromCamera(v2, cam); if (rc.ray.intersectPlane(plane, hitPt)) sprinkle(hitPt, 14); } };
    window.addEventListener('pointermove', onMove, { passive: true }); cv.addEventListener('pointerdown', onDown);

    function layout() {
      // overlay: the canvas sits behind the hero text. side: text on the left, scene on the right half.
      // Otherwise (stacked under the text on phones) the scene is centred and fitted to the width.
      const w = cv.clientWidth || 1, h = cv.clientHeight || 1, a = w / h, t = Math.tan(T.MathUtils.degToRad(cam.fov / 2));
      const overlay = getComputedStyle(cv).position === 'absolute', side = overlay && a >= 1.1;
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); r.setSize(w, h, false); cam.aspect = a;
      const hw = side ? (SPAN + 1.55) / .48 : (SPAN + 1.55) / .92, z = Math.max(10.5, hw / (t * a));
      cam.position.set(0, 1.2, z); cam.lookAt(0, .2, 0); cam.updateProjectionMatrix();
      lay.x = side ? hw * .5 : 0; lay.y = side ? -.1 : overlay ? -z * t * .34 : -.1;
      if (still) frame(0);
    }

    /* ---------- per-frame update ---------- */
    let time = still ? 3.4 : 0;
    function frame(dt) {
      const sc = Math.min(1, Math.max(0, window.scrollY / (cv.clientHeight || 1)));
      ptr.sx += (ptr.nx - ptr.sx) * Math.min(1, dt * 4); ptr.sy += (ptr.ny - ptr.sy) * Math.min(1, dt * 4);
      world.rotation.y = ptr.sx * .28 + sc * .5; world.rotation.x = -ptr.sy * .08; world.position.set(lay.x, lay.y + sc * 1.4, 0);
      sparkles.position.x = -ptr.sx * .5; sparkles.rotation.y = time * .02;
      donor.position.y = -1.2 + Math.sin(time * 1.1) * .04; ngo.position.y = -1.2 + Math.sin(time * 1.1 + 1.6) * .04;

      carriers.forEach(c => {
        c.t += dt * SPEED; if (c.t >= 1) { c.t -= 1; arrive(); }
        const u = c.t, p = curve.getPointAt(u), hop = Math.abs(Math.sin(u * 38)) * .1;
        c.obj.position.set(p.x, p.y + .38 + hop + Math.sin(c.jump * Math.PI) * .8, p.z);
        c.obj.scale.setScalar(Math.max(.001, smooth(0, .07, u) * (1 - smooth(.9, 1, u))));
        c.obj.rotation.set(Math.sin(time * 1.4 + c.spin * 2) * .15, c.spin + time * 1.6 + c.jump * 8, Math.sin(time * 2 + c.spin) * .25);
        c.jump = Math.max(0, c.jump - dt * 1.8);
      });
      kick *= Math.pow(.03, dt); const hs = .56 * (1 + .05 * Math.sin(time * 3.2) + .28 * kick);
      heart.scale.setScalar(hs); heart.rotation.y = Math.sin(time * .8) * .35; heartLight.intensity = .8 + kick * 5; halo.material.opacity = .35 + .45 * kick;
      ripples.forEach(m => { m.userData.age = Math.min(1, m.userData.age + dt * 1.2); const a = m.userData.age; m.scale.setScalar(.6 + a * 2.6); m.material.opacity = a >= 1 ? 0 : .5 * (1 - a); });
      steam.forEach((s, i) => { const k = (time * .18 + i / steam.length) % 1; s.position.set(Math.sin(k * 6 + i) * .2, 1.4 + k * 1.2, Math.cos(k * 5 + i) * .12); s.scale.setScalar(.5 + k * .9); s.material.opacity = .3 * (1 - k) * smooth(0, .15, k); });
      rungs.forEach((m, i) => { m.material.emissiveIntensity = .3 + .9 * Math.pow(Math.max(0, Math.sin(i / RN * 12.566 - time * 3)), 3); });
      burst.forEach(b => { if (b.life <= 0) return; b.life -= dt * 1.1; b.v.y -= 7 * dt; b.m.position.addScaledVector(b.v, dt); b.m.rotation.x += dt * 6; b.m.scale.setScalar(Math.min(1, b.life * 2)); if (b.life <= 0) b.m.visible = false; });
      if (!still) { const h = ptr.over ? pick() : null; cv.style.cursor = h ? 'pointer' : ''; }
      r.render(scene, cam); cv.dataset.ready = '1';
    }

    /* ---------- run loop, pause off-screen, clean up ---------- */
    let raf = 0, last = performance.now(), visible = true;
    const loop = now => { raf = requestAnimationFrame(loop); if (!visible || document.hidden) { last = now; return; } const dt = Math.min(.05, (now - last) / 1e3); last = now; time += dt; frame(dt); };
    const ro = new ResizeObserver(layout), io = new IntersectionObserver(es => { visible = es[0].isIntersecting; });
    ro.observe(cv); io.observe(cv); layout();
    if (still) frame(0); else raf = requestAnimationFrame(loop);

    return function dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); window.removeEventListener('pointermove', onMove); cv.removeEventListener('pointerdown', onDown); cv.style.cursor = '';
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); const ms = o.material ? [].concat(o.material) : []; ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); });
      r.dispose(); r.forceContextLoss();
    };
  };
})();
