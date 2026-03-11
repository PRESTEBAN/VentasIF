import { Injectable } from '@angular/core';
import {
  PushNotifications,
  Token,
  PushNotificationSchema,
  ActionPerformed,
} from '@capacitor/push-notifications';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { AuthService } from './auth';

@Injectable({ providedIn: 'root' })
export class PushNotificationsService {
  constructor(
    private router: Router,
    private http: HttpClient,
    private authService: AuthService
  ) {}

  async init() {
    // Solicitar permiso (Android 13+ lo muestra como diálogo)
    const permStatus = await PushNotifications.requestPermissions();
    if (permStatus.receive !== 'granted') {
      console.warn('Permiso de notificaciones denegado');
      return;
    }

    // Registrar el dispositivo en FCM
    await PushNotifications.register();

    // Token generado por FCM → enviarlo al backend
    PushNotifications.addListener('registration', (token: Token) => {
      console.log('FCM Token:', token.value);
      this.registrarToken(token.value);
    });

    // Error al registrar
    PushNotifications.addListener('registrationError', (err) => {
      console.error('Error registro FCM:', err);
    });

    // Notificación recibida con la app ABIERTA (foreground)
    PushNotifications.addListener(
      'pushNotificationReceived',
      (notification: PushNotificationSchema) => {
        console.log('Push recibida en foreground:', notification);
        // La notificación llega silenciosa en foreground en Android
        // El usuario la verá en la barra de notificaciones igual
      }
    );

    // Usuario tapea la notificación (app en background o cerrada)
    PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (action: ActionPerformed) => {
        const data = action.notification.data;
        if (data?.tipo === 'nueva_orden') {
          this.router.navigate(['/tabs/tab2']); // navega a Órdenes
        }
      }
    );
  }

  private registrarToken(token: string) {
    const headers = new HttpHeaders({
      Authorization: `Bearer ${this.authService.getToken()}`,
    });
    this.http
      .post(
        `${environment.apiUrl}/api/v1/fcm/token`,
        { token },
        { headers }
      )
      .subscribe({
        next: () => console.log('Token FCM registrado en backend'),
        error: (e) => console.error('Error registrando token FCM:', e),
      });
  }

  // Llamar al cerrar sesión para eliminar el token del backend
  async eliminarToken() {
    try {
      const result = await PushNotifications.getDeliveredNotifications();
      // Limpiar notificaciones pendientes en la bandeja
      await PushNotifications.removeAllDeliveredNotifications();
    } catch (e) {}
  }
}