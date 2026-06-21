let emailBlurred = true;

function openProfile() {
  const user = currentUser;
  if (!user) return;

  document.getElementById('profileAvatar').textContent = (user.displayName || user.email || 'U')[0].toUpperCase();
  document.getElementById('profileEmail').textContent = user.email || '';
  document.getElementById('profileEmail').style.filter = 'blur(4px)';
  emailBlurred = true;

  document.getElementById('profileNewName').value = '';
  document.getElementById('profileNewEmail').value = '';
  document.getElementById('profileCurrentPw').value = '';
  document.getElementById('profileNewPw').value = '';
  document.getElementById('profileEmailStatus').textContent = '';
  document.getElementById('profilePwStatus').textContent = '';
  document.getElementById('profileDeleteSection').style.display = 'none';
  document.getElementById('profileDeleteConfirm').value = '';
  document.getElementById('profileDeleteStatus').textContent = '';

  getFirestoreDoc('profiles', user.uid).then(profile => {
    if (profile && profile.username) {
      document.getElementById('profileNewName').value = profile.username;
    }
  });

  document.getElementById('profileOverlay').classList.add('open');
}

function closeProfile() {
  document.getElementById('profileOverlay').classList.remove('open');
}

function toggleEmailBlur() {
  emailBlurred = !emailBlurred;
  document.getElementById('profileEmail').style.filter = emailBlurred ? 'blur(4px)' : 'none';
}

async function updateUsername() {
  const username = document.getElementById('profileNewName').value.trim();
  if (!username) {
    showToast('Please enter a username.', 'warning');
    return;
  }
  const ok = await setFirestoreDoc('profiles', currentUser.uid, { username });
  if (!ok) {
    showToast('Failed to save username — Firestore may be blocked. Check your security rules.', 'error');
    return;
  }
  localStorage.setItem('botUsername', username);
  document.getElementById('userName').textContent = username;
  showToast('Username saved!', 'success');
}

function isPasswordUser() {
  return currentUser && currentUser.providerData.some(p => p.providerId === 'password');
}

async function changeEmail() {
  const newEmail = document.getElementById('profileNewEmail').value.trim();
  const pw = document.getElementById('profileCurrentPw').value;
  const status = document.getElementById('profileEmailStatus');

  if (!newEmail) {
    status.textContent = 'Please enter a new email.';
    status.style.color = 'var(--red)';
    return;
  }

  try {
    if (isPasswordUser()) {
      if (!pw) {
        status.textContent = 'Enter your current password to confirm.';
        status.style.color = 'var(--red)';
        return;
      }
      const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, pw);
      await currentUser.reauthenticateWithCredential(cred);
    } else {
      const provider = new firebase.auth.GoogleAuthProvider();
      await currentUser.reauthenticateWithPopup(provider);
    }
    await currentUser.updateEmail(newEmail);
    await currentUser.sendEmailVerification();
    document.getElementById('profileEmail').textContent = newEmail;
    status.textContent = 'Email updated! Verification sent to new address.';
    status.style.color = 'var(--green)';
    document.getElementById('profileCurrentPw').value = '';
    document.getElementById('profileNewEmail').value = '';
  } catch (e) {
    status.textContent = e.message;
    status.style.color = 'var(--red)';
  }
}

async function changePassword() {
  const currentPw = document.getElementById('profileCurrentPw').value;
  const newPw = document.getElementById('profileNewPw').value;
  const status = document.getElementById('profilePwStatus');

  if (!isPasswordUser()) {
    status.textContent = 'Password management is not available for Google accounts.';
    status.style.color = 'var(--red)';
    return;
  }

  if (!currentPw) {
    status.textContent = 'Enter your current password.';
    status.style.color = 'var(--red)';
    return;
  }
  if (!newPw || newPw.length < 6) {
    status.textContent = 'New password must be at least 6 characters.';
    status.style.color = 'var(--red)';
    return;
  }

  try {
    const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, currentPw);
    await currentUser.reauthenticateWithCredential(cred);
    await currentUser.updatePassword(newPw);
    status.textContent = 'Password updated!';
    status.style.color = 'var(--green)';
    document.getElementById('profileCurrentPw').value = '';
    document.getElementById('profileNewPw').value = '';
  } catch (e) {
    status.textContent = e.message;
    status.style.color = 'var(--red)';
  }
}

function deleteAccountStep1() {
  document.getElementById('profileDeleteSection').style.display = '';
  document.getElementById('profileDeleteConfirm').value = '';
  document.getElementById('profileDeleteStatus').textContent = '';
}

function deleteAccountCancel() {
  document.getElementById('profileDeleteSection').style.display = 'none';
  document.getElementById('profileDeleteConfirm').value = '';
  document.getElementById('profileDeleteStatus').textContent = '';
}

async function deleteAccountStep2() {
  const confirmText = document.getElementById('profileDeleteConfirm').value.trim();
  const status = document.getElementById('profileDeleteStatus');

  if (confirmText !== 'DELETE') {
    status.textContent = 'Please type DELETE to confirm.';
    status.style.color = 'var(--red)';
    return;
  }

  try {
    if (currentUser.providerData[0].providerId === 'password') {
      const pw = prompt('Enter your password to re-authenticate:');
      if (!pw) return;
      const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, pw);
      await currentUser.reauthenticateWithCredential(cred);
    } else {
      const provider = new firebase.auth.GoogleAuthProvider();
      await currentUser.reauthenticateWithPopup(provider);
    }
    await db.collection('configs').doc(currentUser.uid).delete();
    await db.collection('status').doc(currentUser.uid).delete();
    await db.collection('profiles').doc(currentUser.uid).delete();
    await currentUser.delete();
    showToast('Account deleted.', 'info');
  } catch (e) {
    if (e.code === 'auth/requires-recent-login') {
      status.textContent = 'Please re-authenticate and try again.';
    } else {
      status.textContent = e.message;
    }
    status.style.color = 'var(--red)';
  }
}
