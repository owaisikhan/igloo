import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { createRandom, fbm2, fbm3 } from "@/lib/noise";

export const FOG_COLOR = new THREE.Color("#b3b7c2");

/** Over-bright white so only glowing elements cross the bloom threshold. */
export const glowMaterial = (intensity = 3) =>
  new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(intensity) });

/* ------------------------------------------------------------------ */
/* Terrain                                                             */
/* ------------------------------------------------------------------ */

export function buildTerrain(segments: number) {
  const size = 700;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const d = Math.hypot(x, z);
    // Flat plateau for the vault, rolling drifts, then mountains far away.
    // Gentle mound for the vault, rolling drifts, then mountains behind.
    const plateau = THREE.MathUtils.smoothstep(d, 6, 22);
    const mound = (1 - THREE.MathUtils.smoothstep(d, 4, 30)) * 1.5;
    const drifts = (fbm2(x * 0.04 + 11, z * 0.04 - 4) - 0.45) * 10 * plateau;
    const far = THREE.MathUtils.smoothstep(d, 45, 160);
    const mountains = Math.pow(fbm2(x * 0.011 + 3, z * 0.011 + 9, 6), 1.5) * 120 * far;
    const grain = (fbm2(x * 0.7, z * 0.7, 3) - 0.5) * 0.35;
    pos.setY(i, drifts + mountains + grain + mound - 1.5);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: "#747b8c",
    roughness: 0.95,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/* ------------------------------------------------------------------ */
/* The Kodexa vault — a dome of rounded snow blocks with a lit interior */
/* ------------------------------------------------------------------ */

export type VaultPanel = {
  mesh: THREE.Mesh;
  origin: THREE.Vector3;
  normal: THREE.Vector3;
  baseQuat: THREE.Quaternion;
  spin: THREE.Vector3;
  delay: number;
  /** Current hover push (eased toward a target every frame). */
  hover: number;
  label: number;
};

/** Unit rounded block roughened with position-based noise so it reads as packed snow. */
function buildBlockGeometry(seed: number) {
  let geo: THREE.BufferGeometry = new RoundedBoxGeometry(1, 1, 1, 4, 0.14);
  geo.deleteAttribute("normal");
  geo.deleteAttribute("uv");
  geo = mergeVertices(geo);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm3(v.x * 3.1 + seed, v.y * 3.1, v.z * 3.1 - seed, 4) - 0.5;
    v.multiplyScalar(1 + n * 0.07);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Standard material plus a fresnel rim so block edges catch a frosty highlight. */
function snowMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: "#6f7688",
    roughness: 0.95,
    metalness: 0,
  });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `#include <dithering_fragment>
      float kxRim = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 2.5);
      gl_FragColor.rgb += kxRim * vec3(0.28, 0.31, 0.37);`,
    );
  };
  return mat;
}

