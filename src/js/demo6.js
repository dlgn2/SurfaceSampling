import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";

const elContent = document.querySelector(".content");
const pixelRatio = 2;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  60,
  elContent.offsetWidth / elContent.offsetHeight,
  0.001,
  50
);
camera.position.set(0, 0, 10);
camera.lookAt(0, -1, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(pixelRatio);
renderer.setSize(elContent.offsetWidth, elContent.offsetHeight);
renderer.localClippingEnabled = true; // clipping için gerekli
renderer.outputColorSpace = THREE.SRGBColorSpace; // Doğru renk uzayı
elContent.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.minDistance = 5;
controls.maxDistance = 100;
controls.maxPolarAngle = Math.PI;

// Post-processing
const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(elContent.offsetWidth, elContent.offsetHeight),
  0.8,
  0.4,
  0.85
);
bloomPass.threshold = 0.2;
bloomPass.strength = 0.5;

const composer = new EffectComposer(renderer);
composer.setPixelRatio(pixelRatio);
composer.addPass(renderScene);
composer.addPass(bloomPass);

const group = new THREE.Group();
scene.add(group);

// Hover animasyonu
let animationProgress = 0;
let targetProgress = 0;
const animationSpeed = 0.05;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Reveal state
let modelRevealStarted = false;
let modelRevealProgress = 0;
const modelRevealDelay = 10000; // 10s
let startTime = null;
let real3DStatue = null;
let marbleTexture = null;
let marbleNormalMap = null;
let marbleAOMap = null;
let marbleRoughnessMap = null;

// Disks & paths
let visibleDisks = [];
let sampler = null;
let statueSampler = null;
let statueMeshRef = null;
let paths = [];
let statuePaths = [];

const tempPosition = new THREE.Vector3();

const diskMaterials = [
  new THREE.LineBasicMaterial({
    color: 0x125d98,
    transparent: true,
    opacity: 0.5,
  }),
  new THREE.LineBasicMaterial({
    color: 0xcfd6de,
    transparent: true,
    opacity: 0.5,
  }),
  new THREE.LineBasicMaterial({
    color: 0x4169e1,
    transparent: true,
    opacity: 0.5,
  }),
  new THREE.LineBasicMaterial({
    color: 0x0000cd,
    transparent: true,
    opacity: 0.5,
  }),
];

const statueMaterials = [
  new THREE.LineBasicMaterial({
    color: 0xffffff,  // Beyaz
    transparent: true,
    opacity: 0.2,
  }),
  new THREE.LineBasicMaterial({
    color: 0xf0f0f0,  // Açık beyaz/gri
    transparent: true,
    opacity: 0.2,
  }),
];

// Galaxy
const galaxyColors = [
  new THREE.Color("#f9fbf2"),
  new THREE.Color("#ffede1"),
  new THREE.Color("#05c7f2"),
  new THREE.Color("#0597f2"),
  new THREE.Color("#0476d9"),
];

class Star {
  setup(color) {
    this.r = Math.random() * 12 + 3;
    this.phi = Math.random() * Math.PI * 2;
    this.theta = Math.random() * Math.PI;
    this.v = new THREE.Vector2().random().subScalar(0.5).multiplyScalar(0.0007);
    this.x = this.r * Math.sin(this.phi) * Math.sin(this.theta);
    this.y = this.r * Math.cos(this.phi);
    this.z = this.r * Math.sin(this.phi) * Math.cos(this.theta);
    this.size = Math.random() * 4 + 2 * pixelRatio;
    this.color = color;
  }
  update() {
    this.phi += this.v.x;
    this.theta += this.v.y;
    this.x = this.r * Math.sin(this.phi) * Math.sin(this.theta);
    this.y = this.r * Math.cos(this.phi);
    this.z = this.r * Math.sin(this.phi) * Math.cos(this.theta);
  }
}

