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
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { AuthService } from './auth';

@Injectable({ providedIn: 'root' })
export class PushNotificationsService {

  private inicializado = false;
  private localNotifId = 1000;
  private tokenPendiente: string | null = null; // token en espera de JWT

  constructor(
    private router: Router,
    private http: HttpClient,
    private authService: AuthService
  ) {}

  async init() {
    const permStatus = await PushNotifications.requestPermissions();
    if (permStatus.receive !== 'granted') {
      console.warn('Permiso push denegado');
      return;
    }

    await LocalNotifications.requestPermissions();

    if (!this.inicializado) {
      this.inicializado = true;

      await LocalNotifications.createChannel({
        id: 'ordenes',
        name: 'Órdenes',
        description: 'Notificaciones de nuevas órdenes',
        importance: 5,
        sound: 'default',
        vibration: true,
        visibility: 1,
      });

      LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        if (action.notification.extra?.tipo === 'nueva_orden') {
          this.router.navigate(['/tabs/tab2']);
        }
      });

      PushNotifications.addListener('registration', (token: Token) => {
        console.log('FCM Token obtenido:', token.value.substring(0, 20) + '...');
        // Intentar registrar — si no hay sesión, guardar para después
        if (this.authService.estaLogueado()) {
          this.registrarToken(token.value);
        } else {
          console.warn('FCM: sin sesión, guardando token para cuando haya JWT...');
          this.tokenPendiente = token.value;
        }
      });

      PushNotifications.addListener('registrationError', (err) => {
        console.error('Error registro FCM:', err);
      });

      PushNotifications.addListener(
        'pushNotificationReceived',
        async (notification: PushNotificationSchema) => {
          console.log('Push foreground recibida:', notification);
          await LocalNotifications.schedule({
            notifications: [{
              id: this.localNotifId++,
              title: notification.title || 'Nueva notificación',
              body: notification.body || '',
              channelId: 'ordenes',
              extra: notification.data,
              smallIcon: 'ic_stat_icon_config_sample',
              sound: 'default',
              actionTypeId: '',
              schedule: { at: new Date(Date.now() + 100) },
            } as LocalNotificationSchema],
          });
        }
      );

      PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (action: ActionPerformed) => {
          if (action.notification.data?.tipo === 'nueva_orden') {
            this.router.navigate(['/tabs/tab2']);
          }
        }
      );
    }

    await PushNotifications.register();
  }

  // Llamar esto después de que el usuario inicia sesión
  // para registrar el token pendiente si lo hay
  registrarTokenPendiente() {
    if (this.tokenPendiente && this.authService.estaLogueado()) {
      console.log('FCM: registrando token pendiente...');
      this.registrarToken(this.tokenPendiente);
      this.tokenPendiente = null;
    }
  }

  private registrarToken(token: string) {
    const url = `${environment.apiUrl}/api/v1/fcm/token`;
    console.log('FCM: registrando en backend...');
    this.http
      .post(url, { token })
      .subscribe({
        next: () => console.log('Token FCM registrado ✓'),
        error: (e) => console.error('Error registrando token FCM:', e.status, JSON.stringify(e.error)),
      });
  }

  async eliminarToken() {
    try {
      await PushNotifications.removeAllDeliveredNotifications();
      await LocalNotifications.removeAllDeliveredNotifications();
    } catch (e) {}
  }
}