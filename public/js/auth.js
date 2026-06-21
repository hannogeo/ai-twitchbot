let currentUser = null;
let isSignUp = false;

function toggleAuthMode() {
  isSignUp = !isSignUp;
  document.getElementById('authNameGroup').style.display = isSignUp ? '' : 'none';
  document.getElementById('authPolicyGroup').style.display = isSignUp ? '' : 'none';
  document.getElementById('authToggleText').textContent = isSignUp ? 'Already have an account?' : "Don't have an account?";
  document.getElementById('authToggleLink').textContent = isSignUp ? 'Sign In' : 'Sign Up';
  document.getElementById('authSubmitBtn').textContent = isSignUp ? 'Sign Up' : 'Sign In';
}

function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.style.display = 'block';
}

function hideAuthError() {
  document.getElementById('authError').style.display = 'none';
}

async function handleAuth() {
  const firstName = document.getElementById('authName').value.trim();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const btn = document.getElementById('authSubmitBtn');

  if (!email || !password) {
    showAuthError('Please fill in all fields.');
    return;
  }
  if (isSignUp && !firstName) {
    showAuthError('Please enter your first name.');
    return;
  }
  if (isSignUp && !document.getElementById('authPolicy').checked) {
    showAuthError('You must agree to the Privacy Policy.');
    return;
  }
  if (password.length < 6) {
    showAuthError('Password must be at least 6 characters.');
    return;
  }

  hideAuthError();
  btn.disabled = true;
  btn.textContent = 'Please wait...';

  try {
    if (isSignUp) {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: firstName });
    } else {
      await auth.signInWithEmailAndPassword(email, password);
    }
  } catch (e) {
    showAuthError(e.message);
    btn.disabled = false;
    btn.textContent = isSignUp ? 'Sign Up' : 'Sign In';
  }
}

async function signInWithGoogle() {
  if (isSignUp && !document.getElementById('authPolicy').checked) {
    showAuthError('You must agree to the Privacy Policy.');
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user') {
      showAuthError(e.message);
    }
  }
}

async function signOut() {
  try {
    botKeepAlive = false;
    await auth.signOut();
  } catch (e) {
    console.error('Sign out error:', e);
  }
}

function confirmSignOut() {
  showModal('Sign Out', 'Are you sure you want to sign out?', async () => {
    await signOut();
    closeModal();
  });
}

function getFirstName(user) {
  if (user.displayName) {
    return user.displayName.split(' ')[0];
  }
  return user.email ? user.email.split('@')[0] : 'User';
}

function updateSidebarUser(user, username) {
  const name = username || getFirstName(user);
  document.getElementById('userAvatar').textContent = (user.displayName || user.email || 'U')[0].toUpperCase();
  document.getElementById('userName').textContent = name;
}

function showPrivacyPolicy() {
  document.getElementById('privacyOverlay').classList.add('open');
}
function closePrivacyPolicy() {
  document.getElementById('privacyOverlay').classList.remove('open');
}

function loadProfile(uid) {
  const cached = localStorage.getItem('botUsername');
  if (cached) document.getElementById('userName').textContent = cached;
  getFirestoreDoc('profiles', uid).then(profile => {
    if (profile && profile.username) {
      document.getElementById('userName').textContent = profile.username;
      localStorage.setItem('botUsername', profile.username);
    }
  });
}

auth.onAuthStateChanged(user => {
  currentUser = user;
  document.getElementById('loadingPage').style.display = 'none';

  if (user) {
    document.getElementById('page-landing').style.display = 'none';
    document.getElementById('page-auth').style.display = 'none';
    document.getElementById('app-layout').style.display = 'flex';
    updateSidebarUser(user);
    loadProfile(user.uid);

    navigate(getCurrentRoute() || 'dashboard');
    loadConfig();
    startPolling();
  } else {
    document.getElementById('app-layout').style.display = 'none';
    document.getElementById('page-landing').style.display = '';
    document.getElementById('page-auth').style.display = 'none';
    navigate('landing');
  }
});
