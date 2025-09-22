import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';

const elContent = document.querySelector('.content');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  elContent.offsetWidth / elContent.offsetHeight,
  0.1,
  1000
);
camera.position.z = 10;
camera.position.y = 2;
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});
renderer.setSize(elContent.offsetWidth, elContent.offsetHeight);
elContent.appendChild(renderer.domElement);

const group = new THREE.Group();
scene.add(group);

let sampler = null;
let statueSampler = null;
let paths = [];
let statuePaths = [];

const tempPosition = new THREE.Vector3();
const diskMaterials = [
  new THREE.LineBasicMaterial({color: 0x00BFFF, transparent: true, opacity: 0.6}),
  new THREE.LineBasicMaterial({color: 0x1E90FF, transparent: true, opacity: 0.6}),
  new THREE.LineBasicMaterial({color: 0x4169E1, transparent: true, opacity: 0.6}),
  new THREE.LineBasicMaterial({color: 0x0000CD, transparent: true, opacity: 0.6})
];

const statueMaterials = [
  new THREE.LineBasicMaterial({color: 0xFFD700, transparent: true, opacity: 0.7}),
  new THREE.LineBasicMaterial({color: 0xFFA500, transparent: true, opacity: 0.7})
];

class Path {
  constructor(index, isStatue = false) {
    this.geometry = new THREE.BufferGeometry();
    this.material = isStatue ? statueMaterials[index % 2] : diskMaterials[index % 4];
    this.line = new THREE.Line(this.geometry, this.material);
    this.vertices = [];
    this.isStatue = isStatue;

    // Initialize with a starting point
    const currentSampler = isStatue ? statueSampler : sampler;
    if (currentSampler) {
      currentSampler.sample(tempPosition);
      this.previousPoint = tempPosition.clone();
    }
  }

  update() {
    const currentSampler = this.isStatue ? statueSampler : sampler;
    if (!currentSampler) return;

    // Add multiple points per frame for faster drawing
    const pointsPerUpdate = this.isStatue ? 3 : 5;

    for (let j = 0; j < pointsPerUpdate; j++) {
      let pointFound = false;
      let attempts = 0;
      while (!pointFound && attempts < 30) {
        attempts++;
        currentSampler.sample(tempPosition);
        if (tempPosition.distanceTo(this.previousPoint) < 0.5) {
          this.vertices.push(tempPosition.x, tempPosition.y, tempPosition.z);
          this.previousPoint = tempPosition.clone();
          pointFound = true;
        }
      }
    }

    if (this.vertices.length > 0) {
      this.geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.vertices, 3));
    }
  }
}

function render(a) {
  group.rotation.y += 0.002;

  // Update disk paths
  paths.forEach(path => {
    if (path.vertices.length < 10000) {
      path.update();
    }
  });

  // Update statue paths
  statuePaths.forEach(path => {
    if (path.vertices.length < 10000) {
      path.update();
    }
  });

  renderer.render(scene, camera);
}

window.addEventListener("resize", onWindowResize, false);

function onWindowResize() {
  camera.aspect = elContent.offsetWidth / elContent.offsetHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(elContent.offsetWidth, elContent.offsetHeight);
}

// Create disks
function createDisks() {
  // Create 3 stacked disks
  const geometries = [];
  const diskConfigs = [
    { radius: 3, height: 0.5, y: -2 },    // Bottom disk
    { radius: 2.5, height: 0.5, y: -1 },  // Middle disk
    { radius: 2, height: 0.5, y: 0 }      // Top disk
  ];

  diskConfigs.forEach(config => {
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
  });

  // Merge all disk geometries
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

  // Create paths for disk sampling (more paths for faster coverage)
  for (let i = 0; i < 12; i++) {
    const path = new Path(i);
    paths.push(path);
    group.add(path.line);
  }
}

// Create statue
function createStatue() {
  const loader = new OBJLoader();
  loader.load(
    '/David.obj',
    (obj) => {
      console.log('David statue loaded successfully');

      // Apply scale
      obj.scale.set(2, 2, 2);
      obj.updateMatrixWorld(true);

      // Collect all meshes
      const meshes = [];
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          meshes.push(child);
        }
      });

      if (meshes.length === 0) {
        console.error('No meshes found in David.obj');
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
        for (let i = 0; i < pos.count; i++) {
          tempPos.set(pos.getX(i), pos.getY(i), pos.getZ(i));
          tempPos.applyMatrix4(mesh.matrixWorld);
          positions.push(tempPos.x, tempPos.y + 1, tempPos.z); // Offset Y by 1 to place on top of disks
        }

        for (let i = 0; i < pos.count; i++) {
          normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
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

      // Create invisible mesh for sampling
      const material = new THREE.MeshBasicMaterial({ visible: false });
      const statueMesh = new THREE.Mesh(mergedGeometry, material);
      scene.add(statueMesh);

      // Create sampler for statue
      statueSampler = new MeshSurfaceSampler(statueMesh).build();

      // Create paths for statue sampling
      for (let i = 0; i < 4; i++) {
        const path = new Path(i, true);
        statuePaths.push(path);
        group.add(path.line);
      }

      console.log('Statue sampler created!');
    },
    (xhr) => {
      console.log((xhr.loaded / xhr.total * 100) + '% loaded');
    },
    (error) => {
      console.error('Error loading David.obj:', error);
      createFallbackStatue();
    }
  );
}

function createFallbackStatue() {
  console.log('Creating fallback statue...');

  // Create a simple torus knot as fallback
  const geometry = new THREE.TorusKnotGeometry(1.5, 0.5, 100, 16);
  geometry.translate(0, 2, 0); // Position above disks

  const material = new THREE.MeshBasicMaterial({ visible: false });
  const statueMesh = new THREE.Mesh(geometry, material);
  scene.add(statueMesh);

  // Create sampler for fallback statue
  statueSampler = new MeshSurfaceSampler(statueMesh).build();

  // Create paths for statue sampling
  for (let i = 0; i < 4; i++) {
    const path = new Path(i, true);
    statuePaths.push(path);
    group.add(path.line);
  }
}

// Initialize
createDisks();

// Load statue after 2 seconds
setTimeout(() => {
  createStatue();
}, 2000);

// Start render loop
renderer.setAnimationLoop(render);