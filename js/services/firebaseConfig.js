// js/services/firebaseConfig.js

// Importamos los SDKs necesarios desde la CDN oficial estable para producción
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

// Inicializamos la instancia global de Firebase
const app = initializeApp(firebaseConfig);

// Exportamos las herramientas listas para usar en la capa Service y Controller
export const db = getFirestore(app);
export const auth = getAuth(app);