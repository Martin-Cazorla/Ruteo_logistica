// js/utils/authGuard.js
import { store } from '../state/store.js';

/**
 * Intercepta de forma síncrona la navegación si no hay credenciales activas.
 * Evita la creación de observadores huérfanos por página.
 * @param {string} relativePathToLogin URL de la pantalla de login.
 */
export function checkAuthGuard(relativePathToLogin) {
    const { isAuthenticated } = store.getState();
    
    // Si la inicialización del store determina falta de privilegios, intercepta inmediatamente
    if (!isAuthenticated) {
        console.warn("Acceso restringido perimetral. Redirigiendo a consola de firmas.");
        window.location.replace(relativePathToLogin);
        return false;
    }
    return true;
}