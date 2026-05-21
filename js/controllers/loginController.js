// js/controllers/loginController.js
import { auth } from '../services/firebaseConfig.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

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
     * Procesa el formulario e inicia la negociación con Firebase Auth
     * @param {Event} event 
     */
    async handleSubmit(event) {
        event.preventDefault();
        
        // Limpiamos estados de error previos
        this.hideError();
        this.setLoading(true);

        const email = this.emailInput.value.trim();
        const password = this.passwordInput.value;

        try {
            // Firmar la sesión de forma persistente en el navegador
            await signInWithEmailAndPassword(auth, email, password);
            
            // Si la autenticación es correcta, redirigimos a la raíz (index.html)
            window.location.href = '../index.html';
        } catch (error) {
            console.error("Error en Firebase Authentication:", error.code, error.message);
            this.handleAuthErrors(error.code);
            this.setLoading(false);
        }
    }

    /**
     * Mapea los códigos de error nativos de Firebase a mensajes claros en español
     * @param {string} errorCode 
     */
    handleAuthErrors(errorCode) {
        let message = "Ocurrió un error inesperado. Verifique su conexión.";
        
        switch (errorCode) {
            case 'auth/invalid-email':
                message = "El formato del correo electrónico corporativo no es válido.";
                break;
            case 'auth/user-disabled':
                message = "Este operador técnico se encuentra suspendido del ecosistema.";
                break;
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-credential': // Códigos combinados en Firebase moderno por seguridad
                message = "Credenciales incorrectas. Verifique usuario y contraseña.";
                break;
            case 'auth/too-many-requests':
                message = "Acceso bloqueado temporalmente por demasiados intentos fallidos.";
                break;
        }

        this.showError(message);
    }

    showError(text) {
        this.errorContainer.textContent = text;
        this.errorContainer.style.display = 'block';
    }

    hideError() {
        this.errorContainer.textContent = '';
        this.errorContainer.style.display = 'none';
    }

    /**
     * Bloquea el botón de envío para evitar peticiones concurrentes
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

// Inicializamos el componente una vez que el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new LoginController();
});