// Galaxy points
const stars = [];
const galaxyGeometryVertices = [];
const galaxyGeometryColors = [];
const galaxyGeometrySizes = [];
for (let i = 0; i < 1500; i++) {
  const star = new Star();
  star.setup(galaxyColors[Math.floor(Math.random() * galaxyColors.length)]);
  galaxyGeometryVertices.push(star.x, star.y, star.z);
  galaxyGeometryColors.push(star.color.r, star.color.g, star.color.b);
  galaxyGeometrySizes.push(star.size);
  stars.push(star);
}
const starsGeometry = new THREE.BufferGeometry();
starsGeometry.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(galaxyGeometryVertices, 3)
);
starsGeometry.setAttribute(
  "size",
  new THREE.Float32BufferAttribute(galaxyGeometrySizes, 1)
);
starsGeometry.setAttribute(
  "color",
  new THREE.Float32BufferAttribute(galaxyGeometryColors, 3)
);
const starsMaterial = new THREE.PointsMaterial({
  size: 2,
  vertexColors: true,
  transparent: true,
  opacity: 0.8,
  sizeAttenuation: false,
});
const galaxyPoints = new THREE.Points(starsGeometry, starsMaterial);
scene.add(galaxyPoints);

class Path {
  constructor(index, isStatue = false) {
    this.geometry = new THREE.BufferGeometry();
    this.material = isStatue
      ? statueMaterials[index % 2]
      : diskMaterials[index % 4];
    this.line = new THREE.Line(this.geometry, this.material);
    this.vertices = [];
    this.baseVertices = []; // HER ZAMAN heykelin LOCAL uzayında tutulur
    this.isStatue = isStatue;
    this.diskIndex = -1;
    this.forceDiskIndex = undefined;

    const currentSampler = isStatue ? statueSampler : sampler;
    if (currentSampler) {
      currentSampler.sample(tempPosition);
      this.previousPoint = tempPosition.clone();
    }
  }

  update() {
    const currentSampler = this.isStatue ? statueSampler : sampler;
    if (!currentSampler) return;

    if (this.baseVertices.length < (this.isStatue ? 30000 : 20000)) {  // Heykel için daha fazla nokta
      const pointsPerUpdate = this.isStatue ? 30 : 50;  // Daha hızlı dolum

      for (let j = 0; j < pointsPerUpdate; j++) {
        let pointFound = false;
        let attempts = 0;
        while (!pointFound && attempts < 100) {  // Daha fazla deneme
          attempts++;
          currentSampler.sample(tempPosition); // statue için: LOCAL koordinat

          if (!this.isStatue && this.forceDiskIndex !== undefined) {
            const yPos = tempPosition.y;
            let validForDisk = false;
            if (this.forceDiskIndex === 0 && yPos >= -1.75 && yPos <= -1.25)
              validForDisk = true;
            else if (
              this.forceDiskIndex === 1 &&
              yPos >= -1.25 &&
              yPos <= -0.75
            )
              validForDisk = true;
            else if (
              this.forceDiskIndex === 2 &&
              yPos >= -0.75 &&
              yPos <= -0.25
            )
              validForDisk = true;
            if (!validForDisk) continue;
          }

          const maxDistance = this.isStatue ? 0.15 : 0.4;  // Heykel için daha sık noktalar
          if (!this.previousPoint) this.previousPoint = tempPosition.clone();

          if (tempPosition.distanceTo(this.previousPoint) < maxDistance) {
            // LOCAL koordinatı sakla
            this.baseVertices.push(
              tempPosition.x,
              tempPosition.y,
              tempPosition.z
            );
            this.previousPoint = tempPosition.clone();

            if (!this.isStatue && this.forceDiskIndex !== undefined) {
              this.diskIndex = this.forceDiskIndex;
            } else if (!this.isStatue && this.diskIndex === -1) {
              if (tempPosition.y >= -1.75 && tempPosition.y <= -1.25)
                this.diskIndex = 0;
              else if (tempPosition.y >= -1.25 && tempPosition.y <= -0.75)
                this.diskIndex = 1;
              else if (tempPosition.y >= -0.75 && tempPosition.y <= -0.25)
                this.diskIndex = 2;
            }
            pointFound = true;
          }
        }
      }
    }
  }

