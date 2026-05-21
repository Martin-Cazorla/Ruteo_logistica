// js/utils/authGuard.js
import { auth } from '../services/firebaseConfig.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

/**
 * Verifica el estado de autenticación activa.
 * Si el usuario no está logueado, redirige a la pantalla de login.
 * @param {string} relativePathToLogin Ruta relativa para encontrar la página de login (ej: 'pages/login.html' o 'login.html')
 */
export function checkAuthGuard(relativePathToLogin) {
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            console.warn("Acceso no autorizado detectado. Redirigiendo a zona segura.");
            window.location.href = relativePathToLogin;
        } else {
            console.log(`Sesión operativa válida: ${user.email}`);
        }
    });
}