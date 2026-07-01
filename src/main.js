import * as THREE from 'three';
import './styles.css';

const canvas = document.querySelector('#magic-world');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 8);

const group = new THREE.Group();
scene.add(group);

const leafColors = [0xffb300, 0xff7a1a, 0xf04424, 0xc85a1f, 0x7ec850];
const leafShape = new THREE.Shape();
leafShape.moveTo(0, 0.18);
leafShape.bezierCurveTo(0.22, 0.1, 0.26, -0.12, 0, -0.22);
leafShape.bezierCurveTo(-0.26, -0.12, -0.22, 0.1, 0, 0.18);
const leafGeometry = new THREE.ShapeGeometry(leafShape);

for (let i = 0; i < 70; i += 1) {
  const material = new THREE.MeshBasicMaterial({
    color: leafColors[i % leafColors.length],
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7,
  });
  const leaf = new THREE.Mesh(leafGeometry, material);
  const scale = 0.26 + Math.random() * 0.34;
  leaf.scale.set(scale, scale, scale);
  leaf.position.set((Math.random() - 0.5) * 10.5, 3.9 + Math.random() * 6, (Math.random() - 0.5) * 4 - 2.2);
  leaf.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  leaf.userData = {
    fallSpeed: 0.006 + Math.random() * 0.014,
    swaySpeed: 0.012 + Math.random() * 0.022,
    swayAmount: 0.008 + Math.random() * 0.025,
    spin: 0.012 + Math.random() * 0.026,
    phase: Math.random() * Math.PI * 2,
  };
  group.add(leaf);
}

const ringGeometry = new THREE.TorusGeometry(2.25, 0.018, 16, 140);
const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffcf56, transparent: true, opacity: 0.55 });
const ring = new THREE.Mesh(ringGeometry, ringMaterial);
ring.rotation.x = Math.PI / 2.7;
ring.rotation.y = Math.PI / 7;
group.add(ring);

const pointer = { x: 0, y: 0 };
window.addEventListener('pointermove', (event) => {
  pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
  pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
});

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', resize);
resize();

function animate() {
  group.rotation.y += 0.0018;
  group.rotation.x += (pointer.y * 0.08 - group.rotation.x) * 0.015;
  group.rotation.z += (pointer.x * 0.06 - group.rotation.z) * 0.015;
  ring.rotation.z += 0.006;

  group.children.forEach((child) => {
    if (!child.userData.fallSpeed) return;
    child.userData.phase += child.userData.swaySpeed;
    child.position.y -= child.userData.fallSpeed;
    child.position.x += Math.sin(child.userData.phase) * child.userData.swayAmount;
    child.rotation.x += child.userData.spin * 0.7;
    child.rotation.y += child.userData.spin;
    child.rotation.z += child.userData.spin * 0.45;

    if (child.position.y < -4.2) {
      child.position.y = 4.2 + Math.random() * 2.4;
      child.position.x = (Math.random() - 0.5) * 10.5;
      child.position.z = (Math.random() - 0.5) * 4 - 2.2;
    }
  });

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

document.querySelectorAll('.character-card').forEach((card) => {
  card.addEventListener('pointermove', (event) => {
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    card.style.setProperty('--tilt-x', `${y * -8}deg`);
    card.style.setProperty('--tilt-y', `${x * 8}deg`);
  });

  card.addEventListener('pointerleave', () => {
    card.style.setProperty('--tilt-x', '0deg');
    card.style.setProperty('--tilt-y', '0deg');
  });
});
