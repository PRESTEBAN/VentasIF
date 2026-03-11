import { Injectable } from '@angular/core';
import {
  PushNotifications,
  Token,
  PushNotificationSchema,
  ActionPerformed,
} from '@capacitor/push-notifications';
import {
  LocalNotifications,
  LocalNotificationSchema,
} from '@capacitor/local-notifications';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { AuthService } from './auth';

@Injectable({ providedIn: 'root' })
export class PushNotificationsService {

  private localNotifId = 1000; // ID incremental para notificaciones locales

  constructor(
    private router: Router,
    private http: HttpClient,
    private authService: AuthService
  ) {}

  async init() {
    // ── Permisos push ────────────────────────────────────────────────────
    const permStatus = await PushNotifications.requestPermissions();
    if (permStatus.receive !== 'granted') {
      console.warn('Permiso de notificaciones denegado');
      return;
    }

    // ── Permisos local notifications (Android 13+) ───────────────────────
    const localPerm = await LocalNotifications.requestPermissions();
    if (localPerm.display !== 'granted') {
      console.warn('Permiso local notifications denegado');
    }

    // ── Crear canal Android para notificaciones locales ──────────────────
    await LocalNotifications.createChannel({
      id: 'ordenes',
      name: 'Órdenes',
      description: 'Notificaciones de nuevas órdenes',
      importance: 5,        // IMPORTANCE_HIGH → hace sonar y aparece en pantalla
      sound: 'default',
      vibration: true,
      visibility: 1,
    });

    // ── Listener: tap en notificación local → navegar a Órdenes ─────────
    LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (action) => {
        const data = action.notification.extra;
        if (data?.tipo === 'nueva_orden') {
          this.router.navigate(['/tabs/tab2']);
        }
      }
    );

    // ── Registrar dispositivo en FCM ─────────────────────────────────────
    await PushNotifications.register();

    PushNotifications.addListener('registration', (token: Token) => {
      console.log('FCM Token:', token.value);
      this.registrarToken(token.value);
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('Error registro FCM:', err);
    });

    // ── FOREGROUND: FCM llega silenciosa → disparar notificación local ───
    PushNotifications.addListener(
      'pushNotificationReceived',
      async (notification: PushNotificationSchema) => {
        console.log('Push recibida en foreground:', notification);

        const id = this.localNotifId++;

        await LocalNotifications.schedule({
          notifications: [
            {
              id,
              title: notification.title || 'Nueva notificación',
              body: notification.body || '',
              channelId: 'ordenes',
              extra: notification.data,           // para la navegación al tapear
              smallIcon: 'ic_stat_icon_config_sample', // icono blanco en la barra
              sound: 'default',
              actionTypeId: '',
              schedule: { at: new Date(Date.now() + 100) }, // casi inmediata
            } as LocalNotificationSchema,
          ],
        });
      }
    );

    // ── BACKGROUND / KILLED: usuario tapea la push de FCM ───────────────
    PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (action: ActionPerformed) => {
        const data = action.notification.data;
        if (data?.tipo === 'nueva_orden') {
          this.router.navigate(['/tabs/tab2']);
        }
      }
    );
  }

  private registrarToken(token: string) {
    const headers = new HttpHeaders({
      Authorization: `Bearer ${this.authService.getToken()}`,
    });
    this.http
      .post(`${environment.apiUrl}/api/fcm/token`, { token }, { headers })
      .subscribe({
        next: () => console.log('Token FCM registrado en backend'),
        error: (e) => console.error('Error registrando token FCM:', e),
      });
  }

  async eliminarToken() {
    try {
      await PushNotifications.removeAllDeliveredNotifications();
      await LocalNotifications.removeAllDeliveredNotifications();
    } catch (e) {}
  }
}