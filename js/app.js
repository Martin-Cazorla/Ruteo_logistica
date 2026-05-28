// js/app.js
import { AuthService } from './services/authService.js';
import { store } from './state/store.js';

class App {
  constructor() {
    this.init();
  }

  init() {
    // Escucha global del estado de autenticación perimetral
    AuthService.onAuthStateChanged((user) => {
      if (user) {
        store.setState({ user, isAuthenticated: true });
        this.handlePostLoginRouting();
      } else {
        store.setState({ user: null, isAuthenticated: false });
        this.handleProtectRoutes();
      }
    });
  }

  handlePostLoginRouting() {
    const path = window.location.pathname;
    if (path.includes('login.html')) {
      window.location.replace('dashboard.html');
    }
  }

  handleProtectRoutes() {
    const path = window.location.pathname;
    // Si no está logueado y no está ya en la ruta de login, forzar redirección limpia
    if (!path.includes('login.html') && path !== '/' && !path.endsWith('index.html')) {
      window.location.replace('login.html');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new App();
});