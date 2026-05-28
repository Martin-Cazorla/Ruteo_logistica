// js/controllers/loginController.js
import { AuthService } from '../services/authService.js';

class LoginController {
    constructor() {
        this.form = document.getElementById('form-login');
        this.emailInput = document.getElementById('login-email');
        this.passwordInput = document.getElementById('login-password');
        this.errorContainer = document.getElementById('login-error-msg');
        this.submitBtn = document.getElementById('btn-login-submit');

        this.init();
    }

    init() {
        if (!this.form) return;
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    /**
     * Procesa el formulario corporativo e inicia sesión mediante la abstracción de AuthService
     * @param {Event} event 
     */
    async handleSubmit(event) {
        event.preventDefault();
        
        this.hideError();

        const email = this.emailInput.value.trim();
        const password = this.passwordInput.value;

        if (!this.validateInputs(email, password)) {
            return;
        }

        this.setLoading(true);

        try {
            await AuthService.login(email, password);
            // Reemplazamos el historial de navegación para evitar bucles hacia atrás post-login
            window.location.replace('dashboard.html');
        } catch (error) {
            this.handleAuthErrors(error.code || error.message);
            this.setLoading(false);
        }
    }

    /**
     * Validaciones previas de formato del cliente antes de disparar la red
     */
    validateInputs(email, password) {
        if (!email || !password) {
            this.showError("Todos los campos operativos de seguridad son obligatorios.");
            return false;
        }
        return true;
    }

    /**
     * Mapea códigos de error nativos de Firebase sin exponer datos internos
     * @param {string} errorCode 
     */
    handleAuthErrors(errorCode) {
        let message = "Ocurrió un error inesperado. Verifique su conexión de red.";
        
        switch (errorCode) {
            case 'auth/invalid-email':
                message = "El formato del correo electrónico corporativo no es válido.";
                this.emailInput.setAttribute('aria-invalid', 'true');
                break;
            case 'auth/user-disabled':
                message = "Este operador técnico se encuentra suspendido del ecosistema.";
                break;
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                message = "Credenciales incorrectas. Verifique usuario y contraseña de seguridad.";
                this.emailInput.setAttribute('aria-invalid', 'true');
                this.passwordInput.setAttribute('aria-invalid', 'true');
                break;
            case 'auth/too-many-requests':
                message = "Acceso bloqueado temporalmente por demasiados intentos fallidos corporativos.";
                break;
        }

        this.showError(message);
    }

    /**
     * Despliega visual y semánticamente el mensaje de error
     * @param {string} text 
     */
    showError(text) {
        this.errorContainer.textContent = text;
        this.errorContainer.setAttribute('aria-hidden', 'false');
        
        // Asociamos dinámicamente los elementos con error para tecnologías de asistencia
        this.emailInput.setAttribute('aria-describedby', 'login-error-msg');
        this.passwordInput.setAttribute('aria-describedby', 'login-error-msg');
    }

    /**
     * Limpia de forma segura el contenedor de errores
     */
    hideError() {
        this.errorContainer.textContent = '';
        this.errorContainer.setAttribute('aria-hidden', 'true');
        this.emailInput.removeAttribute('aria-invalid');
        this.passwordInput.removeAttribute('aria-invalid');
        this.emailInput.removeAttribute('aria-describedby');
        this.passwordInput.removeAttribute('aria-describedby');
    }

    /**
     * Controla el estado del botón evitando doble envío
     * @param {boolean} isLoading 
     */
    setLoading(isLoading) {
        if (isLoading) {
            this.submitBtn.disabled = true;
            this.submitBtn.textContent = "Verificando firmas perimetrales...";
        } else {
            this.submitBtn.disabled = false;
            this.submitBtn.textContent = "Validar Credenciales";
        }
    }
}

// Inicialización controlada
document.addEventListener('DOMContentLoaded', () => {
    new LoginController();
});