  updatePositions() {
    if (this.baseVertices.length === 0) return;

    this.vertices = [];

    for (let i = 0; i < this.baseVertices.length; i += 3) {
      if (this.isStatue) {
        // LOCAL → WORLD: real3DStatue.position ekle
        const px =
          this.baseVertices[i] + (statueMeshRef ? statueMeshRef.position.x : 0);
        const py =
          this.baseVertices[i + 1] +
          (statueMeshRef ? statueMeshRef.position.y : 0);
        const pz =
          this.baseVertices[i + 2] +
          (statueMeshRef ? statueMeshRef.position.z : 0);
        this.vertices.push(px, py, pz);
      } else {
        // Disk katmanları hover offset
        let yOffset = 0;
        if (this.diskIndex === 1) yOffset = animationProgress * 0.5;
        else if (this.diskIndex === 2) yOffset = animationProgress * 1;

        this.vertices.push(
          this.baseVertices[i],
          this.baseVertices[i + 1] + yOffset,
          this.baseVertices[i + 2]
        );
      }
    }

    if (this.vertices.length > 0) {
      this.geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(this.vertices, 3)
      );
      this.geometry.computeBoundingSphere();
    }
  }
}

function updateDiskPositions() {
  animationProgress += (targetProgress - animationProgress) * animationSpeed;

  if (visibleDisks[1]) {
    const middleY = -1 + animationProgress * 0.5;
    visibleDisks[1].position.y = middleY;
  }
  if (visibleDisks[2]) {
    const topY = -0.5 + animationProgress * 1;
    visibleDisks[2].position.y = topY;

    // Heykeli disklerle birlikte kaldır (her zaman, reveal başlamış olsa bile)
    if (statueMeshRef) {
      statueMeshRef.position.y = -0.25 + animationProgress * 1;
    }
    if (real3DStatue) {
      real3DStatue.position.y = -0.25 + animationProgress * 1;
    }
  }
}

function createDisks() {
  // temizle
  visibleDisks.forEach((disk) => {
    group.remove(disk);
    disk.geometry.dispose();
    disk.material.dispose();
  });
  visibleDisks = [];
  paths = [];

  const diskConfigs = [
    { radius: 3, height: 0.5, y: -1.5 },
    { radius: 2.5, height: 0.5, y: -1 },
    { radius: 2, height: 0.5, y: -0.5 },
  ];

  const geometries = [];
  diskConfigs.forEach((config) => {
    const diskGeometry = new THREE.CylinderGeometry(
      config.radius,
      config.radius,
      config.height,
      32,
      1,
      false
    );
    diskGeometry.translate(0, config.y, 0);
    geometries.push(diskGeometry);

    const visibleMaterial = new THREE.MeshBasicMaterial({
      color: 0x444444,
      wireframe: true,
      transparent: true,
      opacity: 0.2,
    });
    const visibleDiskGeometry = new THREE.CylinderGeometry(
      config.radius,
      config.radius,
      config.height,
      32,
      1,
      false
    );
    const visibleDisk = new THREE.Mesh(visibleDiskGeometry, visibleMaterial);
    visibleDisk.position.y = config.y;
    group.add(visibleDisk);
    visibleDisks.push(visibleDisk);
  });

  // tekleştir (sampler için görünmeyen kafes)
  const mergedGeometry = new THREE.BufferGeometry();
  const positions = [];
  const normals = [];
  const indices = [];
  let vertexOffset = 0;

  geometries.forEach((geo) => {
    const pos = geo.attributes.position;
    const norm = geo.attributes.normal;
    const index = geo.index;

    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
    }
    for (let i = 0; i < index.count; i++) {
      indices.push(index.getX(i) + vertexOffset);
    }
    vertexOffset += pos.count;
  });

  mergedGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  mergedGeometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(normals, 3)
  );
  mergedGeometry.setIndex(indices);

  const material = new THREE.MeshBasicMaterial({
    color: 0x333333,
    wireframe: true,
    visible: false,
  });
  const diskMesh = new THREE.Mesh(mergedGeometry, material);
  scene.add(diskMesh);

  sampler = new MeshSurfaceSampler(diskMesh).build();

  for (let i = 0; i < 24; i++) {
    const path = new Path(i, false);
    if (i < 8) path.forceDiskIndex = 0;
    else if (i < 16) path.forceDiskIndex = 1;
    else path.forceDiskIndex = 2;
    paths.push(path);
    group.add(path.line);
  }
}

