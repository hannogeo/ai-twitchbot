const firebaseConfig = {
  apiKey: 'AIzaSyCOnqZ7UR7tsusyJgWFvbIwLJUxSi6SqKA',
  authDomain: 'ai-twitchbot.firebaseapp.com',
  projectId: 'ai-twitchbot',
  storageBucket: 'ai-twitchbot.firebasestorage.app',
  messagingSenderId: '447271419284',
  appId: '1:447271419284:web:10b04648720525ac416381',
  measurementId: 'G-Y0SL4RPN4G',
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

if (typeof db.settings === 'function') {
  db.settings({ merge: true });
}