export function buildVault(radius = 4.2) {
  const group = new THREE.Group();
  const rand = createRandom(7);
  const panels: VaultPanel[] = [];
  const geometries = [0, 1, 2].map((s) => buildBlockGeometry(s * 9.3 + 1));
  const material = snowMaterial();
  const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  const edgePositions: number[] = [];
  const edgeAttr = edgeGeo.attributes.position as THREE.BufferAttribute;
  const tmpMatrix = new THREE.Matrix4();
  const tmpV = new THREE.Vector3();

  const addBlock = (
    center: THREE.Vector3,
    basis: [THREE.Vector3, THREE.Vector3, THREE.Vector3],
    size: THREE.Vector3,
  ) => {
    const [tangent, up, normal] = basis;
    const mesh = new THREE.Mesh(geometries[panels.length % geometries.length], material);
    const rot = new THREE.Matrix4().makeBasis(tangent, up, normal);
    const quat = new THREE.Quaternion().setFromRotationMatrix(rot);
    // A little hand-laid irregularity.
    quat.multiply(
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler((rand() - 0.5) * 0.12, (rand() - 0.5) * 0.12, (rand() - 0.5) * 0.1),
      ),
    );
    mesh.quaternion.copy(quat);
    mesh.position.copy(center);
    mesh.scale.copy(size);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    tmpMatrix.compose(center, quat, size);
    for (let i = 0; i < edgeAttr.count; i++) {
      tmpV.fromBufferAttribute(edgeAttr, i).applyMatrix4(tmpMatrix);
      edgePositions.push(tmpV.x, tmpV.y, tmpV.z);
    }

    panels.push({
      mesh,
      origin: center.clone(),
      normal: normal.clone(),
      baseQuat: quat.clone(),
      spin: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(4),
      delay: (1 - normal.y) * 0.35 + rand() * 0.25,
      hover: 0,
      label: 20 + Math.floor(rand() * 60),
    });
  };

  // Entrance faces this direction; the dome leaves a gap for it.
  const doorAngle = 0.15;
  const thickness = 0.8;
  const rows = 7;
  const maxPhi = THREE.MathUtils.degToRad(74);
  const rowHeight = (radius * maxPhi) / rows;

  for (let r = 0; r < rows; r++) {
    const phi = (r + 0.5) * (maxPhi / rows);
    const ringRadius = (radius - thickness / 2) * Math.cos(phi);
    const y = (radius - thickness / 2) * Math.sin(phi);
    const count = Math.max(5, Math.round((Math.PI * 2 * ringRadius) / 1.55));
    const width = ((Math.PI * 2 * ringRadius) / count) * 0.93;
    const stagger = r % 2 ? Math.PI / count : 0;
    for (let k = 0; k < count; k++) {
      const theta = (k / count) * Math.PI * 2 + stagger;
      const off = Math.atan2(Math.sin(theta - doorAngle), Math.cos(theta - doorAngle));
      if (r < 3 && Math.abs(off) < 0.36) continue;
      const normal = new THREE.Vector3(
        Math.cos(phi) * Math.cos(theta),
        Math.sin(phi),
        Math.cos(phi) * Math.sin(theta),
      );
      const tangent = new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta));
      const up = new THREE.Vector3().crossVectors(normal, tangent).normalize();
      const center = new THREE.Vector3(ringRadius * Math.cos(theta), y, ringRadius * Math.sin(theta));
      addBlock(center, [tangent, up, normal], new THREE.Vector3(width, rowHeight * 0.92, thickness));
    }
  }

  // Cap block on top.
  const top = radius - thickness / 2;
  addBlock(
    new THREE.Vector3(0, top * Math.sin(maxPhi + 0.08) + 0.15, 0),
    [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)],
    new THREE.Vector3(2.1, 2.1, thickness),
  );

  // Arched entrance tunnel of blocks.
  const axis = new THREE.Vector3(Math.cos(doorAngle), 0, Math.sin(doorAngle));
  const side = new THREE.Vector3(-axis.z, 0, axis.x);
  const archRadius = 1.35;
  const archBlocks = 5;
  for (let layer = 0; layer < 2; layer++) {
    const along = radius - 0.3 + layer * 1.05;
    for (let j = 0; j < archBlocks; j++) {
      const a = ((j + 0.5) / archBlocks) * Math.PI;
      const normal = side.clone().multiplyScalar(Math.cos(a)).add(new THREE.Vector3(0, Math.sin(a), 0));
      // Right-handed basis (tangent × axis = normal) so the rotation is valid.
      const tangent = side
        .clone()
        .multiplyScalar(Math.sin(a))
        .add(new THREE.Vector3(0, -Math.cos(a), 0));
      const center = axis
        .clone()
        .multiplyScalar(along)
        .addScaledVector(normal, archRadius)
        .add(new THREE.Vector3(0, 0.1, 0));
      const arcLen = ((Math.PI * archRadius) / archBlocks) * 0.93;
      addBlock(center, [tangent, axis.clone(), normal], new THREE.Vector3(arcLen, 0.98, 0.62));
    }
  }

  // Bright interior glimpsed through the joints — picked up by the bloom pass.
  const coreMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1, 1, 1).multiplyScalar(2.2),
    side: THREE.DoubleSide,
  });
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(radius - thickness - 0.02, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    coreMat,
  );
  group.add(core);
  const baseRing = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.1, 0.03, 6, 128), glowMaterial(1.4));
  baseRing.rotation.x = Math.PI / 2;
  baseRing.position.y = -0.1;
  baseRing.visible = false;
  group.add(baseRing);

  // Wireframe twin used by the intro.
  const edgesGeo = new THREE.BufferGeometry();
  edgesGeo.setAttribute("position", new THREE.Float32BufferAttribute(edgePositions, 3));
  const edges = new THREE.LineSegments(
    edgesGeo,
    new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, fog: false }),
  );

  return { group, panels, core, baseRing, edges };
}