function createStatue() {
  const gltfLoader = new GLTFLoader();

  gltfLoader.load(
    "./prometheus_0.1.glb",
    (gltf) => {
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) child.visible = false;
      });
      processStatueModel(gltf.scene, 1.5);
    },
    undefined,
    () => {
      const objLoader = new OBJLoader();
      objLoader.load(
        "./David.obj",
        (obj) => processStatueModel(obj, 4),
        undefined,
        (error) => {
          console.error("Error loading statue:", error);
          createFallbackStatue();
        }
      );
    }
  );
}

function processStatueModel(model, scale) {
  model.scale.set(scale, scale, scale);
  model.updateMatrixWorld(true);

  // Load PBR textures from Polyhaven (Painted Plaster Wall)
  const textureLoader = new THREE.TextureLoader();

  // 1. Diffuse/Color map
  textureLoader.load(
    "https://dl.polyhaven.org/file/ph-assets/Textures/png/4k/painted_plaster_wall/painted_plaster_wall_diff_4k.png",
    (texture) => {
      marbleTexture = texture;
      marbleTexture.colorSpace = THREE.SRGBColorSpace; // sRGB renk uzayı
      marbleTexture.wrapS = THREE.RepeatWrapping;
      marbleTexture.wrapT = THREE.RepeatWrapping;
      marbleTexture.repeat.set(3, 3); // Scale for statue
      console.log('Painted plaster diffuse texture loaded from Polyhaven');
    },
    undefined,
    () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext("2d");
      const gradient = ctx.createLinearGradient(0, 0, 1024, 1024);
      gradient.addColorStop(0, "#FAFAFA");
      gradient.addColorStop(0.5, "#F0F0F0");
      gradient.addColorStop(1, "#E8E8E8");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1024, 1024);
      ctx.globalAlpha = 0.3;
      for (let i = 0; i < 30; i++) {
        ctx.strokeStyle = i % 3 === 0 ? "#D0D0D0" : "#C8C8C8";
        ctx.lineWidth = Math.random() * 3 + 1;
        ctx.beginPath();
        ctx.moveTo(Math.random() * 1024, 0);
        ctx.bezierCurveTo(
          Math.random() * 1024,
          Math.random() * 1024,
          Math.random() * 1024,
          Math.random() * 1024,
          Math.random() * 1024,
          1024
        );
        ctx.stroke();
      }
      ctx.globalAlpha = 1.0;
      marbleTexture = new THREE.CanvasTexture(canvas);
      marbleTexture.wrapS = THREE.RepeatWrapping;
      marbleTexture.wrapT = THREE.RepeatWrapping;
    }
  );

  // 2. Normal map GL (for surface details)
  textureLoader.load(
    "https://dl.polyhaven.org/file/ph-assets/Textures/png/4k/painted_plaster_wall/painted_plaster_wall_nor_gl_4k.png",
    (texture) => {
      marbleNormalMap = texture;
      marbleNormalMap.wrapS = THREE.RepeatWrapping;
      marbleNormalMap.wrapT = THREE.RepeatWrapping;
      marbleNormalMap.repeat.set(3, 3);
      console.log('Painted plaster normal map (GL) loaded from Polyhaven');
    },
    undefined,
    () => {
      console.log('Normal map could not be loaded');
    }
  );

  // 3. Ambient Occlusion map
  textureLoader.load(
    "https://dl.polyhaven.org/file/ph-assets/Textures/png/4k/painted_plaster_wall/painted_plaster_wall_ao_4k.png",
    (texture) => {
      marbleAOMap = texture;
      marbleAOMap.wrapS = THREE.RepeatWrapping;
      marbleAOMap.wrapT = THREE.RepeatWrapping;
      marbleAOMap.repeat.set(3, 3);
      console.log('Painted plaster AO map loaded from Polyhaven');
    },
    undefined,
    () => {
      console.log('AO map could not be loaded');
    }
  );

  // 4. Roughness map
  textureLoader.load(
    "https://dl.polyhaven.org/file/ph-assets/Textures/png/4k/painted_plaster_wall/painted_plaster_wall_rough_4k.png",
    (texture) => {
      marbleRoughnessMap = texture;
      marbleRoughnessMap.wrapS = THREE.RepeatWrapping;
      marbleRoughnessMap.wrapT = THREE.RepeatWrapping;
      marbleRoughnessMap.repeat.set(3, 3);
      console.log('Painted plaster roughness map loaded from Polyhaven');
    },
    undefined,
    () => {
      console.log('Roughness map could not be loaded');
    }
  );

  // Merge to single geometry in WORLD space
  const meshes = [];
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });
  if (meshes.length === 0) return createFallbackStatue();

  const mergedGeometry = new THREE.BufferGeometry();
  const positions = [];
  const normals = [];
  const uvs = []; // UV koordinatları için
  const indices = [];
  let vertexOffset = 0;

  const tempPos = new THREE.Vector3();
  const tempNorm = new THREE.Vector3();

  meshes.forEach((mesh) => {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const norm = geo.attributes.normal || {
      getX: () => 0,
      getY: () => 1,
      getZ: () => 0,
    };
    const index = geo.index;

    const uv = geo.attributes.uv; // UV attribute ekle

    for (let i = 0; i < pos.count; i++) {
      tempPos
        .set(pos.getX(i), pos.getY(i), pos.getZ(i))
        .applyMatrix4(mesh.matrixWorld);
      positions.push(tempPos.x, tempPos.y, tempPos.z);

      if (norm.getX) tempNorm.set(norm.getX(i), norm.getY(i), norm.getZ(i));
      else tempNorm.set(0, 1, 0);
      tempNorm.transformDirection(mesh.matrixWorld).normalize();
      normals.push(tempNorm.x, tempNorm.y, tempNorm.z);

      // UV koordinatlarını kopyala veya procedural oluştur
      if (uv) {
        uvs.push(uv.getX(i), uv.getY(i));
      } else {
        // Basit planar projeksiyon
        const u = (tempPos.x * 0.1 + 0.5) % 1;
        const v = (tempPos.z * 0.1 + 0.5) % 1;
        uvs.push(u, v);
      }
    }

    if (index) {
      for (let i = 0; i < index.count; i++)
        indices.push(index.getX(i) + vertexOffset);
    } else {
      for (let i = 0; i < pos.count; i += 3)
        indices.push(
          i + vertexOffset,
          i + 1 + vertexOffset,
          i + 2 + vertexOffset
        );
    }
    vertexOffset += pos.count;
  });

  mergedGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  mergedGeometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(normals, 3)
  );
  mergedGeometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(uvs, 2)
  );
  mergedGeometry.setIndex(indices);
  mergedGeometry.computeBoundingBox();

  const box = mergedGeometry.boundingBox;
  const center = box.getCenter(new THREE.Vector3());

  // Material - MeshStandardMaterial with PBR support for plaster
  const statueMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: null,              // Diffuse texture
    normalMap: null,        // Normal map for details
    normalScale: new THREE.Vector2(0.8, 0.8), // Normal intensity
    aoMap: null,            // Ambient occlusion
    aoMapIntensity: 0.6,    // AO intensity
    roughnessMap: null,     // Roughness texture
    roughness: 0.7,         // Default roughness for plaster
    metalness: 0.0,         // Plaster is non-metallic
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
  });

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.position.set(5, 10, 5);
  scene.add(directionalLight);
  const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
  directionalLight2.position.set(-5, 5, -5);
  scene.add(directionalLight2);

  // White statue mesh (center to origin)
  real3DStatue = new THREE.Mesh(mergedGeometry, statueMaterial);
  real3DStatue.position.set(-center.x, -0.25, -center.z);
  real3DStatue.visible = false;
  real3DStatue.renderOrder = 0;
  scene.add(real3DStatue);

  real3DStatue.userData.material = statueMaterial;
  real3DStatue.userData.boundingBox = box;
  real3DStatue.userData.center = center;
  statueMeshRef = real3DStatue;

  // Sampler for statue (LOCAL uzayda çalışır; world offset’i biz ekleyeceğiz)
  const samplerMesh = new THREE.Mesh(mergedGeometry.clone());
  samplerMesh.position.copy(real3DStatue.position);
  statueSampler = new MeshSurfaceSampler(samplerMesh).build();

  // Yellow line paths - daha fazla path ile boşlukları doldur
  statuePaths = [];
  for (let i = 0; i < 20; i++) {  // 12'den 20'ye çıkardık
    const path = new Path(i, true);
    // depthTest = true kalsın; hizalamayı gözle doğru görürüz
    statuePaths.push(path);
    group.add(path.line);
  }
}

