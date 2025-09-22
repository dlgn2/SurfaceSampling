import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { createDotTexture } from './createDotTexture.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';

const elContent = document.querySelector('.content');
const pixelRatio = 2;

// Control variables
let drawSpeed = 1;
let dotsPerCycle = 10;
let diskSpeedFrames = 120; // 2 seconds at 60fps
let maxLineCount = 12;
let pointDistance = 0.35;
let isPaused = false;
let showDisks = true;
let baseSparkleLimit = 20000; // Base limit for one disk
let sparklesPerDisk = 15000; // Additional sparkles per disk

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

const renderScene = new RenderPass(scene, camera);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(elContent.offsetWidth, elContent.offsetHeight),
  1.5,
  0.4,
  0.85
);
bloomPass.threshold = 0;
bloomPass.strength = 1.2;

const composer = new EffectComposer(renderer);
composer.setPixelRatio(pixelRatio);
composer.addPass(renderScene);
composer.addPass(bloomPass);


const group = new THREE.Group();
scene.add(group);

const sparkles = [];
const sparklesGeometry = new THREE.BufferGeometry();
const sparklesMaterial = new THREE.ShaderMaterial({
  uniforms: {
    pointTexture: {
      value: new THREE.CanvasTexture(createDotTexture())
    }
  },
  vertexShader: document.getElementById("vertexshader").textContent,
  fragmentShader: document.getElementById("fragmentshader").textContent,
  blending: THREE.AdditiveBlending,
  alphaTest: 1.0,
  transparent: true
});
const points = new THREE.Points(sparklesGeometry, sparklesMaterial);
group.add(points);

let sampler = null;
const lines = [];
let linesMaterials = [
  new THREE.LineBasicMaterial({ transparent: true, color: 0x125D98 }),
  new THREE.LineBasicMaterial({ transparent: true, color: 0xCFD6DE })
];
let galaxyColors = [
  new THREE.Color("#f9fbf2"),
  new THREE.Color("#ffede1"),
  new THREE.Color("#05c7f2"),
  new THREE.Color("#0597f2"),
  new THREE.Color("#0476d9")
];
function dots(isInitial = false, skipSamplerUpdate = false) {
  if (!skipSamplerUpdate) {
    sampler = new MeshSurfaceSampler(whale).build();
    console.log('Sampler updated. Whale geometry vertices:', whale.geometry.attributes.position.count);
  }

  if (isInitial) {
    // Only clear lines on initial creation or reset
    lines.forEach(line => {
      group.remove(line);
      line.geometry.dispose();
    });
    lines.length = 0;

    for (let i = 0; i < maxLineCount; i++) {
      const linesMesh = new THREE.Line(new THREE.BufferGeometry(), linesMaterials[i % 2]);
      linesMesh.coordinates = [];
      linesMesh.previous = null;
      linesMesh.samplerIndex = i; // Add index for sampler assignment
      linesMesh.assignedSampler = null;
      lines.push(linesMesh);
      group.add(linesMesh);
    }
    requestAnimationFrame(render);
  }
  // If not initial, lines continue with the new sampler
}

let whale = null;
let currentDiskIndex = 0;
let diskGeometries = [];
let diskAddCounter = 0;
let visibleDisks = []; // Array to hold visible disk meshes
let diskMeshes = []; // Array to hold individual disk meshes for sampling
let samplers = []; // Array to hold samplers for each disk

function createWhale() {
  // Clear any existing visible disks
  visibleDisks.forEach(disk => {
    group.remove(disk);
    disk.geometry.dispose();
    disk.material.dispose();
  });
  visibleDisks = [];
  diskMeshes = [];
  samplers = [];

  // Start with just the bottom disk
  const bottomDisk = new THREE.CylinderGeometry(3, 3, 0.5, 32, 1, false);
  bottomDisk.translate(0, -1.5, 0);

  const material = new THREE.MeshBasicMaterial({ color: 0x333333, wireframe: true });
  whale = new THREE.Mesh(bottomDisk, material);
  whale.visible = false;
  scene.add(whale);

  // Create mesh for sampling
  const diskMesh = new THREE.Mesh(bottomDisk.clone());
  diskMeshes.push(diskMesh);

  // Create sampler for this disk
  const diskSampler = new MeshSurfaceSampler(diskMesh).build();
  samplers.push(diskSampler);

  // Also add visible version for display
  const visibleMaterial = new THREE.MeshBasicMaterial({
    color: 0x444444,
    wireframe: true,
    transparent: true,
    opacity: 0.2
  });
  const visibleDisk = new THREE.Mesh(bottomDisk.clone(), visibleMaterial);
  visibleDisk.visible = showDisks;
  group.add(visibleDisk);
  visibleDisks.push(visibleDisk);

  // Store configurations for additional disks to add later
  diskGeometries = [
    { radius: 3, height: 0.5, y: -1.5 },    // Bottom (already added)
    { radius: 2.5, height: 0.5, y: -0.75 },  // Middle (will add)
    { radius: 2, height: 0.5, y: 0 }         // Top (will add)
  ];

  // Reset disk index (bottom disk is already added, so we start at 0)
  currentDiskIndex = 0;
  diskAddCounter = 0;

  dots(true); // Initial creation
}

