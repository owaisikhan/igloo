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

// Extra peaks behind the vault, on the right-hand side of the hero camera view.
const RIGHT_PEAKS = [
  { x: -19, z: -115, height: 62, radius: 32 },
  { x: 8, z: -150, height: 82, radius: 38 },
  { x: -19, z: -159, height: 100, radius: 44 },
  { x: 12, z: -208, height: 118, radius: 50 },
  { x: -19, z: -215, height: 135, radius: 58 },
];

function peaks(x: number, z: number) {
  let h = 0;
  for (const p of RIGHT_PEAKS) {
    const d2 = (x - p.x) ** 2 + (z - p.z) ** 2;
    const falloff = Math.exp(-d2 / (p.radius * p.radius));
    if (falloff < 0.002) continue;
    // Ridged noise carves gullies and sharp crests into each peak.
    const ridge = 1 - Math.abs(fbm2(x * 0.03 + p.x, z * 0.03 + p.z, 5) * 2 - 1);
    h = Math.max(h, p.height * falloff * (0.65 + ridge * 0.55));
  }
  return h;
}

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
    const plateau = THREE.MathUtils.smoothstep(d, 12, 45);
    const mound = (1 - THREE.MathUtils.smoothstep(d, 4, 30)) * 1.5;
    const drifts = (fbm2(x * 0.04 + 11, z * 0.04 - 4) - 0.45) * 10 * plateau;
    const far = THREE.MathUtils.smoothstep(d, 50, 150);
    const mountains = Math.pow(fbm2(x * 0.011 + 3, z * 0.011 + 9, 6), 1.5) * 170 * far;
    const grain = (fbm2(x * 0.7, z * 0.7, 3) - 0.5) * 0.35;
    pos.setY(i, drifts + Math.max(mountains, peaks(x, z)) + grain + mound - 1.5);
  }
  geo.computeVertexNormals();

  // Snow on gentle ground, darker exposed rock on steep slopes so ridges read
  // against the fog.
  const normals = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const snow = new THREE.Color("#8a91a2");
  const rock = new THREE.Color("#4c5263");
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const steep = THREE.MathUtils.smoothstep(1 - normals.getY(i), 0.12, 0.45);
    const streak = fbm2(pos.getX(i) * 0.09, pos.getZ(i) * 0.09, 3);
    c.lerpColors(snow, rock, Math.min(1, steep * (0.6 + streak * 0.8)));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(geo, terrainMaterial());
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

/**
 * Pillowy snow block built at its real size, so the large soft bevel stays
 * round instead of being stretched by a non-uniform scale.
 */
function buildBlockGeometry(size: THREE.Vector3, seed: number) {
  const bevel = Math.min(size.x, size.y, size.z) * 0.24;
  let geo: THREE.BufferGeometry = new RoundedBoxGeometry(size.x, size.y, size.z, 8, bevel);
  geo.deleteAttribute("normal");
  geo.deleteAttribute("uv");
  geo = mergeVertices(geo);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const half = size.clone().multiplyScalar(0.5);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Faces bulge slightly outward, like packed snow that has settled.
    const nx = v.x / half.x;
    const ny = v.y / half.y;
    const nz = v.z / half.z;
    const puff = 0.03 * Math.min(size.x, size.y, size.z);
    v.x += Math.sign(nx) * puff * (1 - ny * ny) * (1 - nz * nz) * Math.abs(nx);
    v.y += Math.sign(ny) * puff * (1 - nx * nx) * (1 - nz * nz) * Math.abs(ny);
    v.z += Math.sign(nz) * puff * (1 - nx * nx) * (1 - ny * ny) * Math.abs(nz);
    const lumps = fbm3(v.x * 2.4 + seed, v.y * 2.4, v.z * 2.4 - seed, 4) - 0.5;
    const chips = fbm3(v.x * 6 - seed, v.y * 6 + seed, v.z * 6, 3) - 0.5;
    v.addScaledVector(v.clone().normalize(), lumps * 0.07 + chips * 0.025);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// GLSL helpers for the procedural snow surface (value noise + fbm).
const snowNoiseGlsl = /* glsl */ `
  varying vec3 vKxPos;
  float kxHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float kxNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(kxHash(i), kxHash(i + vec3(1, 0, 0)), f.x),
          mix(kxHash(i + vec3(0, 1, 0)), kxHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(kxHash(i + vec3(0, 0, 1)), kxHash(i + vec3(1, 0, 1)), f.x),
          mix(kxHash(i + vec3(0, 1, 1)), kxHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float kxFbm(vec3 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      s += a * kxNoise(p);
      p *= 2.07;
      a *= 0.5;
    }
    return s;
  }
  // Packed-snow height field: broad lumps, fine grain and scattered pits.
  float kxSnowHeight(vec3 p) {
    float lumps = kxFbm(p * 2.2);
    float grain = kxFbm(p * 6.0);
    float pits = smoothstep(0.66, 0.82, kxNoise(p * 4.5));
    return lumps * 0.6 + grain * 0.4 - pits * 0.3;
  }
`;

type SnowDetail = {
  /** "object": pattern sticks to each mesh; "world": fixed in the world (terrain). */
  space: "object" | "world";
  scale: number;
  bump: number;
  /** How strongly upward-facing surfaces turn bright, frosted white. */
  frost: number;
  rim: number;
  glints: boolean;
};

/** Injects the procedural packed-snow surface into a standard material. */
function addSnowDetail(mat: THREE.MeshStandardMaterial, o: SnowDetail) {
  mat.onBeforeCompile = (shader) => {
    const pos =
      o.space === "object"
        ? "vKxPos = transformed;"
        : "vKxPos = (modelMatrix * vec4(transformed, 1.0)).xyz;";
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vKxPos;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${pos}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n" + snowNoiseGlsl)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 kxP = vKxPos * ${o.scale.toFixed(3)};
        float kxH = kxSnowHeight(kxP);
        float kxPatch = kxFbm(kxP * 0.45 + 7.0);
        // Detail fades with distance to avoid shimmering on far surfaces.
        float kxNear = 1.0 - smoothstep(18.0, 70.0, length(vViewPosition));
        diffuseColor.rgb *= mix(1.0, 0.8 + kxH * 0.28 + kxPatch * 0.16, kxNear);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (0.8 + kxH * 0.35), 0.35, 1.0);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          // Screen-space bump mapping from the height field.
          vec3 kxSurf = -vViewPosition;
          vec3 kxSx = dFdx(kxSurf);
          vec3 kxSy = dFdy(kxSurf);
          vec3 kxR1 = cross(kxSy, normal);
          vec3 kxR2 = cross(normal, kxSx);
          float kxDet = dot(kxSx, kxR1) * faceDirection;
          vec2 kxDh = vec2(dFdx(kxH), dFdy(kxH)) * ${o.bump.toFixed(3)} * kxNear;
          vec3 kxGrad = sign(kxDet) * (kxDh.x * kxR1 + kxDh.y * kxR2);
          normal = normalize(abs(kxDet) * normal - kxGrad);
        }
        // Fresh snow settles on upward-facing surfaces.
        vec3 kxWorldN = inverseTransformDirection(normal, viewMatrix);
        float kxFrost = smoothstep(0.25, 0.9, kxWorldN.y) * (0.75 + kxPatch * 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 1.0), clamp(kxFrost, 0.0, 1.0) * ${o.frost.toFixed(3)});`,
      )
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        float kxFacing = clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
        gl_FragColor.rgb += pow(1.0 - kxFacing, 2.5) * vec3(0.3, 0.33, 0.4) * ${o.rim.toFixed(3)};
        ${
          o.glints
            ? `float kxGlint = step(0.995, kxHash(floor(vKxPos * 60.0)));
        gl_FragColor.rgb += kxGlint * pow(kxFacing, 4.0) * 0.3;`
            : ""
        }`,
      );
  };
  return mat;
}