function createFallbackStatue() {
  const fallbackGeometry = new THREE.ConeGeometry(1.2, 3.5, 8);
  fallbackGeometry.computeBoundingBox();

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 350);
  gradient.addColorStop(0, "#FEFEFE");
  gradient.addColorStop(0.5, "#F0F0F0");
  gradient.addColorStop(1, "#E0E0E0");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);
  marbleTexture = new THREE.CanvasTexture(canvas);

  const fallbackMaterial = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    map: marbleTexture,
    emissive: 0x101010,
    specular: 0x222222,
    shininess: 100,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
  });

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.position.set(5, 10, 5);
  scene.add(directionalLight);

  real3DStatue = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
  real3DStatue.position.set(0, -0.5, 0);
  real3DStatue.visible = false;
  real3DStatue.renderOrder = 0;
  scene.add(real3DStatue);

  real3DStatue.userData.material = fallbackMaterial;
  real3DStatue.userData.boundingBox = fallbackGeometry.boundingBox;
  statueMeshRef = real3DStatue;

  const samplerMesh = new THREE.Mesh(fallbackGeometry.clone());
  samplerMesh.position.copy(real3DStatue.position);
  statueSampler = new MeshSurfaceSampler(samplerMesh).build();

  statuePaths = [];
  for (let i = 0; i < 20; i++) {  // Daha fazla path
    const path = new Path(i, true);
    statuePaths.push(path);
    group.add(path.line);
  }
}

function onMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(visibleDisks);
  targetProgress = intersects.length > 0 ? 1 : 0;
}
window.addEventListener("mousemove", onMouseMove, false);

function render() {
  controls.update();

  if (!startTime) startTime = Date.now();

  updateDiskPositions();

  paths.forEach((path) => {
    path.update();
    path.updatePositions();
  });

  statuePaths.forEach((path) => {
    if (!modelRevealStarted) {
      path.update();
      path.updatePositions();
    }
  });

  // REVEAL START
  const elapsedTime = Date.now() - startTime;
  if (elapsedTime >= modelRevealDelay && !modelRevealStarted && real3DStatue) {
    modelRevealStarted = true;

    // Hover'u dondurma, devam etsin
    // targetProgress = animationProgress;

    // Apply all PBR textures
    if (marbleTexture) {
      real3DStatue.userData.material.map = marbleTexture;
      real3DStatue.userData.material.color = new THREE.Color(0xffffff);
      console.log('Diffuse texture applied');
    } else {
      real3DStatue.userData.material.color = new THREE.Color(0xe0e0e0);
      console.log('Using fallback color');
    }

    // Normal map for surface detail
    if (marbleNormalMap) {
      real3DStatue.userData.material.normalMap = marbleNormalMap;
      real3DStatue.userData.material.normalScale = new THREE.Vector2(0.8, 0.8);
      console.log('Normal map applied to statue');
    }

    // Ambient Occlusion map for depth
    if (marbleAOMap) {
      real3DStatue.userData.material.aoMap = marbleAOMap;
      real3DStatue.userData.material.aoMapIntensity = 0.6;
      // AO map requires second UV set
      real3DStatue.geometry.setAttribute('uv2', real3DStatue.geometry.attributes.uv);
      console.log('AO map applied to statue');
    }

    // Roughness map for surface variation
    if (marbleRoughnessMap) {
      real3DStatue.userData.material.roughnessMap = marbleRoughnessMap;
      real3DStatue.userData.material.roughness = 1.0; // Let map control
      console.log('Roughness map applied to statue');
    }

    real3DStatue.userData.material.needsUpdate = true;
    real3DStatue.visible = true;
    real3DStatue.userData.material.opacity = 0;

    // CLIPPING SETUP – alttan üste doğru GÖSTER
    const modelClippingPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    real3DStatue.userData.material.clippingPlanes = [modelClippingPlane];
    real3DStatue.userData.clippingPlane = modelClippingPlane;

    const box = real3DStatue.userData.boundingBox;
    const worldY = real3DStatue.position.y;  // Bu pozisyon hover ile değişecek

    real3DStatue.userData.clipMin = worldY + box.min.y;
    real3DStatue.userData.clipMax = worldY + box.max.y;

    // Sarı çizgiler aynı dünya sınırlarını kullanacak
    real3DStatue.userData.yellowMin = real3DStatue.userData.clipMin;
    real3DStatue.userData.yellowMax = real3DStatue.userData.clipMax;

    // Başlangıç: alttan
    modelClippingPlane.constant = real3DStatue.userData.clipMin;
  }

  // REVEAL ANIMATION
  if (modelRevealStarted && real3DStatue) {
    modelRevealProgress = Math.min(1, modelRevealProgress + 0.004);

    // Hover'dan dolayı değişen pozisyonu güncelle
    const box = real3DStatue.userData.boundingBox;
    const currentWorldY = real3DStatue.position.y;
    real3DStatue.userData.clipMin = currentWorldY + box.min.y;
    real3DStatue.userData.clipMax = currentWorldY + box.max.y;

    // White statue – clipping'i alttan üste ilerlet
    if (real3DStatue.userData.clippingPlane) {
      const currentClipY =
        real3DStatue.userData.clipMin +
        (real3DStatue.userData.clipMax - real3DStatue.userData.clipMin) *
          modelRevealProgress;

      // n=(0,-1,0) → y > constant kesilir, y <= constant görünür
      real3DStatue.userData.clippingPlane.constant = currentClipY;
    }
    real3DStatue.userData.material.opacity = Math.min(1, modelRevealProgress);

    // Yellow lines – dünya koordinatında kes (aşağıdan yukarı kaybol)
    const cutoffY =
      real3DStatue.userData.yellowMin +
      (real3DStatue.userData.yellowMax - real3DStatue.userData.yellowMin) *
        modelRevealProgress;

    statuePaths.forEach((path) => {
      // WORLD koordinat hesapla ve cutoff üstünü göster
      const visibleVertices = [];
      const sx = statueMeshRef ? statueMeshRef.position.x : 0;
      const sy = statueMeshRef ? statueMeshRef.position.y : 0;
      const sz = statueMeshRef ? statueMeshRef.position.z : 0;

      for (let i = 0; i < path.baseVertices.length; i += 3) {
        const vx = path.baseVertices[i] + sx;
        const vy = path.baseVertices[i + 1] + sy;
        const vz = path.baseVertices[i + 2] + sz;

        if (vy > cutoffY) {
          visibleVertices.push(vx, vy, vz);
        }
      }

      if (visibleVertices.length > 6) {
        path.geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(visibleVertices, 3)
        );
        path.geometry.computeBoundingSphere();
        path.line.visible = true;
        // Opacity'yi değiştirme, başlangıç değerini koru
        // path.material.opacity = 0.6;
      } else {
        path.line.visible = false;
      }
    });

    if (modelRevealProgress >= 1) {
      real3DStatue.userData.material.clippingPlanes = [];
      real3DStatue.userData.material.opacity = 1;
      statuePaths.forEach((path) => {
        path.line.visible = false;
        if (path.geometry) path.geometry.dispose();
      });
    }
  }

  // Galaxy animate
  const tempStarsArray = [];
  stars.forEach((s) => {
    s.update();
    tempStarsArray.push(s.x, s.y, s.z);
  });
  starsGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(tempStarsArray, 3)
  );

  composer.render();
}

window.addEventListener("resize", onWindowResize, false);
function onWindowResize() {
  camera.aspect = elContent.offsetWidth / elContent.offsetHeight;
  camera.updateProjectionMatrix();
  composer.setSize(elContent.offsetWidth, elContent.offsetHeight);
  renderer.setSize(elContent.offsetWidth, elContent.offsetHeight);
  bloomPass.setSize(elContent.offsetWidth, elContent.offsetHeight);
}

// Init
createDisks();
setTimeout(() => {
  createStatue();
}, 2000);
renderer.setAnimationLoop(render);
