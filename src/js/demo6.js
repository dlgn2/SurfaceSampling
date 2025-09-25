import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
// createDotTexture not needed without sparkles

const elContent = document.querySelector('.content');
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

const renderer = new THREE.WebGLRenderer();
renderer.setPixelRatio(pixelRatio);
renderer.setSize(elContent.offsetWidth, elContent.offsetHeight);
elContent.appendChild(renderer.domElement);

// Add OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.minDistance = 5;
controls.maxDistance = 100;
controls.maxPolarAngle = Math.PI;

// Post-processing setup
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

// Hover animation variables
let isHovering = false;
let animationProgress = 0;
let targetProgress = 0;
const animationSpeed = 0.05;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();

// Disk variables
let visibleDisks = [];
let diskMeshes = [];
let samplers = [];
let sampler = null;
let statueSampler = null;
let statueMeshRef = null;
let paths = [];
let statuePaths = [];

const tempPosition = new THREE.Vector3();
const diskMaterials = [
  new THREE.LineBasicMaterial({color: 0x125D98, transparent: true, opacity: 0.5, linewidth: 2}),
  new THREE.LineBasicMaterial({color: 0xCFD6DE, transparent: true, opacity: 0.5, linewidth: 2}),
  new THREE.LineBasicMaterial({color: 0x4169E1, transparent: true, opacity: 0.5, linewidth: 2}),
  new THREE.LineBasicMaterial({color: 0x0000CD, transparent: true, opacity: 0.5, linewidth: 2})
];

const statueMaterials = [
  new THREE.LineBasicMaterial({color: 0xFFD700, transparent: true, opacity: 0.6, linewidth: 2}),
  new THREE.LineBasicMaterial({color: 0xFFA500, transparent: true, opacity: 0.6, linewidth: 2})
];

// Sparkles removed - only lines for demo6