function addNextDisk() {
  if (currentDiskIndex >= diskGeometries.length - 1) return false;

  currentDiskIndex++;
  const config = diskGeometries[currentDiskIndex];

  // Create new merged geometry with all disks up to current index
  const geometries = [];

  for (let i = 0; i <= currentDiskIndex; i++) {
    const disk = diskGeometries[i];
    const cylinderGeometry = new THREE.CylinderGeometry(
      disk.radius,
      disk.radius,
      disk.height,
      32,
      1,
      false
    );
    cylinderGeometry.translate(0, disk.y, 0);
    geometries.push(cylinderGeometry);
  }

  // Merge geometries
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

  // Update whale mesh with new geometry
  whale.geometry.dispose();
  whale.geometry = mergedGeometry;

  // Force update
  whale.geometry.computeBoundingBox();
  whale.geometry.computeBoundingSphere();
  whale.visible = false; // Keep it hidden but update geometry

  // Don't rebuild sampler here, let dots() do it
  console.log('Disk added. New geometry has', mergedGeometry.attributes.position.count, 'vertices');

  // Add the new disk
  const newDiskConfig = diskGeometries[currentDiskIndex];
  const newDiskGeometry = new THREE.CylinderGeometry(
    newDiskConfig.radius,
    newDiskConfig.radius,
    newDiskConfig.height,
    32, 1, false
  );
  newDiskGeometry.translate(0, newDiskConfig.y, 0);

  // Create mesh for sampling
  const newDiskMesh = new THREE.Mesh(newDiskGeometry.clone());
  diskMeshes.push(newDiskMesh);

  // Create sampler for this specific disk
  const newDiskSampler = new MeshSurfaceSampler(newDiskMesh).build();
  samplers.push(newDiskSampler);
  console.log('Added disk', currentDiskIndex, 'with its own sampler. Total samplers:', samplers.length);

  // Reassign some lines to the new disk
  if (lines.length > 0) {
    const linesPerDisk = Math.floor(lines.length / samplers.length);
    lines.forEach((line, index) => {
      const diskIndex = Math.floor(index / linesPerDisk);
      if (diskIndex < samplers.length) {
        line.assignedSampler = samplers[diskIndex];
        // Reset some lines to start fresh on new disk
        if (diskIndex === samplers.length - 1) {
          line.previous = null;
          line.coordinates = [];
        }
      }
    });
    console.log('Redistributed lines across', samplers.length, 'disks');
  }

  // Add visible version
  const visibleMaterial = new THREE.MeshBasicMaterial({
    color: 0x444444,
    wireframe: true,
    transparent: true,
    opacity: 0.2
  });
  const newVisibleDisk = new THREE.Mesh(newDiskGeometry, visibleMaterial);
  newVisibleDisk.visible = showDisks;
  group.add(newVisibleDisk);
  visibleDisks.push(newVisibleDisk);

  // Don't call dots(), just continue with multiple samplers

  return true;
}
createWhale();

const p1 = new THREE.Vector3();
function nextDot(line) {
  let ok = false;
  let attempts = 0;
  const maxAttempts = 30;

  while (!ok && attempts < maxAttempts) {
    attempts++;

    // If line doesn't have a sampler assigned, assign one
    if (!line.assignedSampler && samplers.length > 0) {
      // Assign sampler based on line index to distribute evenly
      line.assignedSampler = samplers[line.samplerIndex % samplers.length];
    }

    // Use only the assigned sampler for this line
    if (line.assignedSampler) {
      line.assignedSampler.sample(p1);
    } else if (sampler) {
      sampler.sample(p1);
    } else {
      return; // No sampler available
    }

    // For first point or if close enough to previous (strict distance)
    if (!line.previous) {
      // First point - just place it
      line.coordinates.push(p1.x, p1.y, p1.z);
      line.previous = p1.clone();
      ok = true;
    } else if (p1.distanceTo(line.previous) < pointDistance) {
      // Close enough for continuous line
      line.coordinates.push(p1.x, p1.y, p1.z);
      line.previous = p1.clone();

      for (let i = 0; i < 2; i++) {
        const spark = new Sparkle();
        spark.setup(p1, line.material.color);
        sparkles.push(spark);
      }
      ok = true;
    }
  }

  // Don't switch disks - keep lines within their assigned disk
}

