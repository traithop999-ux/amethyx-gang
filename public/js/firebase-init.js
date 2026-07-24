import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-analytics.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDuxrI5JtdUksqG1VCdIHyoG-DD4aLt8fA',
  authDomain: 'amethyx-gang.firebaseapp.com',
  projectId: 'amethyx-gang',
  storageBucket: 'amethyx-gang.firebasestorage.app',
  messagingSenderId: '830829509412',
  appId: '1:830829509412:web:986929a62fd601133211b1',
  measurementId: 'G-KGHEZ8CXQ8'
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

console.log('Firebase initialized', app.name);
export { app, analytics };