// Galaxy background colors only
let galaxyColors = [
  new THREE.Color("#f9fbf2"),
  new THREE.Color("#ffede1"),
  new THREE.Color("#05c7f2"),
  new THREE.Color("#0597f2"),
  new THREE.Color("#0476d9")
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

// Create galaxy background
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
// Create material for stars
const starsMaterial = new THREE.PointsMaterial({
  size: 2,
  color: 0xffffff,
  transparent: true,
  opacity: 0.8,
  sizeAttenuation: false
});
const galaxyPoints = new THREE.Points(starsGeometry, starsMaterial);
scene.add(galaxyPoints);

class Path {
  constructor(index, isStatue = false) {
    this.geometry = new THREE.BufferGeometry();
    this.material = isStatue ? statueMaterials[index % 2] : diskMaterials[index % 4];
    this.line = new THREE.Line(this.geometry, this.material);
    this.vertices = [];
    this.baseVertices = []; // Store base positions without offset
    this.isStatue = isStatue;

    // Clear disk assignment
    this.diskIndex = -1;
    this.forceDiskIndex = undefined; // Will be set after creation if needed

    const currentSampler = isStatue ? statueSampler : sampler;
    if (currentSampler) {
      currentSampler.sample(tempPosition);
      this.previousPoint = tempPosition.clone();
    }
  }

  update() {
    const currentSampler = this.isStatue ? statueSampler : sampler;
    if (!currentSampler) return;

    // Only add new points if we haven't reached the limit
    if (this.baseVertices.length < 10000) {
      const pointsPerUpdate = this.isStatue ? 15 : 50; // Çok daha hızlı dolum

      for (let j = 0; j < pointsPerUpdate; j++) {
        let pointFound = false;
        let attempts = 0;
        while (!pointFound && attempts < 50) { // Daha fazla deneme
          attempts++;
          currentSampler.sample(tempPosition);

          // If we have a forced disk index, only accept points from that disk
          if (!this.isStatue && this.forceDiskIndex !== undefined) {
            const yPos = tempPosition.y;
            let validForDisk = false;

            if (this.forceDiskIndex === 0 && yPos >= -1.75 && yPos <= -1.25) {
              validForDisk = true; // Bottom disk range
            } else if (this.forceDiskIndex === 1 && yPos >= -1.25 && yPos <= -0.75) {
              validForDisk = true; // Middle disk range
            } else if (this.forceDiskIndex === 2 && yPos >= -0.75 && yPos <= -0.25) {
              validForDisk = true; // Top disk range
            }

            if (!validForDisk) continue; // Skip this point, sample another
          }

          // Daha büyük mesafe ile daha hızlı dolum
          const maxDistance = this.isStatue ? 0.3 : 0.4; // Daha büyük çizgiler
          if (tempPosition.distanceTo(this.previousPoint) < maxDistance) {
            // Store base position without offset
            this.baseVertices.push(tempPosition.x, tempPosition.y, tempPosition.z);
            this.previousPoint = tempPosition.clone();

            // Set disk index if forced
            if (!this.isStatue && this.forceDiskIndex !== undefined) {
              this.diskIndex = this.forceDiskIndex;
            } else if (!this.isStatue && this.diskIndex === -1) {
              // Auto-detect disk if not set yet
              if (tempPosition.y >= -1.75 && tempPosition.y <= -1.25) {
                this.diskIndex = 0; // Bottom disk
              } else if (tempPosition.y >= -1.25 && tempPosition.y <= -0.75) {
                this.diskIndex = 1; // Middle disk
              } else if (tempPosition.y >= -0.75 && tempPosition.y <= -0.25) {
                this.diskIndex = 2; // Top disk
              }
            }

            // No sparkles - only lines
            pointFound = true;
          }
        }
      }
    }
  }

  updatePositions() {
    // Apply animation offset to all vertices - this runs every frame
    if (this.baseVertices.length === 0) return;

    this.vertices = [];
    for (let i = 0; i < this.baseVertices.length; i += 3) {
      let yOffset = 0;

      if (this.isStatue) {
        yOffset = animationProgress * 1; // Follow top disk
      } else if (this.diskIndex === 0) {
        yOffset = 0; // Bottom disk doesn't move
      } else if (this.diskIndex === 1) {
        yOffset = animationProgress * 0.5; // Middle disk moves up 0.5
      } else if (this.diskIndex === 2) {
        yOffset = animationProgress * 1; // Top disk moves up 1.0
      }

      this.vertices.push(
        this.baseVertices[i],
        this.baseVertices[i + 1] + yOffset,
        this.baseVertices[i + 2]
      );
    }

    if (this.vertices.length > 0) {
      this.geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.vertices, 3));
      this.geometry.computeBoundingSphere();
    }
  }
}

// Sparkles removed - no update function needed

function updateDiskPositions() {
  // Smooth animation transition
  animationProgress += (targetProgress - animationProgress) * animationSpeed;

  // Bottom disk stays at -1.5 (no movement)
  // visibleDisks[0] doesn't move

  // Update middle disk from -1.0 to -0.5 (moves up 0.5)
  if (visibleDisks[1]) {
    const middleY = -1 + (animationProgress * 0.5);
    visibleDisks[1].position.y = middleY;
  }

  // Update top disk from -0.5 to 0.5 (moves up 1.0)
  if (visibleDisks[2]) {
    const topY = -0.5 + (animationProgress * 1);
    visibleDisks[2].position.y = topY;

    // Update statue position to follow top disk
    if (statueMeshRef) {
      statueMeshRef.position.y = topY + 0.25;
    }
  }
}