/* ------------------------------------------------------------------ */
/* Intro: a network of wireframe triangles with floating numbers       */
/* ------------------------------------------------------------------ */

function numberTexture(value: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "500 20px 'IBM Plex Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(value, 32, 16);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildWireNetwork(count: number) {
  const rand = createRandom(21);
  const group = new THREE.Group();
  const verts: number[] = [];
  for (let i = 0; i < count; i++) {
    const cx = (rand() - 0.5) * 90;
    const cz = (rand() - 0.5) * 90;
    if (Math.hypot(cx, cz) < 6) continue;
    const s = 3 + rand() * 7;
    const pts = [0, 1, 2].map(() => [
      cx + (rand() - 0.5) * s,
      (rand() - 0.2) * s * 0.6,
      cz + (rand() - 0.5) * s,
    ]);
    for (const [u, v] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ]) {
      verts.push(...pts[u], ...pts[v]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  const lines = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.75,
      fog: false,
    }),
  );
  group.add(lines);

  const labels: THREE.Sprite[] = [];
  const values = ["24", "29", "32", "36", "38", "41", "47", "54", "59", "63", "68"];
  const textures = values.map(numberTexture);
  for (let i = 0; i < 70; i++) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: textures[Math.floor(rand() * textures.length)],
        transparent: true,
        depthWrite: false,
        fog: false,
        opacity: 0.4 + rand() * 0.6,
      }),
    );
    sprite.position.set((rand() - 0.5) * 90, rand() * 3, (rand() - 0.5) * 90);
    sprite.scale.set(1.6, 0.8, 1);
    group.add(sprite);
    labels.push(sprite);
  }
  return { group, lines, labels };
}

/* ------------------------------------------------------------------ */
/* Ventures: rough, chipped blocks with an iridescent sheen            */
/* ------------------------------------------------------------------ */

export function buildRockBlock(seed: number, size = 4.4) {
  let geo: THREE.BufferGeometry = new THREE.BoxGeometry(size, size, size, 26, 26, 26);
  geo.deleteAttribute("normal");
  geo.deleteAttribute("uv");
  geo = mergeVertices(geo);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const dir = v.clone().normalize();
    const n = fbm3(v.x * 0.7 + seed, v.y * 0.7, v.z * 0.7 - seed);
    const chip = fbm3(v.x * 1.6 - seed, v.y * 1.6 + seed, v.z * 1.6);
    // Knock chunks out of the corners and roughen the faces.
    const corner = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) / (size / 2);
    const bite = chip > 0.58 ? (chip - 0.58) * 2.6 * Math.pow(corner, 3) : 0;
    v.addScaledVector(dir, (n - 0.5) * 0.28 - bite);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({
    color: "#8f96a8",
    roughness: 0.42,
    metalness: 0.35,
    iridescence: 1,
    iridescenceIOR: 1.7,
    iridescenceThicknessRange: [120, 900],
    clearcoat: 0.6,
    clearcoatRoughness: 0.3,
  });
  return new THREE.Mesh(geo, mat);
}

/* ------------------------------------------------------------------ */
/* Ambient dust                                                        */
/* ------------------------------------------------------------------ */

export function buildDust(count: number, spread: THREE.Vector3) {
  const rand = createRandom(99);
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = (rand() - 0.5) * spread.x;
    arr[i * 3 + 1] = rand() * spread.y;
    arr[i * 3 + 2] = (rand() - 0.5) * spread.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: "#ffffff",
      size: 0.08,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Labs: pedestal + particle sculpture                                 */
/* ------------------------------------------------------------------ */

export function buildPedestal() {
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: "#9da2ae", roughness: 0.7 });
  const glow = glowMaterial(1.8);

  const floor = new THREE.Mesh(new THREE.CylinderGeometry(60, 60, 0.4, 128), stone);
  floor.position.y = -0.2;
  floor.receiveShadow = true;
  group.add(floor);

  const tiers = [
    { r: 13, h: 0.35 },
    { r: 8.5, h: 0.7 },
    { r: 4.2, h: 1.1 },
  ];
  for (const { r, h } of tiers) {
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 128), stone);
    tier.position.y = h / 2;
    tier.receiveShadow = true;
    group.add(tier);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(r + 0.02, 0.05, 8, 160), glow);
    edge.rotation.x = Math.PI / 2;
    edge.position.y = h;
    group.add(edge);
  }

  // Wide halo hanging above the sculpture.
  const halo = new THREE.Mesh(new THREE.TorusGeometry(10, 0.22, 12, 160), glow);
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 19;
  group.add(halo);

  return group;
}

