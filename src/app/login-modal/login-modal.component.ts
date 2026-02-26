import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';

@Component({
  selector: 'app-login-modal',
  standalone: false,
  templateUrl: './login-modal.component.html',
  styleUrls: ['./login-modal.component.scss'],
})
export class LoginModalComponent implements OnInit {

  usuario: string = '';
  password: string = '';
  mostrarPassword: boolean = false;
  errorUsuario: string = '';
  errorPassword: string = '';
  errorGeneral: string = '';   // para errores del servidor (credenciales inválidas, etc.)
  cargando: boolean = false;

  constructor(
    private modalCtrl: ModalController,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit() {}

  togglePassword() {
    this.mostrarPassword = !this.mostrarPassword;
  }

  limitarPassword(event: any) {
    const valor = event.target.value;
    this.password = valor.replace(/[^0-9]/g, '').slice(0, 4);
    event.target.value = this.password;
  }

  login() {
    // Limpiar errores previos
    this.errorUsuario = '';
    this.errorPassword = '';
    this.errorGeneral = '';

    let valido = true;

    // ── Validar usuario ──────────────────────────────────────────────────────
    if (this.usuario.trim() === '') {
      this.errorUsuario = 'Ingresa tu usuario';
      valido = false;
    } else if (!/^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(this.usuario.trim())) {
      this.errorUsuario = 'Formato incorrecto. Ej: EGarcia';
      valido = false;
    }

    // ── Validar PIN ──────────────────────────────────────────────────────────
    if (this.password.trim() === '') {
      this.errorPassword = 'Ingresa tu contraseña';
      valido = false;
    } else if (!/^\d{4}$/.test(this.password)) {
      this.errorPassword = 'La contraseña debe ser exactamente 4 dígitos';
      valido = false;
    }

    if (!valido) return;

    // ── Llamada al backend ───────────────────────────────────────────────────
    this.cargando = true;

    this.authService.login(this.usuario.trim(), this.password).subscribe({
      next: (res) => {
        this.cargando = false;
        this.authService.guardarSesion(res);           // guarda token + usuario
        this.modalCtrl.dismiss({ usuario: res.usuario });
        this.router.navigate(['/tabs/tab1']);
      },
      error: (err) => {
        this.cargando = false;
        if (err.status === 401) {
          this.errorGeneral = 'Usuario o contraseña incorrectos';
        } else if (err.status === 0) {
          this.errorGeneral = 'No se pudo conectar con el servidor';
        } else {
          this.errorGeneral = 'Error inesperado. Intenta de nuevo';
        }
      }
    });
  }

  cerrar() {
    this.modalCtrl.dismiss();
  }
}