// Create disks with hover animation capability
function createDisks() {
  // Clear any existing visible disks
  visibleDisks.forEach(disk => {
    group.remove(disk);
    disk.geometry.dispose();
    disk.material.dispose();
  });
  visibleDisks = [];
  diskMeshes = [];
  samplers = [];

  // Disk configurations (matching demo5)
  const diskConfigs = [
    { radius: 3, height: 0.5, y: -1.5 },    // Bottom disk
    { radius: 2.5, height: 0.5, y: -1 },    // Middle disk
    { radius: 2, height: 0.5, y: -0.5 }     // Top disk
  ];

  const geometries = [];

  diskConfigs.forEach((config, index) => {
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

    // Create visible disk mesh
    const visibleMaterial = new THREE.MeshBasicMaterial({
      color: 0x444444,
      wireframe: true,
      transparent: true,
      opacity: 0.2
    });
    const visibleDiskGeometry = new THREE.CylinderGeometry(
      config.radius,
      config.radius,
      config.height,
      32, 1, false
    );
    const visibleDisk = new THREE.Mesh(visibleDiskGeometry, visibleMaterial);
    visibleDisk.position.y = config.y;
    group.add(visibleDisk);
    visibleDisks.push(visibleDisk);
  });

  // Merge all disk geometries for sampling
  const mergedGeometry = new THREE.BufferGeometry();
  const positions = [];
  const normals = [];
  const indices = [];
  let vertexOffset = 0;

  geometries.forEach(geo => {
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

  mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  mergedGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  mergedGeometry.setIndex(indices);

  // Create invisible mesh for sampling
  const material = new THREE.MeshBasicMaterial({
    color: 0x333333,
    wireframe: true,
    visible: false
  });
  const diskMesh = new THREE.Mesh(mergedGeometry, material);
  scene.add(diskMesh);

  // Create sampler
  sampler = new MeshSurfaceSampler(diskMesh).build();

  // Create paths for disk sampling - her disk için eşit dağıtılmış path'ler
  for (let i = 0; i < 24; i++) {
    const path = new Path(i);
    // Force disk assignment based on index for better distribution
    if (i < 8) path.forceDiskIndex = 0;      // First 8 paths -> bottom disk
    else if (i < 16) path.forceDiskIndex = 1; // Next 8 paths -> middle disk
    else path.forceDiskIndex = 2;             // Last 8 paths -> top disk
    paths.push(path);
    group.add(path.line);
  }
}

// Create statue - supports both OBJ and GLB formats
function createStatue() {
  // Check if GLB file exists first, fallback to OBJ
  const gltfLoader = new GLTFLoader();

  // Load Prometheus GLB
  gltfLoader.load(
    '/prometheus_0.1.glb',
    (gltf) => {
      console.log('Prometheus GLB loaded successfully');
      // Hide original model if it has meshes
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.visible = false;
        }
      });
      processStatueModel(gltf.scene, 1.5); // Daha küçük scale
    },
    (xhr) => {
      console.log((xhr.loaded / xhr.total * 100) + '% loaded');
    },
    (error) => {
      console.log('Prometheus GLB not found, trying David.obj as fallback...');
      // Fallback to OBJ
      const objLoader = new OBJLoader();
      objLoader.load(
        '/David.obj',
        (obj) => {
          console.log('David OBJ loaded as fallback');
          processStatueModel(obj, 4);
        },
        (xhr) => {
          console.log((xhr.loaded / xhr.total * 100) + '% loaded');
        },
        (error) => {
          console.error('Error loading statue:', error);
          createFallbackStatue();
        }
      );
    }
  );
}

