const ROUTES = ['landing', 'login', 'dashboard', 'settings'];

function getCurrentRoute() {
  const hash = window.location.hash.slice(1);
  return ROUTES.includes(hash) ? hash : null;
}

function navigate(page) {
  if (!currentUser && page !== 'landing' && page !== 'login') {
    window.location.hash = 'landing';
    return;
  }

  const route = page || 'dashboard';

  if (currentUser) {
    if (route === 'landing' || route === 'login') {
      window.location.hash = 'dashboard';
      showPage('dashboard');
      return;
    }
    window.location.hash = route;
    showPage(route);
  } else {
    document.getElementById('page-landing').style.display = route === 'landing' ? '' : 'none';
    document.getElementById('page-auth').style.display = route === 'login' ? '' : 'none';
    document.getElementById('app-layout').style.display = 'none';
    if (route === 'landing' || route === 'login') {
      window.location.hash = route;
    } else {
      window.location.hash = 'landing';
    }
  }
}

function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const target = document.getElementById(`page-${page}`);
  if (target) {
    target.classList.add('active');
    document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
  }

  const titles = {
    dashboard: ['Dashboard', 'Bot status and activity'],
    settings: ['Settings', 'Configure your bot and AI'],
  };
  if (titles[page]) {
    document.getElementById('pageTitle').textContent = titles[page][0];
    document.getElementById('pageSubtitle').textContent = titles[page][1];
  }
}

window.addEventListener('hashchange', () => {
  const route = getCurrentRoute();
  if (route) {
    navigate(route);
  } else if (currentUser) {
    navigate('dashboard');
  } else {
    navigate('landing');
  }
});

window.addEventListener('load', () => {
  if (window.location.pathname === '/twitch/callback' || window.location.search.includes('code=')) {
    handleTwitchCallback();
    return;
  }

  const route = getCurrentRoute();
  if (currentUser) {
    navigate(route || 'dashboard');
  } else {
    navigate(route || 'landing');
  }
});
