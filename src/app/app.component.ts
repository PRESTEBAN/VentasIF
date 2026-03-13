import { Component, OnInit } from '@angular/core';
import { PrinterService } from './services/printer';
import { AuthService } from './services/auth';
import { PushNotificationsService } from './services/push-notifications';
import { Router, NavigationEnd } from '@angular/router';
import { App } from '@capacitor/app';
import { filter } from 'rxjs/operators';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  private ultimaRuta = '/tabs/tab1';

  constructor(
    private printerService: PrinterService,
    private authService: AuthService,
    private pushService: PushNotificationsService,
    private router: Router
  ) { }

  ngOnInit() {
    this.inicializarApp();
  }

  private inicializarApp() {
    if (this.authService.getRefreshToken() && this.authService.estaLogueado()) {
      this.authService.refreshToken().subscribe({
        next: (data) => {
          this.authService.guardarNuevoToken(data.token, data.refreshToken);
          console.log('✅ Token renovado al arrancar');
        },
        error: (e) => { 
          console.warn('⚠️ Refresh falló, interceptor se encargará');
        }
      });
    }

    // El resto de la inicialización NO espera al refresh
    if ((window as any).cordova) {
      document.addEventListener('deviceready', () => {
        this.printerService.intentarReconectar();
      }, false);
    } else {
      this.printerService.intentarReconectar();
    }

    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.ultimaRuta = event.urlAfterRedirects;
      });

    if (Capacitor.isNativePlatform()) {
      this.pushService.init().catch((e) => console.error('Push init error:', e));
      setTimeout(() => {
        try { this.pushService.intentarRegistrar(); } catch (e) { }
      }, 2000);
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          try { this.pushService.intentarRegistrar(); } catch (e) { }
        }
      });
    }
  }
}