export const PARTICLE_COUNT = 14000;

export type ShapeName = "orb" | "knot" | "glyph";

function sampleGlyph(letter: string, count: number, rand: () => number) {
  const size = 160;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const filled: [number, number][] = [];
  if (ctx) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#fff";
    ctx.font = "700 150px 'IBM Plex Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, size / 2, size / 2 + 6);
    const data = ctx.getImageData(0, 0, size, size).data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (data[(y * size + x) * 4] > 128) filled.push([x, y]);
      }
    }
  }
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const [x, y] = filled.length
      ? filled[Math.floor(rand() * filled.length)]
      : [size / 2, size / 2];
    out[i * 3] = ((x + rand()) / size - 0.5) * 7.5;
    out[i * 3 + 1] = (0.5 - (y + rand()) / size) * 7.5;
    out[i * 3 + 2] = (rand() - 0.5) * 1.6;
  }
  return out;
}

export function buildShapes(count: number): Record<ShapeName, Float32Array> {
  const rand = createRandom(5);

  const orb = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1;
    const t = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const dir = new THREE.Vector3(s * Math.cos(t), u, s * Math.sin(t));
    const r = 3.3 + (fbm3(dir.x * 2, dir.y * 2, dir.z * 2) - 0.5) * 1.4 - rand() * 0.25;
    orb.set([dir.x * r, dir.y * r, dir.z * r], i * 3);
  }

  const knot = new Float32Array(count * 3);
  const P = 2;
  const Q = 3;
  for (let i = 0; i < count; i++) {
    const t = rand() * Math.PI * 2;
    const r = 2.2 + Math.cos(Q * t);
    const center = new THREE.Vector3(r * Math.cos(P * t), Math.sin(Q * t) * 1.2, r * Math.sin(P * t));
    const a = rand() * Math.PI * 2;
    const tube = 0.55 * Math.sqrt(rand());
    knot.set(
      [
        center.x * 1.15 + Math.cos(a) * tube,
        center.y * 1.3 + Math.sin(a) * tube,
        center.z * 1.15 + Math.sin(a * 2) * tube * 0.5,
      ],
      i * 3,
    );
  }

  const glyph = sampleGlyph("K", count, rand);
  return { orb, knot, glyph };
}

const particleVertex = /* glsl */ `
  attribute float aRand;
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  varying float vDepth;
  varying float vRand;
  void main() {
    vec3 p = position;
    p += 0.035 * vec3(
      sin(uTime * 1.7 + aRand * 40.0),
      cos(uTime * 1.3 + aRand * 25.0),
      sin(uTime * 1.1 + aRand * 60.0)
    );
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (0.7 + aRand * 0.6) * (22.0 / -mv.z);
    vDepth = -mv.z;
    vRand = aRand;
  }
`;

const particleFragment = /* glsl */ `
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying float vDepth;
  varying float vRand;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(c, c);
    if (r2 > 1.0) discard;
    vec3 n = vec3(c.x, -c.y, sqrt(1.0 - r2));
    float diffuse = max(dot(n, normalize(vec3(0.35, 0.85, 0.45))), 0.0);
    vec3 base = mix(vec3(0.30, 0.33, 0.40), vec3(0.42, 0.45, 0.53), vRand);
    vec3 col = base * (0.45 + 0.8 * diffuse) + pow(diffuse, 12.0) * 0.25;
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
    gl_FragColor = vec4(mix(col, uFogColor, clamp(fog, 0.0, 1.0)), 1.0);
  }
`;

export function buildParticles(count: number, start: Float32Array) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(start.slice(), 3));
  const rand = createRandom(13);
  const r = new Float32Array(count);
  for (let i = 0; i < count; i++) r[i] = rand();
  geo.setAttribute("aRand", new THREE.BufferAttribute(r, 1));
  const material = new THREE.ShaderMaterial({
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: 5 },
      uPixelRatio: { value: 1 },
      uFogColor: { value: FOG_COLOR.clone().convertSRGBToLinear() },
      uFogDensity: { value: 0.02 },
    },
  });
  return new THREE.Points(geo, material);
}
