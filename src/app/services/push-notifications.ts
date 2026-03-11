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

  private inicializado = false;
  private localNotifId = 1000;

  constructor(
    private router: Router,
    private http: HttpClient,
    private authService: AuthService
  ) {}

  async init() {
    // Permisos push
    const permStatus = await PushNotifications.requestPermissions();
    if (permStatus.receive !== 'granted') {
      console.warn('Permiso push denegado');
      return;
    }

    // Permisos local notifications
    await LocalNotifications.requestPermissions();

    // Listeners y canal solo se crean UNA vez
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

      // Tap en notificación local → navegar a Órdenes
      LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        if (action.notification.extra?.tipo === 'nueva_orden') {
          this.router.navigate(['/tabs/tab2']);
        }
      });

      // Token FCM generado/rotado → registrar en backend
      PushNotifications.addListener('registration', (token: Token) => {
        console.log('FCM Token:', token.value.substring(0, 20) + '...');
        this.registrarToken(token.value);
      });

      PushNotifications.addListener('registrationError', (err) => {
        console.error('Error registro FCM:', err);
      });

      // App en FOREGROUND → FCM llega silenciosa → disparar notificación local nativa
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

      // App en BACKGROUND/KILLED → tap en notificación → navegar
      PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (action: ActionPerformed) => {
          if (action.notification.data?.tipo === 'nueva_orden') {
            this.router.navigate(['/tabs/tab2']);
          }
        }
      );
    }

    // Registrar en FCM — si el token cambió (reinstalación),
    // FCM dispara 'registration' con el token nuevo automáticamente
    await PushNotifications.register();
  }

  private registrarToken(token: string) {
    const jwtToken = this.authService.getToken();
    if (!jwtToken) {
      console.warn('FCM: sin JWT, token no registrado');
      return;
    }
    const headers = new HttpHeaders({ Authorization: `Bearer ${jwtToken}` });
    this.http
      .post(`${environment.apiUrl}/api/fcm/token`, { token }, { headers })
      .subscribe({
        next: () => console.log('Token FCM registrado ✓'),
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