function updateSparklesGeometry() {
  let tempSparklesArraySizes = [];
  let tempSparklesArrayColors = [];
  sparkles.forEach((s) => {
    tempSparklesArraySizes.push(s.size);
    tempSparklesArrayColors.push(s.color.r, s.color.g, s.color.b);
  });
  sparklesGeometry.setAttribute("color", new THREE.Float32BufferAttribute(tempSparklesArrayColors, 3));
  sparklesGeometry.setAttribute("size", new THREE.Float32BufferAttribute(tempSparklesArraySizes, 1));
}

class Sparkle extends THREE.Vector3 {
  setup(origin, color) {
    this.x = origin.x;
    this.y = origin.y;
    this.z = origin.z;
    this.v = new THREE.Vector3();
    /* X Speed */
    this.v.x = THREE.MathUtils.randFloat(0.001, 0.006);
    this.v.x *= Math.random() > 0.5 ? 1 : -1;
    /* Y Speed */
    this.v.y = THREE.MathUtils.randFloat(0.001, 0.006);
    this.v.y *= Math.random() > 0.5 ? 1 : -1;
    /* Z Speed */
    this.v.z = THREE.MathUtils.randFloat(0.001, 0.006);
    this.v.z *= Math.random() > 0.5 ? 1 : -1;

    this.size = Math.random() * 4 + 0.5 * pixelRatio;
    this.slowDown = 0.4 + Math.random() * 0.58;
    this.color = color;
  }
  update() {
    if (this.v.x > 0.001 || this.v.y > 0.001 || this.v.z > 0.001) {
      this.add(this.v);
      this.v.multiplyScalar(this.slowDown);
    }
  }
}

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

/* Create stars */
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
const galaxyPoints = new THREE.Points(starsGeometry, sparklesMaterial);
scene.add(galaxyPoints);

let _prev = 0;
let frameCount = 0;
let lastTime = performance.now();
let fps = 60;

function render(a) {
  requestAnimationFrame(render);

  if (isPaused) return;

  // Calculate FPS
  frameCount++;
  const currentTime = performance.now();
  if (currentTime >= lastTime + 1000) {
    fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
    frameCount = 0;
    lastTime = currentTime;
    updateStats();
  }

  galaxyPoints.rotation.y += 0.0005;

  group.rotation.x = Math.sin(a * 0.0003) * 0.1;
  group.rotation.y += 0.001;

  // Add next disk based on diskSpeedFrames
  diskAddCounter++;
  if (diskAddCounter > diskSpeedFrames && currentDiskIndex < diskGeometries.length - 1) {
    console.log('Attempting to add disk. Current index:', currentDiskIndex, 'Counter:', diskAddCounter, 'Speed:', diskSpeedFrames);
    if (addNextDisk()) {
      console.log('Successfully added disk', currentDiskIndex);
      diskAddCounter = 0;
      updateStats();
    }
  }

  if (a - _prev > drawSpeed) {
    const currentSparkleLimit = baseSparkleLimit + (currentDiskIndex * sparklesPerDisk);
    lines.forEach((l) => {
      if (sparkles.length < currentSparkleLimit) {  // Dynamic limit based on disk count
        for (let i = 0; i < dotsPerCycle; i++) {
          nextDot(l);
        }
      }
      const tempVertices = new Float32Array(l.coordinates);
      l.geometry.setAttribute("position", new THREE.BufferAttribute(tempVertices, 3));
      l.geometry.computeBoundingSphere();
    });
    updateSparklesGeometry();
    _prev = a;
  }

  let tempSparklesArray = [];
  sparkles.forEach((s) => {
    s.update();
    tempSparklesArray.push(s.x, s.y, s.z);
  });

  sparklesGeometry.setAttribute("position", new THREE.Float32BufferAttribute(tempSparklesArray, 3));

  let tempStarsArray = [];
  stars.forEach((s) => {
    s.update();
    tempStarsArray.push(s.x, s.y, s.z);
  });

  starsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(tempStarsArray, 3));

  composer.render();
}

