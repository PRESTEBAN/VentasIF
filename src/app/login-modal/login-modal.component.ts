import { Component, OnInit } from '@angular/core';
import { AlertController, ModalController } from '@ionic/angular';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { PushNotificationsService } from '../services/push-notifications';

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
  errorGeneral: string = '';
  cargando: boolean = false;

  constructor(
    private modalCtrl: ModalController,
    private router: Router,
    private authService: AuthService,
    private alertCtrl: AlertController,
    private pushService: PushNotificationsService
  ) { }

  ngOnInit() { }

  togglePassword() {
    this.mostrarPassword = !this.mostrarPassword;
  }

  limitarPassword(event: any) {
    const valor = event.target.value;
    this.password = valor.replace(/[^0-9]/g, '').slice(0, 4);
    event.target.value = this.password;
  }

  login() {
    this.errorUsuario = '';
    this.errorPassword = '';
    this.errorGeneral = '';

    let valido = true;

    if (this.usuario.trim() === '') {
      this.errorUsuario = 'Ingresa tu usuario';
      valido = false;
    } else if (!/^[A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ0-9]+$/.test(this.usuario.trim())) {
      this.errorUsuario = 'Formato incorrecto. Ej: EGarcia';
      valido = false;
    }

    if (this.password.trim() === '') {
      this.errorPassword = 'Ingresa tu contraseña';
      valido = false;
    } else if (!/^\d{4}$/.test(this.password)) {
      this.errorPassword = 'La contraseña debe ser exactamente 4 dígitos';
      valido = false;
    }

    if (!valido) return;

    this.cargando = true;

    this.authService.login(this.usuario.trim(), this.password).subscribe({
      next: (res) => {
        this.cargando = false;
        this.authService.guardarSesion(res);
        this.modalCtrl.dismiss({ usuario: res.usuario });
        this.router.navigate(['/tabs/tab1']);

        // ── Registrar token FCM pendiente ahora que hay JWT ──────────────
        this.pushService.intentarRegistrar();
      },
      error: async (err) => {
        this.cargando = false;
        if (err.status === 401) {
          const alert = await this.alertCtrl.create({
            header: 'Credenciales incorrectas',
            message: 'Usuario o contraseña incorrectos, intenta de nuevo.',
            buttons: ['OK'],
            cssClass: 'alert-personalizado'
          });
          await alert.present();
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