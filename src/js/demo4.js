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
camera.position.set(80, 50, 80);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});
renderer.setSize(elContent.offsetWidth, elContent.offsetHeight);
elContent.appendChild(renderer.domElement);

// Add lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.3);
directionalLight.position.set(10, 10, 5);
scene.add(directionalLight);

let neuraOda = null;
let sampler = null;
const lines = [];
const linesMaterials = [
  new THREE.LineBasicMaterial({ color: 0x00FFFF, transparent: true, opacity: 0.8 }),
  new THREE.LineBasicMaterial({ color: 0xFF00FF, transparent: true, opacity: 0.8 }),
  new THREE.LineBasicMaterial({ color: 0xFFFF00, transparent: true, opacity: 0.8 }),
  new THREE.LineBasicMaterial({ color: 0x00FF00, transparent: true, opacity: 0.8 })
];

const tempPosition = new THREE.Vector3();

function updateLines() {
  if (!sampler) return;

  lines.forEach((line, i) => {
    const previousPoint = line.coordinates[line.coordinates.length - 1];
    let pointFound = false;
    let attempts = 0;

    while (!pointFound && attempts < 30) {
      sampler.sample(tempPosition);

      // Apply model transformations
      const transformed = tempPosition.clone();
      transformed.multiplyScalar(neuraOda.scale.x);
      transformed.add(neuraOda.position);

      if (!previousPoint || (previousPoint && transformed.distanceTo(previousPoint) < 3 && transformed.distanceTo(previousPoint) > 0.5)) {
        line.coordinates.push(transformed);
        pointFound = true;
      }
      attempts++;
    }

    line.geometry.setFromPoints(line.coordinates);
  });
}

function render(a) {
  if (neuraOda) {
    neuraOda.rotation.y += 0.001;

    lines.forEach((line, index) => {
      if (line.coordinates.length < 2000) {
        updateLines();
      }
    });
  }

  renderer.render(scene, camera);
}

window.addEventListener("resize", onWindowResize, false);

function onWindowResize() {
  camera.aspect = elContent.offsetWidth / elContent.offsetHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(elContent.offsetWidth, elContent.offsetHeight);
}

// Load NeuraOda OBJ model
const loader = new OBJLoader();
loader.load(
  '/NeuraOda.obj',
  (obj) => {
    console.log('OBJ loaded:', obj);

    // Create a group for all meshes
    neuraOda = new THREE.Group();
    const meshes = [];

    // Collect all meshes
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mesh = child.clone();

        // Make model translucent wireframe
        mesh.material = new THREE.MeshPhongMaterial({
          color: 0x555555,
          wireframe: true,
          transparent: true,
          opacity: 0.1,
          side: THREE.DoubleSide
        });

        meshes.push(mesh);
        neuraOda.add(mesh);
      }
    });

    if (meshes.length === 0) {
      console.error('No meshes found');
      return;
    }

    // Center and scale the model
    const box = new THREE.Box3().setFromObject(neuraOda);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 50 / maxDim;
    neuraOda.scale.set(scale, scale, scale);
    neuraOda.position.sub(center.multiplyScalar(scale));

    scene.add(neuraOda);

    // Create merged geometry for sampling
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

      // Add vertices
      for (let i = 0; i < pos.count; i++) {
        positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
      }

      // Add indices
      if (index) {
        for (let i = 0; i < index.count; i++) {
          indices.push(index.getX(i) + vertexOffset);
        }
      } else {
        // Generate indices for non-indexed geometry
        for (let i = 0; i < pos.count; i += 3) {
          indices.push(i + vertexOffset, i + 1 + vertexOffset, i + 2 + vertexOffset);
        }
      }

      vertexOffset += pos.count;
    });

    mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    mergedGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    mergedGeometry.setIndex(indices);

    // Create sampler mesh
    const samplerMesh = new THREE.Mesh(mergedGeometry);
    sampler = new MeshSurfaceSampler(samplerMesh).build();

    // Initialize lines
    for (let i = 0; i < 4; i++) {
      const lineGeometry = new THREE.BufferGeometry();
      const line = new THREE.Line(lineGeometry, linesMaterials[i]);
      line.coordinates = [];
      lines.push(line);
      scene.add(line);
    }

    renderer.setAnimationLoop(render);
  },
  (xhr) => {
    console.log((xhr.loaded / xhr.total * 100) + '% loaded');
  },
  (error) => {
    console.error('Error loading OBJ:', error);
  }
);