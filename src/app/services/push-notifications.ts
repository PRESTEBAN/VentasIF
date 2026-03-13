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
  private ultimoToken: string | null = null;
  private registrado = false; // evita registrar múltiples veces seguidas

  constructor(
    private router: Router,
    private http: HttpClient,
    private authService: AuthService
  ) {}

async init() {
  try {
    const permStatus = await PushNotifications.requestPermissions();
    if (permStatus.receive !== 'granted') {
      console.warn('Permiso push denegado');
      return;
    }

    await LocalNotifications.requestPermissions();

    if (!this.inicializado) {
      this.inicializado = true;

      try {
        await LocalNotifications.createChannel({
          id: 'ordenes',
          name: 'Órdenes',
          description: 'Notificaciones de nuevas órdenes',
          importance: 5,
          sound: 'default',
          vibration: true,
          visibility: 1,
        });
      } catch (e) {
        console.warn('FCM: error creando canal:', e);
      }

      LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        if (action.notification.extra?.tipo === 'nueva_orden') {
          this.router.navigate(['/tabs/tab2']);
        }
      });

      PushNotifications.addListener('registration', (token: Token) => {
        console.log('FCM Token obtenido:', token.value.substring(0, 20) + '...');
        this.ultimoToken = token.value;
        this.registrado = false;
        this.intentarRegistrar();
      });

      PushNotifications.addListener('registrationError', (err) => {
        console.error('Error registro FCM:', err);
        // No relanzar — solo loguear
      });

      PushNotifications.addListener(
        'pushNotificationReceived',
        async (notification: PushNotificationSchema) => {
          try {
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
          } catch (e) {
            console.warn('FCM: error mostrando notificación local:', e);
          }
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

      let intentos = 0;
      const intervaloArranque = setInterval(() => {
        intentos++;
        if (this.registrado || intentos >= 10) {
          clearInterval(intervaloArranque);
          return;
        }
        this.intentarRegistrar();
      }, 5000);

      setInterval(() => {
        this.registrado = false;
        this.intentarRegistrar();
      }, 30 * 60 * 1000);
    }

    await PushNotifications.register();

  } catch (e) {
    // ← ESTO ES LO MÁS IMPORTANTE
    // Si Firebase no está configurado o cualquier otra cosa falla,
    // la app NO crashea — simplemente las notificaciones no funcionan
    console.error('FCM: error en init(), notificaciones desactivadas:', e);
  }
}

  // Llamar después del login o al volver del background
  intentarRegistrar() {
    if (!this.ultimoToken) {
      console.warn('FCM: no hay token aún');
      return;
    }
    if (!this.authService.estaLogueado()) {
      console.warn('FCM: sin sesión, se registrará después del login');
      return;
    }
    this.registrarToken(this.ultimoToken);
  }

  private registrarToken(token: string) {
    const url = `${environment.apiUrl}/api/v1/fcm/token`;
    this.http
      .post(url, { token })
      .subscribe({
        next: () => {
          console.log('Token FCM registrado ✓');
          this.registrado = true;
        },
        error: (e) => {
          console.error('Error registrando token FCM:', e.status, JSON.stringify(e.error));
          this.registrado = false;
        },
      });
  }

  async eliminarToken() {
    try {
      await PushNotifications.removeAllDeliveredNotifications();
      await LocalNotifications.removeAllDeliveredNotifications();
    } catch (e) {}
  }
}