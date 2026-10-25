// The living beacon, in 3D: the BEACON lighthouse on rocks at night, its lamp turning
// two beams a full circle over a moving sea, with drifting haze and (in dark mode) stars.
// Everything is built in code, no models or textures to download. Loaded only by
// BeaconScene (after the page has painted, on capable devices). Returns a dispose().
import * as THREE from "three";

const NAVY = new THREE.Color("#1f4e79");
const WHITE = new THREE.Color("#eef3f8");
const LAMP = new THREE.Color("#8ff0c0");
const TURN_SECONDS = 12; // one full turn of the light, like a real lighthouse
const FPS = 30; // a background: half the frames, half the battery

type Theme = { dark: boolean };

export function startBeaconScene(canvas: HTMLCanvasElement, initial: Theme) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
  // Low over the water and tilted up a little: the horizon sits about 70% down the
  // screen, so the sky stays clear behind the cards and the coast reads as distance.
  camera.position.set(0, 2.2, 34);
  camera.lookAt(0, 6, 0);
  const LH_Z = -26; // the lighthouse stands out on the water, not in the foreground

  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  // --- Light on the solid things: a cool moon, a low ambient, the lamp itself.
  const ambient = new THREE.AmbientLight(0x9fb8d6, 0.35);
  const moon = new THREE.DirectionalLight(0xbfd4ee, 0.9);
  moon.position.set(-12, 18, 10);
  const lampLight = new THREE.PointLight(LAMP, 6, 14, 1.6);
  scene.add(ambient, moon, lampLight);

  // --- The lighthouse, a group placed in the lower right of the view.
  const lighthouse = new THREE.Group();
  scene.add(lighthouse);

  // Tower: a lathed taper, banded navy and white like the logo (vertex colours).
  const towerH = 7.2;
  const towerSeg = track(new THREE.CylinderGeometry(0.72, 1.15, towerH, 48, 48, true));
  towerSeg.translate(0, towerH / 2, 0);
  const pos = towerSeg.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const band = Math.floor((pos.getY(i) / towerH) * 6) % 2 === 1;
    (band ? WHITE : NAVY).toArray(colours, i * 3);
  }
  towerSeg.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  const tower = new THREE.Mesh(
    towerSeg,
    track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 }))
  );
  lighthouse.add(tower);

  const navyMat = track(new THREE.MeshStandardMaterial({ color: NAVY, roughness: 0.6 }));
  // Gallery deck and its railing.
  const deck = new THREE.Mesh(track(new THREE.CylinderGeometry(1.15, 1.15, 0.18, 48)), navyMat);
  deck.position.y = towerH + 0.09;
  const rail = new THREE.Mesh(track(new THREE.TorusGeometry(1.1, 0.035, 8, 64)), navyMat);
  rail.rotation.x = Math.PI / 2;
  rail.position.y = towerH + 0.55;
  // Lamp room: a glowing glass drum with the lamp inside.
  const glass = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.62, 0.62, 0.95, 32, 1, true)),
    track(
      new THREE.MeshStandardMaterial({
        color: 0xbfe9d6,
        emissive: LAMP,
        emissiveIntensity: 0.55,
        transparent: true,
        opacity: 0.55,
        roughness: 0.15,
        side: THREE.DoubleSide,
      })
    )
  );
  glass.position.y = towerH + 0.66;
  const lampCore = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.24, 24, 16)),
    track(new THREE.MeshBasicMaterial({ color: LAMP }))
  );
  lampCore.position.y = glass.position.y;
  const roof = new THREE.Mesh(track(new THREE.ConeGeometry(0.82, 0.8, 32)), navyMat);
  roof.position.y = towerH + 1.53;
  const finial = new THREE.Mesh(track(new THREE.SphereGeometry(0.09, 12, 8)), navyMat);
  finial.position.y = towerH + 1.98;
  lighthouse.add(deck, rail, glass, lampCore, roof, finial);
  lampLight.position.y = glass.position.y;
  lighthouse.add(lampLight);

  // --- The headland: a height field whose coastline curves back from the viewer. Land
  // rises in a steep, rough face to a grassy top; the lighthouse stands near its edge.
  // `coast` is placed in the lower right by resize(); the sea's foam follows COAST.
  const coast = new THREE.Group();
  scene.add(coast);
  coast.add(lighthouse);
  const CLIFF_H = 4.4;
  const coastX = (z: number) => -1.5 + 0.12 * z + 0.6 * Math.sin(z * 0.45);
  const LH_LOCAL = new THREE.Vector2(4.6, -3); // x, z of the tower on the cliff top
  const hash = (x: number, z: number) => {
    const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const noise = (x: number, z: number) => {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
    return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
  };
  const smooth = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  function heightAt(x: number, z: number) {
    const t = x - coastX(z);
    if (t < 0) return -0.9; // the shelf under the water
    const s = smooth(0, 1.8, t); // the face: from the waterline to the top in 1.8 units
    const face = (noise(x * 1.6, z * 1.6) * 0.7 + noise(x * 4, z * 4) * 0.25) * s * (1 - s) * 4;
    const flat = smooth(1.2, 3.2, Math.hypot(x - LH_LOCAL.x, z - LH_LOCAL.y)); // level ground at the tower
    const top = (noise(x * 0.35, z * 0.35) * 0.55 + noise(x * 1.2, z * 1.2) * 0.12) * s * flat;
    return CLIFF_H * s + face + top;
  }
  const cliffGeo = track(new THREE.PlaneGeometry(30, 34, 120, 136));
  cliffGeo.rotateX(-Math.PI / 2);
  cliffGeo.translate(4, 0, -7);
  const cp = cliffGeo.attributes.position;
  const cliffColours = new Float32Array(cp.count * 3);
  const GRASS = new THREE.Color("#4d6a48");
  const ROCK = new THREE.Color("#6f7884");
  const WET = new THREE.Color("#323a44");
  const tmp = new THREE.Color();
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), z = cp.getZ(i);
    const h = heightAt(x, z);
    cp.setY(i, h);
    const k = h / CLIFF_H;
    tmp.copy(WET).lerp(ROCK, smooth(0.02, 0.35, k)).lerp(GRASS, smooth(0.9, 0.99, k));
    tmp.offsetHSL(0, 0, noise(x * 3, z * 3) * 0.03); // a little mottling
    tmp.toArray(cliffColours, i * 3);
  }
  cliffGeo.setAttribute("color", new THREE.BufferAttribute(cliffColours, 3));
  cliffGeo.computeVertexNormals();
  const rockMat = track(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })
  );
  coast.add(new THREE.Mesh(cliffGeo, rockMat));
  lighthouse.position.set(LH_LOCAL.x, heightAt(LH_LOCAL.x, LH_LOCAL.y) - 0.05, LH_LOCAL.y);

  // --- The light: two opposite cones turning around the lamp, additive, softly
  // fading along their length and towards their edges, with drifting dust inside.
  const beamUniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color("#d9f7ea") },
    uStrength: { value: 0.55 },
  };
  const beamMat = track(
    new THREE.ShaderMaterial({
      uniforms: beamUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying float vAlong;
        varying vec3 vNormalV;
        varying vec3 vViewDir;
        varying vec3 vLocal;
        void main() {
          vAlong = uv.y;
          vLocal = position;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormalV = normalize(normalMatrix * normal);
          vViewDir = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uStrength;
        varying float vAlong;
        varying vec3 vNormalV;
        varying vec3 vViewDir;
        varying vec3 vLocal;
        float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float noise(vec3 p) {
          vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          float n = mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                        mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
          return n;
        }
        void main() {
          // uv.y is 1 at the lamp (cone tip) and 0 at the far end.
          float along = pow(vAlong, 1.6);
          float edge = pow(abs(dot(vNormalV, vViewDir)), 1.4);
          float dust = 0.65 + 0.35 * noise(vLocal * 0.9 + vec3(0.0, uTime * 0.25, uTime * 0.4));
          float a = along * edge * dust * uStrength;
          gl_FragColor = vec4(uColor, a);
        }`,
    })
  );
  const beamLen = 42;
  const coneGeo = track(new THREE.ConeGeometry(4.2, beamLen, 48, 1, true));
  // Tip at the lamp, opening outwards along +X.
  coneGeo.translate(0, -beamLen / 2, 0);
  coneGeo.rotateZ(Math.PI / 2);
  const pivot = new THREE.Group();
  pivot.position.y = glass.position.y;
  const beamA = new THREE.Mesh(coneGeo, beamMat);
  const beamB = new THREE.Mesh(coneGeo, beamMat);
  beamB.rotation.y = Math.PI;
  // A slight downward tilt so the light skims the water.
  beamA.rotation.z = -0.05;
  beamB.rotation.z = 0.05;
  pivot.add(beamA, beamB);
  lighthouse.add(pivot);

  // The lamp's halo: a soft additive sprite that brightens when a beam faces us.
  const haloCanvas = document.createElement("canvas");
  haloCanvas.width = haloCanvas.height = 128;
  const hctx = haloCanvas.getContext("2d")!;
  const grad = hctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(220,255,236,1)");
  grad.addColorStop(0.25, "rgba(143,240,192,0.45)");
  grad.addColorStop(1, "rgba(143,240,192,0)");
  hctx.fillStyle = grad;
  hctx.fillRect(0, 0, 128, 128);
  const haloTex = track(new THREE.CanvasTexture(haloCanvas));
  const haloMat = track(
    new THREE.SpriteMaterial({
      map: haloTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    })
  );
  const halo = new THREE.Sprite(haloMat);
  halo.position.y = glass.position.y;
  halo.scale.setScalar(3.4);
  lighthouse.add(halo);

  // --- The sea: a wide plane with summed-sine swells; the beam leaves a glint on it.
  const seaUniforms = {
    uTime: { value: 0 },
    uBeamAngle: { value: 0 },
    uLamp: { value: new THREE.Vector3() },
    uDeep: { value: new THREE.Color("#0b2238") },
    uCrest: { value: new THREE.Color("#2c5a86") },
    uGlint: { value: new THREE.Color("#cfeedd") },
    uFar: { value: 150 },
    uAlpha: { value: 0.92 },
    uCoast: { value: new THREE.Vector2() }, // the headland's origin in world x, z
    uFoam: { value: new THREE.Color("#e8f4ff") },
  };
  const seaGeo = track(new THREE.PlaneGeometry(260, 140, 160, 90));
  seaGeo.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(
    seaGeo,
    track(
      new THREE.ShaderMaterial({
        uniforms: seaUniforms,
        transparent: true,
        depthWrite: false,
        vertexShader: /* glsl */ `
          uniform float uTime;
          varying vec3 vWorld;
          varying float vHeight;
          float swell(vec2 p, vec2 d, float k, float s, float a) { return a * sin(dot(p, d) * k + uTime * s); }
          void main() {
            vec3 p = position;
            // Two long, gentle swells: a calm sea, not a choppy one.
            float h = swell(p.xz, normalize(vec2(1.0, 0.55)), 0.28, 0.9, 0.18)
                    + swell(p.xz, normalize(vec2(-0.6, 1.0)), 0.5, 1.3, 0.07);
            p.y += h;
            vHeight = h;
            vec4 w = modelMatrix * vec4(p, 1.0);
            vWorld = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uBeamAngle;
          uniform vec3 uLamp;
          uniform vec3 uDeep;
          uniform vec3 uCrest;
          uniform vec3 uGlint;
          uniform float uFar;
          uniform float uAlpha;
          uniform float uTime;
          uniform vec2 uCoast;
          uniform vec3 uFoam;
          varying vec3 vWorld;
          varying float vHeight;
          float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise2(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
          }
          void main() {
            vec3 col = mix(uDeep, uCrest, smoothstep(-0.14, 0.24, vHeight));
            // Surf at the foot of the cliff: the same coastline as the headland's mesh.
            vec2 local = vWorld.xz - uCoast;
            float t = local.x - (-1.5 + 0.12 * local.y + 0.6 * sin(local.y * 0.45));
            float band = smoothstep(-1.4, -0.1, t) * (1.0 - smoothstep(-0.1, 0.3, t));
            float churn = noise2(vec2(local.y * 1.4, t * 3.0 - uTime * 0.8)) * 0.6 + noise2(local * 3.0 + uTime * 0.3) * 0.4;
            col = mix(col, uFoam, band * smoothstep(0.35, 0.75, churn + vHeight));
            // Where the turning beam points, the water lights up in a soft path.
            vec2 toP = vWorld.xz - uLamp.xz;
            float dist = length(toP);
            float ang = atan(-toP.y, toP.x);
            float d1 = abs(mod(ang - uBeamAngle + 3.14159, 6.28318) - 3.14159);
            float d2 = abs(mod(ang - uBeamAngle, 6.28318) - 3.14159);
            float onBeam = exp(-pow(min(d1, d2) * (2.0 + dist * 0.05), 2.0) * 9.0);
            float sparkle = smoothstep(0.1, 0.24, vHeight);
            col += uGlint * onBeam * (0.25 + sparkle * 0.9) * exp(-dist * 0.035);
            // Fade into the sky towards the horizon and at the near edge.
            float depth = length(vWorld.xz - cameraPosition.xz);
            float alpha = (1.0 - smoothstep(uFar * 0.45, uFar, depth)) * smoothstep(6.0, 16.0, depth);
            gl_FragColor = vec4(col, alpha * uAlpha);
          }`,
      })
    )
  );
  scene.add(sea);

  // --- Haze: slow points drifting near the water, and stars above it in dark mode.
  const hazeCount = 260;
  const hazePos = new Float32Array(hazeCount * 3);
  for (let i = 0; i < hazeCount; i++) {
    hazePos[i * 3] = (Math.random() - 0.5) * 90;
    hazePos[i * 3 + 1] = Math.random() * 7 + 0.4;
    hazePos[i * 3 + 2] = (Math.random() - 0.5) * 40 - 6;
  }
  const hazeGeo = track(new THREE.BufferGeometry());
  hazeGeo.setAttribute("position", new THREE.BufferAttribute(hazePos, 3));
  const hazeMat = track(
    new THREE.PointsMaterial({
      size: 0.18,
      color: 0xcfe0f2,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const haze = new THREE.Points(hazeGeo, hazeMat);
  scene.add(haze);

  const starCount = 700;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 260;
    starPos[i * 3 + 1] = Math.random() * 70 + 8;
    starPos[i * 3 + 2] = -60 - Math.random() * 60;
  }
  const starGeo = track(new THREE.BufferGeometry());
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = track(
    new THREE.PointsMaterial({
      size: 0.42,
      color: 0xe6efff,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    })
  );
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  // --- Theme: night or dusk. Same scene, different light.
  function applyTheme({ dark }: Theme) {
    stars.visible = dark;
    ambient.intensity = dark ? 0.55 : 0.9;
    moon.intensity = dark ? 1.5 : 1.6;
    // Added light vanishes on a pale sky, so by day the beam is a warm haze drawn over it.
    beamMat.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    beamMat.needsUpdate = true;
    beamUniforms.uStrength.value = dark ? 0.55 : 0.5;
    beamUniforms.uColor.value.set(dark ? "#d9f7ea" : "#fff3c4");
    seaUniforms.uDeep.value.set(dark ? "#0b2238" : "#7fa3c6");
    seaUniforms.uCrest.value.set(dark ? "#2c5a86" : "#c4d8ec");
    seaUniforms.uGlint.value.set(dark ? "#cfeedd" : "#ffffff");
    seaUniforms.uAlpha.value = dark ? 0.92 : 0.55;
    hazeMat.color.set(dark ? 0xcfe0f2 : 0xffffff);
    hazeMat.opacity = dark ? 0.35 : 0.5;
    rockMat.color.set(dark ? 0x7d8a9b : 0xffffff); // a tint over the cliff's own colours
    seaUniforms.uFoam.value.set(dark ? "#9fb6cc" : "#ffffff");
  }
  applyTheme(initial);

  // --- Fit: keep the lighthouse in the lower right whatever the window's shape.
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const halfW =
      Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
      (camera.position.z - LH_Z) *
      camera.aspect;
    coast.position.set(halfW * 0.5, 0, LH_Z);
    seaUniforms.uCoast.value.set(coast.position.x, coast.position.z);
    seaUniforms.uLamp.value.set(coast.position.x + LH_LOCAL.x, 0, LH_Z + LH_LOCAL.y);
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  // --- Loop: capped frame rate, paused while the tab is hidden.
  const clock = new THREE.Clock();
  let raf = 0;
  let acc = 0;
  let elapsed = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    acc += clock.getDelta();
    if (acc < 1 / FPS) return;
    elapsed += acc;
    acc = 0;
    const angle = (elapsed / TURN_SECONDS) * Math.PI * 2;
    pivot.rotation.y = angle;
    beamUniforms.uTime.value = elapsed;
    seaUniforms.uTime.value = elapsed;
    seaUniforms.uBeamAngle.value = angle;
    // The halo flares as either beam swings towards the viewer (|sin| = 1 at +Z).
    const facing = Math.pow(Math.abs(Math.sin(angle)), 6);
    halo.scale.setScalar(3.2 + facing * 2.6);
    haloMat.opacity = 0.55 + facing * 0.45;
    haze.position.x = Math.sin(elapsed * 0.03) * 3;
    renderer.render(scene, camera);
  }
  function onVisibility() {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else {
      clock.getDelta();
      raf = requestAnimationFrame(frame);
    }
  }
  document.addEventListener("visibilitychange", onVisibility);
  raf = requestAnimationFrame(frame);

  return {
    setTheme: applyTheme,
    dispose() {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      ro.disconnect();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    },
  };
}