function onWindowResize() {
  camera.aspect = elContent.offsetWidth / elContent.offsetHeight;
  camera.updateProjectionMatrix();
  composer.setSize(elContent.offsetWidth, elContent.offsetHeight);
  renderer.setSize(elContent.offsetWidth, elContent.offsetHeight);
  bloomPass.setSize(elContent.offsetWidth, elContent.offsetHeight);
}
window.addEventListener("resize", onWindowResize);

// Control Panel Functions
function updateStats() {
  document.getElementById('fps').textContent = fps;
  document.getElementById('totalPoints').textContent = lines.reduce((sum, line) => sum + line.coordinates.length, 0);
  document.getElementById('sparkleCount').textContent = sparkles.length;
  document.getElementById('sparkleLimit').textContent = baseSparkleLimit + (currentDiskIndex * sparklesPerDisk);
  document.getElementById('diskCount').textContent = `${currentDiskIndex + 1}/3`;

  // Calculate polygon count
  let polyCount = 0;
  if (whale && whale.geometry) {
    const indexCount = whale.geometry.index ? whale.geometry.index.count : 0;
    polyCount = Math.floor(indexCount / 3);
  }
  document.getElementById('polyCount').textContent = polyCount;
}

function initControls() {
  // Draw Speed Control
  const drawSpeedSlider = document.getElementById('drawSpeed');
  const drawSpeedValue = document.getElementById('drawSpeedValue');
  drawSpeedSlider.addEventListener('input', (e) => {
    drawSpeed = parseInt(e.target.value);
    drawSpeedValue.textContent = drawSpeed + ' ms';
  });

  // Dots Per Cycle Control
  const dotsPerCycleSlider = document.getElementById('dotsPerCycle');
  const dotsPerCycleValue = document.getElementById('dotsPerCycleValue');
  dotsPerCycleSlider.addEventListener('input', (e) => {
    dotsPerCycle = parseInt(e.target.value);
    dotsPerCycleValue.textContent = dotsPerCycle;
  });

  // Disk Speed Control
  const diskSpeedSlider = document.getElementById('diskSpeed');
  const diskSpeedValue = document.getElementById('diskSpeedValue');
  diskSpeedSlider.addEventListener('input', (e) => {
    const seconds = parseFloat(e.target.value);
    diskSpeedFrames = Math.floor(seconds * 60); // Convert to frames at 60fps
    diskSpeedValue.textContent = seconds.toFixed(1) + ' s';
  });

  // Line Count Control
  const lineCountSlider = document.getElementById('lineCount');
  const lineCountValue = document.getElementById('lineCountValue');
  lineCountSlider.addEventListener('input', (e) => {
    maxLineCount = parseInt(e.target.value);
    lineCountValue.textContent = maxLineCount;
    dots(true); // Recreate lines from scratch
  });

  // Point Distance Control
  const pointDistanceSlider = document.getElementById('pointDistance');
  const pointDistanceValue = document.getElementById('pointDistanceValue');
  pointDistanceSlider.addEventListener('input', (e) => {
    pointDistance = parseFloat(e.target.value);
    pointDistanceValue.textContent = pointDistance.toFixed(2);
  });

  // Reset Button
  const resetBtn = document.getElementById('resetBtn');
  resetBtn.addEventListener('click', () => {
    // Reset all values to defaults
    drawSpeed = 1;
    dotsPerCycle = 10;
    diskSpeedFrames = 120;
    maxLineCount = 12;
    pointDistance = 0.35;
    currentDiskIndex = 0;
    diskAddCounter = 0;

    // Update sliders
    drawSpeedSlider.value = 1;
    dotsPerCycleSlider.value = 10;
    diskSpeedSlider.value = 2;
    lineCountSlider.value = 12;
    pointDistanceSlider.value = 0.35

    // Update displays
    drawSpeedValue.textContent = '1 ms';
    dotsPerCycleValue.textContent = '10';
    diskSpeedValue.textContent = '2.0 s';
    lineCountValue.textContent = '12';
    pointDistanceValue.textContent = '0.35';

    // Reset scene
    sparkles.length = 0;
    createWhale();
  });

  // Pause Button
  const pauseBtn = document.getElementById('pauseBtn');
  pauseBtn.addEventListener('click', () => {
    isPaused = !isPaused;
    pauseBtn.textContent = isPaused ? '▶️ Oynat' : '⏸️ Duraklat';
  });

  // Show Disks Checkbox
  const showDisksCheckbox = document.getElementById('showDisks');
  showDisksCheckbox.addEventListener('change', (e) => {
    showDisks = e.target.checked;
    visibleDisks.forEach(disk => {
      disk.visible = showDisks;
    });
  });
}

// Initialize controls when DOM is ready
setTimeout(initControls, 100);