function processStatueModel(model, scale) {
  // Apply scale
  model.scale.set(scale, scale, scale);
  model.updateMatrixWorld(true);

  // Collect all meshes
  const meshes = [];
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshes.push(child);
    }
  });

  if (meshes.length === 0) {
    console.error('No meshes found in model');
    createFallbackStatue();
    return;
  }

  // Merge all geometries for sampling
  const mergedGeometry = new THREE.BufferGeometry();
  const positions = [];
  const normals = [];
  const indices = [];
  let vertexOffset = 0;

  meshes.forEach(mesh => {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const norm = geo.attributes.normal || { getX: () => 0, getY: () => 1, getZ: () => 0 };
    const index = geo.index;

    const tempPos = new THREE.Vector3();
    const tempNorm = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      tempPos.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      tempPos.applyMatrix4(mesh.matrixWorld);
      positions.push(tempPos.x, tempPos.y, tempPos.z);

      if (norm.getX) {
        tempNorm.set(norm.getX(i), norm.getY(i), norm.getZ(i));
      } else {
        tempNorm.set(0, 1, 0);
      }
      tempNorm.transformDirection(mesh.matrixWorld).normalize();
      normals.push(tempNorm.x, tempNorm.y, tempNorm.z);
    }

    if (index) {
      for (let i = 0; i < index.count; i++) {
        indices.push(index.getX(i) + vertexOffset);
      }
    } else {
      for (let i = 0; i < pos.count; i += 3) {
        indices.push(i + vertexOffset, i + 1 + vertexOffset, i + 2 + vertexOffset);
      }
    }
    vertexOffset += pos.count;
  });

  mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  mergedGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  mergedGeometry.setIndex(indices);

  // Calculate bounding box
  mergedGeometry.computeBoundingBox();
  const box = mergedGeometry.boundingBox;
  const center = box.getCenter(new THREE.Vector3());

  // Create visible statue mesh (hide it - we only want the lines)
  const statueMaterial = new THREE.MeshPhongMaterial({
    color: 0xFF0000,
    wireframe: true,
    transparent: false,
    opacity: 1.0
  });

  const statueMesh = new THREE.Mesh(mergedGeometry, statueMaterial);
  const boxCenter = box.getCenter(new THREE.Vector3());
  statueMesh.position.set(
    -boxCenter.x,
    -0.5,
    -boxCenter.z
  );
  statueMesh.visible = false; // Hide the wireframe mesh
  scene.add(statueMesh);
  statueMeshRef = statueMesh;

  // Create sampler mesh
  const samplerMesh = new THREE.Mesh(mergedGeometry.clone());
  samplerMesh.position.set(
    -boxCenter.x,
    -0.5,
    -boxCenter.z
  );
  statueSampler = new MeshSurfaceSampler(samplerMesh).build();

  // Create paths for statue sampling
  for (let i = 0; i < 12; i++) { // 12 path yeterli
    const path = new Path(i, true);
    statuePaths.push(path);
    group.add(path.line); // Add to group instead of scene
  }

  console.log('Statue sampler created!');
}

function createFallbackStatue() {
  console.log('Creating fallback statue...');

  const fallbackGeometry = new THREE.BoxGeometry(5, 15, 5);
  const fallbackMaterial = new THREE.MeshBasicMaterial({
    color: 0xFF0000,
    wireframe: true
  });
  const fallbackStatue = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
  fallbackStatue.position.set(0, -0.5, 0);
  scene.add(fallbackStatue);
  statueMeshRef = fallbackStatue;
}

// Mouse event handler for hover effect
function onMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Check intersections with visible disks
  const intersects = raycaster.intersectObjects(visibleDisks);

  if (intersects.length > 0) {
    isHovering = true;
    targetProgress = 1; // Animate to expanded position
  } else {
    isHovering = false;
    targetProgress = 0; // Animate back to original position
  }
}

window.addEventListener('mousemove', onMouseMove, false);

function render(a) {
  controls.update();

  // Update disk animation
  updateDiskPositions();

  // Update disk paths - hızlı dolum
  paths.forEach(path => {
    if (path.baseVertices.length < 20000) { // Makul bir limit
      path.update();
    }
    // Her frame'de pozisyonları güncelle - hover animasyonu için kritik
    path.updatePositions();
  });

  // Update statue paths - disklerle birlikte başlayabilir
  statuePaths.forEach(path => {
    if (path.baseVertices.length < 15000) {
      path.update();
    }
    // Her frame'de pozisyonları güncelle - hover animasyonu için kritik
    path.updatePositions();
  });

  // No sparkles to update - only lines

  // Update stars
  let tempStarsArray = [];
  stars.forEach((s) => {
    s.update();
    tempStarsArray.push(s.x, s.y, s.z);
  });
  starsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(tempStarsArray, 3));

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

// Initialize
createDisks();

// Load statue after 2 seconds
setTimeout(() => {
  createStatue();
}, 2000);

// Start render loop
renderer.setAnimationLoop(render);