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

const colors = [0x39d6c7, 0xffcf56, 0xff5c7a, 0x4577ff, 0xffffff];
const geometry = new THREE.SphereGeometry(0.045, 12, 12);

for (let i = 0; i < 140; i += 1) {
  const material = new THREE.MeshBasicMaterial({
    color: colors[i % colors.length],
    transparent: true,
    opacity: 0.72,
  });
  const star = new THREE.Mesh(geometry, material);
  const radius = 2.5 + Math.random() * 5.5;
  const angle = Math.random() * Math.PI * 2;
  star.position.set(
    Math.cos(angle) * radius,
    (Math.random() - 0.5) * 6,
    Math.sin(angle) * radius - 2
  );
  star.userData = { speed: 0.002 + Math.random() * 0.005, radius, angle };
  group.add(star);
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
    if (!child.userData.speed) return;
    child.userData.angle += child.userData.speed;
    child.position.x = Math.cos(child.userData.angle) * child.userData.radius;
    child.position.z = Math.sin(child.userData.angle) * child.userData.radius - 2;
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
