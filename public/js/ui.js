function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✓', error: '✗', info: 'ℹ', warning: '⚠' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${message}`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity .3s'; setTimeout(() => toast.remove(), 300); }, duration);
}

let modalCallback = null;

function showModal(title, message, onConfirm) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalMessage').textContent = message;
  document.getElementById('modalOverlay').classList.add('open');
  modalCallback = onConfirm;
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  modalCallback = null;
}

document.getElementById('modalConfirmBtn').addEventListener('click', () => {
  if (modalCallback) modalCallback();
  closeModal();
});

document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

function setLoading(btn, loading, text) {
  if (loading) {
    btn._origText = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px"></span>';
  } else {
    btn.disabled = false;
    btn.textContent = text || btn._origText || 'Save';
  }
}
