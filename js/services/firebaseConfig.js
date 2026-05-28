// js/services/firebaseConfig.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

// Credenciales oficiales del proyecto Martinez Routing
const firebaseConfig = {
  apiKey: "AIzaSyCwG_biKIh93N6rLHCeWEDgkDZaB6axw0A",
  authDomain: "martinez-routing.firebaseapp.com",
  projectId: "martinez-routing",
  storageBucket: "martinez-routing.firebasestorage.app",
  messagingSenderId: "665194343163",
  appId: "1:665194343163:web:22fbebab95658299899e5e"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);