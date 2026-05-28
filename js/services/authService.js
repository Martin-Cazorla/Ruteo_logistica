// js/services/authService.js
import { auth } from './firebaseConfig.js';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

export class AuthService {
  /**
   * Identifica un usuario con sus credenciales corporativas
   * @param {string} email 
   * @param {string} password 
   * @returns {Promise<import("https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js").UserCredential>}
   */
  static async login(email, password) {
    try {
      return await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Cierra la sesión activa en el cliente corporativo
   * @returns {Promise<void>}
   */
  static async logout() {
    try {
      return await signOut(auth);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Suscriptor reactivo al cambio de estado de la sesión
   * @param {function} callback 
   * @returns {import("https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js").Unsubscribe}
   */
  static onAuthStateChanged(callback) {
    return onAuthStateChanged(auth, callback);
  }

  /**
   * Obtiene de forma síncrona el operador logístico actual si está autenticado
   */
  static getCurrentUser() {
    return auth.currentUser;
  }
}