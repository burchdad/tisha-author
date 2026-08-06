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
  const isForeground = i < 16;
  const material = new THREE.MeshBasicMaterial({
    color: leafColors[i % leafColors.length],
    side: THREE.DoubleSide,
    transparent: true,
    opacity: isForeground ? 0.48 : 0.7,
  });
  const leaf = new THREE.Mesh(leafGeometry, material);
  const scale = isForeground ? 0.58 + Math.random() * 0.48 : 0.26 + Math.random() * 0.34;
  leaf.scale.set(scale, scale, scale);
  leaf.position.set(
    (Math.random() - 0.5) * 10.5,
    3.9 + Math.random() * 6,
    isForeground ? 1 + Math.random() * 1.4 : (Math.random() - 0.5) * 4 - 2.2,
  );
  leaf.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  leaf.userData = {
    foreground: isForeground,
    fallSpeed: (isForeground ? 0.01 : 0.006) + Math.random() * 0.014,
    swaySpeed: 0.012 + Math.random() * 0.022,
    swayAmount: (isForeground ? 0.014 : 0.008) + Math.random() * 0.025,
    spin: (isForeground ? 0.018 : 0.012) + Math.random() * 0.026,
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
      child.position.z = child.userData.foreground ? 1 + Math.random() * 1.4 : (Math.random() - 0.5) * 4 - 2.2;
    }
  });

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

const pageCopy = {
  '/author/': {
    title: 'Meet Dr. Tisha Shipley',
    copy: "The author page keeps Dr. Shipley's story, education background, speaking focus, and media-ready details in one dedicated place.",
    sections: ['author'],
    profileMode: 'author',
  },
  '/illustrator/': {
    title: 'Meet the Illustrator',
    copy: "A focused space for the artist behind Rider and his friends, with room for process notes, sketches, and final illustration details.",
    sections: ['author'],
    profileMode: 'illustrator',
  },
  '/characters/': {
    title: 'Meet the Characters',
    copy: "A deeper look at Rider and the friends who help children talk about courage, empathy, creativity, laughter, and confidence.",
    sections: ['characters'],
  },
  '/companion/': {
    title: "Rider's Magic Mark Companion",
    copy: 'Curriculum, classroom conversations, and SEL-ready activities that help the story live beyond the read-aloud.',
    sections: ['companion', 'curriculum'],
  },
  '/schools/': {
    title: 'Invite Dr. Shipley to Your School',
    copy: 'A dedicated school visit page for assemblies, classroom workshops, author Q&A sessions, educator trainings, and book events.',
    sections: ['schools'],
  },
  '/teachers/': {
    title: 'Extras for Teachers',
    copy: 'A clean download library for worksheets, certificates, poems, reflection cards, classroom resources, and family connection tools.',
    sections: ['teacher-toolkit'],
  },
};

function addHomeGateway(storyStrip) {
  const gateway = document.createElement('section');
  gateway.className = 'home-gateway section-band';
  gateway.setAttribute('aria-label', 'Explore Rider pages');
  gateway.innerHTML = `
    <div class="section-heading">
      <p class="eyebrow">Explore the world</p>
      <h2>Choose the next part of the adventure</h2>
      <p>Jump into the cast, companion curriculum, school visits, teacher resources, or the creative team behind Rider's story.</p>
    </div>
    <div class="gateway-grid">
      <a href="/characters/"><span>01</span><strong>Meet the Characters</strong><small>Rider and the friends who bring the story to life.</small></a>
      <a href="/companion/"><span>02</span><strong>Companion & Curriculum</strong><small>Read, reflect, create, and share classroom moments.</small></a>
      <a href="/teachers/"><span>03</span><strong>Teacher Downloads</strong><small>Selective worksheets, poems, certificates, and extras.</small></a>
      <a href="/schools/"><span>04</span><strong>School Visits</strong><small>Invite Dr. Shipley for assemblies and workshops.</small></a>
      <a href="/author/"><span>05</span><strong>Meet the Author</strong><small>Dr. Tisha Shipley's story and speaking details.</small></a>
      <a href="/illustrator/"><span>06</span><strong>Meet the Illustrator</strong><small>The creative process behind Rider's visual world.</small></a>
    </div>
  `;
  storyStrip.insertAdjacentElement('afterend', gateway);
}

function addPageIntro(main, page) {
  const intro = document.createElement('section');
  intro.className = 'page-intro section-band';
  intro.innerHTML = `
    <p class="eyebrow">Rider's Magic Mark</p>
    <h1>${page.title}</h1>
    <p>${page.copy}</p>
  `;
  main.prepend(intro);
}

function shapeProfilePage(mode) {
  const profile = document.querySelector('.profile-section');
  if (!profile) return;

  const author = profile.querySelector(':scope > div:first-child');
  const illustrator = profile.querySelector('#illustrator');

  if (mode === 'author' && illustrator) illustrator.remove();
  if (mode === 'illustrator' && author) author.remove();
}

function initializeCharacterCards() {
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
}

function initializePages() {
  const pathname = window.location.pathname.endsWith('/')
    ? window.location.pathname
    : `${window.location.pathname}/`;
  const page = pageCopy[pathname];
  const main = document.querySelector('main');
  const hero = document.querySelector('.hero');
  const storyStrip = document.querySelector('.story-strip');
  const sections = Array.from(main.querySelectorAll('section[id]'));

  document.body.classList.toggle('is-subpage', Boolean(page));
  document.body.classList.toggle('is-home', !page);

  if (!page) {
    sections.forEach((section) => section.remove());
    if (storyStrip) addHomeGateway(storyStrip);
    return;
  }

  if (hero) hero.remove();
  if (storyStrip) storyStrip.remove();
  sections.forEach((section) => {
    if (!page.sections.includes(section.id)) section.remove();
  });
  addPageIntro(main, page);
  if (page.profileMode) shapeProfilePage(page.profileMode);
}

initializePages();
initializeCharacterCards();
