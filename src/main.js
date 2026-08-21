import * as THREE from 'three';
import './styles.css';
import { initializeMobileMenu } from './mobile-menu.js';

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

if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  animate();
} else {
  renderer.render(scene, camera);
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

function initializeToolkitModal() {
  const modal = document.querySelector('.toolkit-modal');
  const openButtons = document.querySelectorAll('[data-open-toolkit]');
  const closeButtons = document.querySelectorAll('[data-close-toolkit]');
  const tabs = document.querySelectorAll('[data-toolkit-tab]');
  const groups = document.querySelectorAll('[data-toolkit-category]');
  let lastFocusedElement = null;

  if (!modal || !openButtons.length) return;

  const openModal = () => {
    lastFocusedElement = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    modal.querySelector('.toolkit-close')?.focus();
  };

  const closeModal = () => {
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    lastFocusedElement?.focus?.();
  };

  openButtons.forEach((button) => {
    button.addEventListener('click', openModal);
  });

  closeButtons.forEach((button) => {
    button.addEventListener('click', closeModal);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) closeModal();
  });

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const selectedCategory = tab.dataset.toolkitTab;
      tabs.forEach((item) => item.setAttribute('aria-selected', String(item === tab)));
      groups.forEach((group) => {
        group.hidden = selectedCategory !== 'all' && group.dataset.toolkitCategory !== selectedCategory;
      });
      modal.querySelector('.toolkit-modal-body')?.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

function initializeBookModal() {
  const modal = document.querySelector('.book-modal');
  const openButtons = document.querySelectorAll('[data-open-book]');
  const closeButtons = document.querySelectorAll('[data-close-book]');
  const formatInputs = modal?.querySelectorAll('[data-book-format]') ?? [];
  const quantityInput = modal?.querySelector('[data-book-quantity]');
  const shippingFields = modal?.querySelectorAll('[data-shipping-field]') ?? [];
  const subtotalElement = modal?.querySelector('[data-book-subtotal]');
  const shippingElement = modal?.querySelector('[data-shipping-total]');
  const totalElement = modal?.querySelector('[data-order-total]');
  const shippingNoteElement = modal?.querySelector('[data-shipping-note]');
  const statusElement = modal?.querySelector('[data-checkout-status]');
  const cashAppLink = modal?.querySelector('[data-cashapp-link]');
  const paypalLink = modal?.querySelector('[data-paypal-link]');
  const copyOrderButton = modal?.querySelector('[data-copy-order]');
  let lastFocusedElement = null;
  let shippingRequest = null;
  let checkoutSequence = 0;
  let currentCheckout = null;
  let quoteTimer = null;
  if (!modal || !openButtons.length) return;

  const prices = {
    paperback: 12.99,
    hardcover: 15.99,
  };
  const nearbyStates = new Set(['AR', 'LA', 'NM', 'OK']);
  const regionalStates = new Set(['AL', 'CO', 'IA', 'IL', 'KS', 'MO', 'MS', 'NE', 'TN']);
  const distantStates = new Set(['AK', 'HI', 'PR', 'GU', 'VI']);
  const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

  const getFieldValue = (name) => {
    const field = modal.querySelector(`[data-shipping-field="${name}"]`);
    return field?.value.trim() ?? '';
  };

  const getSelectedFormat = () => {
    const selected = Array.from(formatInputs).find((input) => input.checked);
    return selected?.value === 'hardcover' ? 'hardcover' : 'paperback';
  };

  const getQuantity = () => {
    const value = Number.parseInt(quantityInput?.value ?? '1', 10);
    if (Number.isNaN(value)) return 1;
    return Math.min(Math.max(value, 1), 10);
  };

  const getCheckoutInput = () => ({
    format: getSelectedFormat(),
    quantity: getQuantity(),
    state: getFieldValue('state').toUpperCase(),
    zip: getFieldValue('zip'),
    name: getFieldValue('name'),
    email: getFieldValue('email'),
    street: getFieldValue('street'),
    city: getFieldValue('city'),
  });

  const calculateShipping = ({ format, quantity, state, zip }) => {
    const cleanState = state.trim().toUpperCase();
    const cleanZip = zip.trim();
    if (!cleanState || cleanZip.length < 5) return null;

    let base = 7.99;
    if (distantStates.has(cleanState)) {
      base = 10.99;
    } else if (cleanState === 'TX' || cleanZip.startsWith('75') || cleanZip.startsWith('76')) {
      base = 4.99;
    } else if (nearbyStates.has(cleanState)) {
      base = 5.99;
    } else if (regionalStates.has(cleanState)) {
      base = 6.99;
    }

    const additionalBook = format === 'hardcover' ? 1.65 : 1.25;
    return base + Math.max(quantity - 1, 0) * additionalBook;
  };

  const getFallbackShipping = (input) => {
    const shipping = calculateShipping(input);
    if (shipping === null) return null;
    return {
      amount: shipping,
      source: 'estimate',
      label: 'Estimated shipping & handling',
      note: 'Estimated from Tyler, TX 75703. Live carrier quote will be used when available.',
    };
  };

  const setPaymentEnabled = (isEnabled) => {
    [cashAppLink, paypalLink].forEach((link) => {
      if (!link) return;
      link.classList.toggle('is-disabled', !isEnabled);
      link.setAttribute('aria-disabled', String(!isEnabled));
    });
  };

  const buildOrderSummary = ({ format, quantity, subtotal, shipping, total, shippingSource, carrier }) => {
    const formatLabel = format === 'hardcover' ? 'Hard-cover' : 'Soft-cover';
    const addressLines = [
      getFieldValue('name'),
      getFieldValue('street'),
      [getFieldValue('city'), getFieldValue('state').toUpperCase(), getFieldValue('zip')].filter(Boolean).join(', '),
      getFieldValue('email'),
    ].filter(Boolean);

    return [
      `Rider's Magic Mark order`,
      `${quantity} ${formatLabel} book${quantity === 1 ? '' : 's'}`,
      `Books: ${currency.format(subtotal)}`,
      `${shippingSource === 'shippo' ? 'Live shipping & handling' : 'Estimated shipping & handling'}: ${currency.format(shipping)}`,
      carrier ? `Carrier: ${carrier}` : '',
      `Order total: ${currency.format(total)}`,
      addressLines.length ? `Ship to: ${addressLines.join(' | ')}` : '',
      shippingSource === 'shippo' ? 'Live carrier quote from Tyler, TX 75703.' : 'Shipping estimate from Tyler, TX 75703.',
    ].filter(Boolean).join('\n');
  };

  const renderCheckout = ({ input, shippingRate = null, loading = false, message = '' }) => {
    const { format, quantity } = input;
    if (quantityInput) quantityInput.value = String(quantity);

    const subtotal = prices[format] * quantity;
    const shipping = shippingRate?.amount ?? null;
    const total = subtotal + (shipping ?? 0);
    const canPay = shipping !== null && !loading;
    const carrier = shippingRate?.provider && shippingRate?.service
      ? `${shippingRate.provider} ${shippingRate.service}`
      : shippingRate?.provider || '';

    if (subtotalElement) subtotalElement.textContent = currency.format(subtotal);
    if (shippingElement) shippingElement.textContent = shipping !== null ? currency.format(shipping) : 'Enter ZIP';
    if (totalElement) totalElement.textContent = currency.format(total);
    if (shippingNoteElement) {
      shippingNoteElement.textContent = shippingRate?.source === 'shippo'
        ? `${carrier || 'Carrier'} quote from Tyler, TX 75703${shippingRate.estimatedDays ? `, estimated ${shippingRate.estimatedDays} day${shippingRate.estimatedDays === 1 ? '' : 's'}.` : '.'}`
        : shippingRate?.note || 'Live carrier quote from Tyler, TX 75703 once a destination ZIP is entered.';
    }
    if (statusElement) {
      if (loading) {
        statusElement.textContent = 'Checking live shipping with Shippo...';
      } else if (message) {
        statusElement.textContent = message;
      } else if (canPay) {
        statusElement.textContent = `${shippingRate?.source === 'shippo' ? 'Live' : 'Estimated'} total: ${currency.format(total)}. Use this amount when paying, then include your copied order summary in the note.`;
      } else {
        statusElement.textContent = 'Enter a state and ZIP to calculate shipping before payment.';
      }
    }

    if (cashAppLink) cashAppLink.href = canPay ? `https://cash.app/$tishashipleyauthor/${total.toFixed(2)}` : 'https://cash.app/$tishashipleyauthor';
    if (paypalLink) paypalLink.href = canPay ? `https://www.paypal.com/paypalme/Tishashipley/${total.toFixed(2)}` : 'https://www.paypal.com/paypalme/Tishashipley';
    setPaymentEnabled(canPay);

    currentCheckout = {
      format,
      quantity,
      subtotal,
      shipping: shipping ?? 0,
      total,
      canPay,
      shippingSource: shippingRate?.source ?? '',
      carrier,
    };

    return currentCheckout;
  };

  const fetchLiveShipping = async (input, signal) => {
    const response = await fetch('/api/shipping-rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'Live shipping was not available.');
    return payload;
  };

  const updateCheckout = async () => {
    const input = getCheckoutInput();
    const subtotal = prices[input.format] * input.quantity;
    const fallbackRate = getFallbackShipping(input);
    const canQuote = Boolean(input.state && input.zip.length >= 5);
    const sequence = ++checkoutSequence;

    if (!canQuote) {
      shippingRequest?.abort();
      renderCheckout({ input, message: 'Enter a state and ZIP to calculate shipping before payment.' });
      return currentCheckout;
    }

    renderCheckout({ input, shippingRate: fallbackRate, loading: true });
    shippingRequest?.abort();
    shippingRequest = new AbortController();

    try {
      const liveRate = await fetchLiveShipping(input, shippingRequest.signal);
      if (sequence !== checkoutSequence) return currentCheckout;
      renderCheckout({
        input,
        shippingRate: {
          ...liveRate,
          source: 'shippo',
        },
      });
    } catch (error) {
      if (error.name === 'AbortError' || sequence !== checkoutSequence) return currentCheckout;
      renderCheckout({
        input,
        shippingRate: fallbackRate,
        message: fallbackRate
          ? `Live Shippo rate is unavailable right now, so this total uses a local estimate: ${currency.format(subtotal + fallbackRate.amount)}.`
          : 'Enter a state and ZIP to calculate shipping before payment.',
      });
    }

    return currentCheckout;
  };

  const scheduleCheckoutUpdate = (delay = 250) => {
    window.clearTimeout(quoteTimer);
    quoteTimer = window.setTimeout(updateCheckout, delay);
  };

  const handlePaymentClick = (event) => {
    const checkout = currentCheckout ?? renderCheckout({ input: getCheckoutInput(), shippingRate: getFallbackShipping(getCheckoutInput()) });
    if (checkout.canPay) return;
    event.preventDefault();
    statusElement?.focus?.();
  };

  const openModal = () => {
    lastFocusedElement = document.activeElement;
    updateCheckout();
    modal.hidden = false;
    document.body.classList.add('modal-open');
    modal.querySelector('.book-modal-close')?.focus();
  };

  const closeModal = () => {
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    lastFocusedElement?.focus?.();
  };

  openButtons.forEach((button) => button.addEventListener('click', openModal));
  closeButtons.forEach((button) => button.addEventListener('click', closeModal));
  formatInputs.forEach((input) => input.addEventListener('change', () => scheduleCheckoutUpdate(0)));
  quantityInput?.addEventListener('input', () => scheduleCheckoutUpdate(0));
  shippingFields.forEach((field) => field.addEventListener('input', () => scheduleCheckoutUpdate()));
  cashAppLink?.addEventListener('click', handlePaymentClick);
  paypalLink?.addEventListener('click', handlePaymentClick);
  copyOrderButton?.addEventListener('click', async () => {
    const checkout = currentCheckout?.canPay ? currentCheckout : await updateCheckout();
    if (!checkout?.canPay) {
      if (statusElement) statusElement.textContent = 'Enter a state and ZIP to calculate shipping before copying the order summary.';
      return;
    }
    const summary = buildOrderSummary(checkout);
    try {
      await navigator.clipboard.writeText(summary);
      if (statusElement) statusElement.textContent = 'Order summary copied. Paste it into the payment note so fulfillment has the right details.';
    } catch {
      if (statusElement) statusElement.textContent = summary;
    }
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) closeModal();
  });

  renderCheckout({ input: getCheckoutInput() });
}

function initializeEventTabs() {
  const tabs = document.querySelectorAll('[data-event-tab]');
  const panels = document.querySelectorAll('[data-event-panel]');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((item) => item.setAttribute('aria-selected', String(item === tab)));
      panels.forEach((panel) => {
        panel.hidden = panel.dataset.eventPanel !== tab.dataset.eventTab;
      });
    });
  });
}

function initializeInviteForm() {
  const form = document.querySelector('[data-invite-form]');
  if (!form) return;

  const status = form.querySelector('[data-form-status]');
  const submitButton = form.querySelector('button[type="submit"]');

  const setStatus = (message, state = '') => {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    submitButton.disabled = true;
    submitButton.textContent = 'Sending...';
    setStatus('Sending your request...', 'loading');

    const payload = Object.fromEntries(new FormData(form).entries());

    try {
      const response = await fetch('/api/school-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || 'The message could not be sent yet.');
      }

      form.reset();
      setStatus(result.message || 'Thanks! We received your request and will follow up soon.', 'success');
    } catch (error) {
      setStatus(error.message || 'Something went wrong. Please try again soon.', 'error');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Start the Conversation';
    }
  });
}

initializeCharacterCards();
initializeMobileMenu();
initializeToolkitModal();
initializeBookModal();
initializeEventTabs();
initializeInviteForm();
