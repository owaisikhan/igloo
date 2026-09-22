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
      float off = 0.002 + uGlitch * 0.018;
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
    this.update(0, 0);
  }

  /* ---------------------------------------------------------------- */

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#6d7384", 0.9));
    const sun = new THREE.DirectionalLight("#ffffff", 1.3);
    sun.position.set(18, 30, 12);
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

    if (p < VENTURES.start) this.updateWorld(p, time);
    else if (p < LABS.start) this.updateVentures(p, time);
    else this.updateLabs(p, time, dt);

    this.camera.lookAt(this.lookAt);
  }

  private updateWorld(p: number, time: number) {
    const intro = smoothstep(0, HERO.start, p);
    const hero = range(p, HERO.start, HERO.end);
    const mani = range(p, MANIFESTO.start, MANIFESTO.end);

    // Intro: dense fog hides everything except the wireframe overlay.
    const introFog = THREE.MathUtils.lerp(0.09, 0.009, intro);
    const whiteout = smoothstep(0.85, 1, mani) * 0.12;
    this.fog.density = introFog + whiteout;

    const wireAlpha = 1 - smoothstep(0.35, 1, intro);
    (this.network.lines.material as THREE.LineBasicMaterial).opacity = 0.75 * wireAlpha;
    this.network.labels.forEach((s) => (s.material.opacity = wireAlpha * 0.8));
    (this.vaultEdges.material as THREE.LineBasicMaterial).opacity = wireAlpha;
    this.network.group.visible = wireAlpha > 0.01;
    this.vaultEdges.visible = wireAlpha > 0.01;

    // Camera: top-down → orbiting hero shot → push into the vault.
    const orbit = 0.75 - hero * 0.5 + Math.sin(time * 0.1) * 0.03;
    const dist = THREE.MathUtils.lerp(19, 17, hero) - smoothstep(0, 1, mani) * 10;
    const height = THREE.MathUtils.lerp(7, 5.5, hero) - mani * 2.5;
    const introPos = this.tmp.set(0, 42, 24);
    const heroPos = new THREE.Vector3(Math.sin(orbit) * dist, height, Math.cos(orbit) * dist);
    this.camera.position.copy(introPos.lerp(heroPos, intro));
    this.lookAt.set(0, THREE.MathUtils.lerp(0, 2.2, intro) + mani * 1.5, 0);

    // Manifesto: the vault opens, panels drift apart.
    const burst = smoothstep(0.05, 0.85, mani);
    for (const panel of this.panels) {
      const t = smoothstep(panel.delay, 1, burst * 1.4);
      panel.mesh.position
        .copy(panel.origin)
        .addScaledVector(panel.normal, t * 7)
        .add(this.tmp.set(0, t * 2.5, 0));
      panel.mesh.rotation.set(panel.spin.x * t, panel.spin.y * t, panel.spin.z * t);
    }
    this.vaultCore.scale.setScalar(1 - burst * 0.35);
    this.bloomPass.strength = 0.5 + burst * 0.2;
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
