import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  SECTIONS,
  VENTURE_CAMERA,
  VENTURE_SPACING,
  glitchAt,
  range,
  smoothstep,
} from "@/lib/timeline";
import {
  FOG_COLOR,
  PARTICLE_COUNT,
  buildDust,
  buildParticles,
  buildPedestal,
  buildRockBlock,
  buildShapes,
  buildTerrain,
  buildVault,
  buildWireNetwork,
  type ShapeName,
  type VaultPanel,
} from "./builders";

const [, HERO, MANIFESTO, VENTURES, LABS, CONTACT] = SECTIONS;

const GlitchShader = {
  uniforms: {
    tDiffuse: { value: null },
    uGlitch: { value: 0 },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uGlitch;
    uniform float uTime;
    uniform vec2 uResolution;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      float band = floor(uv.y * 28.0);
      float n = hash(vec2(band, floor(uTime * 18.0)));
      uv.x += step(0.72, n) * (n - 0.72) * uGlitch * 0.35;
      float blocky = step(0.9, hash(floor(uv * vec2(18.0, 40.0)) + floor(uTime * 12.0)));
      uv = mix(uv, floor(uv * 90.0) / 90.0, blocky * uGlitch);
      float off = 0.0004 + uGlitch * 0.018;
      vec3 col = vec3(
        texture2D(tDiffuse, uv + vec2(off, 0.0)).r,
        texture2D(tDiffuse, uv).g,
        texture2D(tDiffuse, uv - vec2(off, 0.0)).b
      );
      col += (hash(uv * uResolution + uTime) - 0.5) * 0.03;
      float vig = smoothstep(1.25, 0.35, length(vUv - 0.5) * 1.6);
      col *= mix(0.82, 1.0, vig);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

type VentureBlock = { mesh: THREE.Mesh; base: THREE.Vector3; spin: number };

export type EngineOptions = {
  canvas: HTMLCanvasElement;
  reducedMotion: boolean;
};

export class KodexaEngine {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private glitchPass: ShaderPass;
  private bloomPass: UnrealBloomPass;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 2000);
  private fog = new THREE.FogExp2(FOG_COLOR.getHex(), 0.02);
  private timer = new THREE.Timer();
  private raf = 0;
  private reducedMotion: boolean;

  private target = 0;
  private progress = 0;
  private lab = 0;

  // Scene A: snowfield + vault
  private world = new THREE.Group();
  private panels: VaultPanel[] = [];
  private vaultCore!: THREE.Mesh;
  private vaultEdges!: THREE.LineSegments;
  private network!: ReturnType<typeof buildWireNetwork>;

  // Scene B: ventures
  private venturesGroup = new THREE.Group();
  private blocks: VentureBlock[] = [];
  private anchors: (HTMLElement | null)[] = [];

  // Scene C: labs
  private labsGroup = new THREE.Group();
  private particles!: THREE.Points;
  private shapes!: Record<ShapeName, Float32Array>;
  private shapeOrder: ShapeName[] = ["orb", "knot", "glyph"];

  // Hover interaction on the vault blocks
  private pointer = new THREE.Vector2(10, 10);
  private raycaster = new THREE.Raycaster();
  private hoverMarkers: (HTMLElement | null)[] = [];
  private hoverLines: (SVGLineElement | null)[] = [];
  private blockMeshes: THREE.Object3D[] = [];

  private lookAt = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  constructor({ canvas, reducedMotion }: EngineOptions) {
    this.reducedMotion = reducedMotion;
    const mobile = window.innerWidth < 768;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = !mobile;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.background = FOG_COLOR.clone();
    this.scene.fog = this.fog;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();

    this.buildLights();
    this.buildWorld(mobile);
    this.buildVentures();
    this.buildLabs(mobile);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.55, 1.1);
    this.composer.addPass(this.bloomPass);
    this.glitchPass = new ShaderPass(GlitchShader);
    this.composer.addPass(this.glitchPass);
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("pointermove", this.onPointerMove);
    document.addEventListener("pointerleave", this.onPointerLeave);
    this.update(0, 0);
  }

  /* ---------------------------------------------------------------- */

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight("#eef1f8", "#4f5566", 0.55));
    const sun = new THREE.DirectionalLight("#ffffff", 2.1);
    sun.position.set(-14, 22, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const s = sun.shadow.camera;
    s.left = -20;
    s.right = 20;
    s.top = 20;
    s.bottom = -20;
    this.scene.add(sun);
  }

  private buildWorld(mobile: boolean) {
    this.world.add(buildTerrain(mobile ? 160 : 280));
    const vault = buildVault();
    vault.group.position.y = 0.2;
    this.panels = vault.panels;
    this.blockMeshes = vault.panels.map((pn) => pn.mesh);
    this.vaultCore = vault.core;
    this.vaultEdges = vault.edges;
    vault.edges.position.y = 0.2;
    this.world.add(vault.group, vault.edges);
    this.network = buildWireNetwork(mobile ? 70 : 130);
    this.world.add(this.network.group);
    this.world.add(buildDust(1500, new THREE.Vector3(120, 30, 120)));
    this.scene.add(this.world);
  }

  private buildVentures() {
    const offsets = [-3.2, 3.6, -2.4];
    offsets.forEach((x, i) => {
      const mesh = buildRockBlock(i * 13.7 + 2);
      const base = new THREE.Vector3(x, 4 + (i % 2) * 1.2, -i * VENTURE_SPACING);
      mesh.position.copy(base);
      mesh.rotation.set(0.5 + i, 0.8 * i, 0.3);
      this.venturesGroup.add(mesh);
      this.blocks.push({ mesh, base, spin: 0.12 + i * 0.05 });
    });
    this.venturesGroup.add(buildDust(2500, new THREE.Vector3(60, 20, 140)));
    const dust = this.venturesGroup.children.at(-1);
    dust?.position.set(0, -4, -30);
    this.venturesGroup.visible = false;
    this.scene.add(this.venturesGroup);
  }

  private buildLabs(mobile: boolean) {
    this.labsGroup.add(buildPedestal());
    const count = mobile ? Math.floor(PARTICLE_COUNT * 0.55) : PARTICLE_COUNT;
    this.shapes = buildShapes(count);
    this.particles = buildParticles(count, this.shapes.orb);
    this.particles.position.y = 7;
    this.particles.frustumCulled = false;
    this.labsGroup.add(this.particles);
    this.labsGroup.add(buildDust(800, new THREE.Vector3(40, 22, 40)));
    this.labsGroup.visible = false;
    this.scene.add(this.labsGroup);
  }

  /* ---------------------------------------------------------------- */

  setProgress(p: number) {
    this.target = p;
  }

  setLab(index: number) {
    this.lab = index;
  }

  setHoverOverlay(markers: (HTMLElement | null)[], lines: (SVGLineElement | null)[]) {
    this.hoverMarkers = markers;
    this.hoverLines = lines;
  }

  private onPointerMove = (e: PointerEvent) => {
    this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  };

  private onPointerLeave = () => {
    this.pointer.set(10, 10);
  };

  setVentureAnchors(els: (HTMLElement | null)[]) {
    this.anchors = els;
  }

  start() {
    this.timer.connect(document);
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      this.timer.update(now);
      const dt = Math.min(this.timer.getDelta(), 0.05);
      this.progress += (this.target - this.progress) * (1 - Math.exp(-dt * 6));
      this.update(this.progress, dt);
      this.composer.render(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.timer.dispose();
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("pointermove", this.onPointerMove);
    document.removeEventListener("pointerleave", this.onPointerLeave);
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    this.composer.dispose();
    this.renderer.dispose();
  }

  private resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    // Keep the scene framed on portrait screens.
    this.camera.fov = w < h ? 55 : 38;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w, h);
    const pr = this.renderer.getPixelRatio();
    this.glitchPass.uniforms.uResolution.value.set(w * pr, h * pr);
    (this.particles.material as THREE.ShaderMaterial).uniforms.uPixelRatio.value = pr;
  };

  /* ---------------------------------------------------------------- */

  private update(p: number, dt: number) {
    const time = this.timer.getElapsed();
    const glitch = this.reducedMotion ? 0 : glitchAt(p);
    this.glitchPass.uniforms.uGlitch.value = glitch;
    this.glitchPass.uniforms.uTime.value = time;

    const showWorld = p < VENTURES.start + 0.01;
    const showVentures = p >= VENTURES.start - 0.005 && p < LABS.start + 0.01;
    const showLabs = p >= LABS.start - 0.005;
    this.world.visible = showWorld;
    this.venturesGroup.visible = showVentures;
    this.labsGroup.visible = showLabs;

    if (p >= VENTURES.start) this.hideHoverOverlay();
    if (p < VENTURES.start) this.updateWorld(p, time, dt);
    else if (p < LABS.start) this.updateVentures(p, time);
    else this.updateLabs(p, time, dt);

    this.camera.lookAt(this.lookAt);
  }

  private updateWorld(p: number, time: number, dt: number) {
    const intro = smoothstep(0, HERO.start, p);
    const hero = range(p, HERO.start, HERO.end);
    const mani = range(p, MANIFESTO.start, MANIFESTO.end);

    // Intro: dense fog hides everything except the wireframe overlay.
    const introFog = THREE.MathUtils.lerp(0.09, 0.003, intro);
    const whiteout = smoothstep(0.85, 1, mani) * 0.12;
    this.fog.density = introFog + whiteout;

    const wireAlpha = 1 - smoothstep(0.35, 1, intro);
    (this.network.lines.material as THREE.LineBasicMaterial).opacity = 0.75 * wireAlpha;
    this.network.labels.forEach((s) => (s.material.opacity = wireAlpha * 0.8));
    (this.vaultEdges.material as THREE.LineBasicMaterial).opacity = wireAlpha;
    this.network.group.visible = wireAlpha > 0.01;
    this.vaultEdges.visible = wireAlpha > 0.01;

    // Camera: top-down → orbiting hero shot → push into the vault.
    const orbit = 0.62 - hero * 0.45 + Math.sin(time * 0.1) * 0.03;
    const dist = THREE.MathUtils.lerp(20, 18, hero) - smoothstep(0, 1, mani) * 11;
    const height = THREE.MathUtils.lerp(3.6, 3.0, hero) - mani * 0.8;
    const introPos = this.tmp.set(0, 42, 24);
    const heroPos = new THREE.Vector3(Math.sin(orbit) * dist, height, Math.cos(orbit) * dist);
    this.camera.position.copy(introPos.lerp(heroPos, intro));
    this.lookAt.set(0, THREE.MathUtils.lerp(0, 3.6, intro) + mani * 0.2, 0);

    // Hover: blocks near the pointer slide outward along their normals.
    const interactive = intro > 0.9 && mani < 0.05;
    let hit: VaultPanel | null = null;
    if (interactive && Math.abs(this.pointer.x) <= 1) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const [first] = this.raycaster.intersectObjects(this.blockMeshes, false);
      hit = first ? (this.panels.find((pn) => pn.mesh === first.object) ?? null) : null;
    }
    const ease = 1 - Math.exp(-dt * 7);

    // Manifesto: the vault opens, blocks drift apart.
    const burst = smoothstep(0.05, 0.85, mani);
    for (const panel of this.panels) {
      const reach = hit ? panel.origin.distanceTo(hit.origin) : Infinity;
      const target = hit ? Math.pow(Math.max(0, 1 - reach / 2.1), 1.5) : 0;
      panel.hover += (target - panel.hover) * ease;

      const t = smoothstep(panel.delay, 1, burst * 1.4);
      panel.mesh.position
        .copy(panel.origin)
        .addScaledVector(panel.normal, t * 7 + panel.hover * 1.35)
        .add(this.tmp.set(0, t * 2.5, 0));
      panel.mesh.quaternion.copy(panel.baseQuat);
      panel.mesh.rotateX(panel.spin.x * (t + panel.hover * 0.07));
      panel.mesh.rotateY(panel.spin.y * (t + panel.hover * 0.07));
      panel.mesh.rotateZ(panel.spin.z * t);
    }
    this.updateHoverOverlay(hit);
    this.vaultCore.scale.setScalar(1 - burst * 0.35);
    this.bloomPass.strength = 0.5 + burst * 0.2;
  }

  private hideHoverOverlay() {
    this.hoverMarkers.forEach((m) => m && (m.style.opacity = "0"));
    this.hoverLines.forEach((l) => l && (l.style.opacity = "0"));
  }

  /** Crosshair labels on the hovered block and its two most-lifted neighbours. */
  private updateHoverOverlay(hit: VaultPanel | null) {
    const lifted = this.panels
      .filter((pn) => pn.hover > 0.25)
      .sort((a, b) => (a === hit ? -1 : b === hit ? 1 : b.hover - a.hover))
      .slice(0, this.hoverMarkers.length);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const points: [number, number][] = [];
    this.hoverMarkers.forEach((el, i) => {
      if (!el) return;
      const panel = lifted[i];
      if (!panel) {
        el.style.opacity = "0";
        return;
      }
      this.tmp.copy(panel.normal).multiplyScalar(0.42);
      const world = panel.mesh.getWorldPosition(new THREE.Vector3()).add(this.tmp).project(this.camera);
      const x = (world.x * 0.5 + 0.5) * w;
      const y = (-world.y * 0.5 + 0.5) * h;
      points.push([x, y]);
      el.style.opacity = String(Math.min(1, (panel.hover - 0.25) * 3));
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      const label = el.querySelector("[data-label]");
      if (label) label.textContent = String(panel.label);
    });
    this.hoverLines.forEach((line, i) => {
      if (!line) return;
      const a = points[0];
      const b = points[i + 1];
      if (!a || !b) {
        line.style.opacity = "0";
        return;
      }
      line.setAttribute("x1", a[0].toFixed(1));
      line.setAttribute("y1", a[1].toFixed(1));
      line.setAttribute("x2", b[0].toFixed(1));
      line.setAttribute("y2", b[1].toFixed(1));
      line.style.opacity = "0.9";
    });
  }

  private updateVentures(p: number, time: number) {
    const t = range(p, VENTURES.start, VENTURES.end);
    const enter = smoothstep(VENTURES.start, VENTURES.start + 0.04, p);
    const exit = smoothstep(VENTURES.end - 0.04, VENTURES.end, p);
    this.fog.density = 0.028 + (1 - enter) * 0.1 + exit * 0.12;
    this.bloomPass.strength = 0.5;

    const z = THREE.MathUtils.lerp(VENTURE_CAMERA.from, VENTURE_CAMERA.to, t);
    this.camera.position.set(Math.sin(t * 6) * 1.2, 5 + Math.sin(t * 4) * 0.6, z);
    this.lookAt.set(0, 4.5, z - 12);

    const w = window.innerWidth;
    const h = window.innerHeight;
    this.blocks.forEach((b, i) => {
      b.mesh.rotation.y += b.spin * 0.01;
      b.mesh.rotation.x += b.spin * 0.004;
      b.mesh.position.y = b.base.y + Math.sin(time * 0.6 + i) * 0.35;

      const el = this.anchors[i];
      if (!el) return;
      this.tmp.copy(b.mesh.position).add(new THREE.Vector3(2.6, 1.4, 0)).project(this.camera);
      const inFront = this.tmp.z < 1;
      const cardWidth = w < 768 ? 260 : 340;
      const x = Math.min((this.tmp.x * 0.5 + 0.5) * w, w - cardWidth - 16);
      const y = Math.max((-this.tmp.y * 0.5 + 0.5) * h, 230);
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      el.style.visibility = inFront ? "visible" : "hidden";
    });
  }

  private updateLabs(p: number, time: number, dt: number) {
    const enter = smoothstep(LABS.start, LABS.start + 0.04, p);
    const outro = range(p, CONTACT.start, 1);
    this.fog.density = 0.018 + (1 - enter) * 0.1 + smoothstep(0.1, 1, outro) * 0.05;
    this.bloomPass.strength = 0.6;

    const settle = range(p, LABS.start, LABS.end);
    const dist = THREE.MathUtils.lerp(30, 24, settle);
    const angle = Math.sin(time * 0.15) * 0.08;
    this.camera.position.set(
      Math.sin(angle) * dist,
      THREE.MathUtils.lerp(8, 6.5, settle) + outro * 14,
      Math.cos(angle) * dist,
    );
    this.lookAt.set(0, 7 + outro * 10, 0);

    const mat = this.particles.material as THREE.ShaderMaterial;
    mat.uniforms.uTime.value = time;
    mat.uniforms.uFogDensity.value = this.fog.density;
    this.particles.rotation.y += dt * 0.25;

    // Morph particles toward the selected shape with a staggered ease.
    const target = this.shapes[this.shapeOrder[this.lab % this.shapeOrder.length]];
    const pos = this.particles.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const rnd = (this.particles.geometry.attributes.aRand as THREE.BufferAttribute).array as Float32Array;
    const base = 1 - Math.exp(-dt * 2.2);
    for (let i = 0; i < rnd.length; i++) {
      const k = base * (0.55 + rnd[i] * 0.9);
      const j = i * 3;
      arr[j] += (target[j] - arr[j]) * k;
      arr[j + 1] += (target[j + 1] - arr[j + 1]) * k;
      arr[j + 2] += (target[j + 2] - arr[j + 2]) * k;
    }
    pos.needsUpdate = true;
  }
}