/** Snow-block material: soft packed snow with frosted tops. */
function snowMaterial() {
  return addSnowDetail(
    new THREE.MeshStandardMaterial({ color: "#6d7487", roughness: 0.9, metalness: 0 }),
    { space: "object", scale: 1, bump: 0.2, frost: 0.45, rim: 0.8, glints: true },
  );
}

/** Ground snow: wind-packed grain, fixed in world space. */
export function terrainMaterial() {
  return addSnowDetail(
    new THREE.MeshStandardMaterial({ vertexColors: true, color: "#ffffff", roughness: 0.95, metalness: 0 }),
    { space: "world", scale: 0.35, bump: 0.12, frost: 0, rim: 0.15, glints: false },
  );
}

export function buildVault(radius = 4.2) {
  const group = new THREE.Group();
  const rand = createRandom(7);
  const panels: VaultPanel[] = [];
  const geometryCache = new Map<string, THREE.BufferGeometry>();
  const geometryFor = (size: THREE.Vector3, variant: number) => {
    const key = `${size.x.toFixed(2)}:${size.y.toFixed(2)}:${size.z.toFixed(2)}:${variant}`;
    let geo = geometryCache.get(key);
    if (!geo) {
      geo = buildBlockGeometry(size, variant * 9.3 + 1);
      geometryCache.set(key, geo);
    }
    return geo;
  };
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
    const mesh = new THREE.Mesh(geometryFor(size, panels.length % 3), material);
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
    const width = ((Math.PI * 2 * ringRadius) / count) * 0.88;
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
      addBlock(center, [tangent, up, normal], new THREE.Vector3(width, rowHeight * 0.86, thickness));
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
    const along = radius - 0.3 + layer * 1.08;
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
      const arcLen = ((Math.PI * archRadius) / archBlocks) * 0.86;
      addBlock(center, [tangent, axis.clone(), normal], new THREE.Vector3(arcLen, 0.94, 0.7));
    }
  }

  // Bright interior glimpsed through the joints — picked up by the bloom pass.
  const coreMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.9, 0.95, 1).multiplyScalar(2.4),
    side: THREE.DoubleSide,
  });
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(radius - thickness - 0.02, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    coreMat,
  );
  group.add(core);
  // Light spilling out of the interior: lights block sides and the joints.
  const innerLight = new THREE.PointLight("#dfe9ff", 22, radius * 2.2, 1.6);
  innerLight.position.set(0, radius * 0.35, 0);
  group.add(innerLight);
  const tunnelLight = new THREE.PointLight("#dfe9ff", 6, 4, 1.6);
  tunnelLight.position.copy(axis.clone().multiplyScalar(radius + 0.7)).setY(0.9);
  group.add(tunnelLight);

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
