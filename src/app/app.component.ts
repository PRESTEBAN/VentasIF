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
  ) {}

  ngOnInit() {
    if ((window as any).cordova) {
      document.addEventListener('deviceready', () => {
        this.printerService.intentarReconectar();
      }, false);
    } else {
      this.printerService.intentarReconectar();
    }

    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.ultimaRuta = event.urlAfterRedirects;
    });

    if (Capacitor.isNativePlatform()) {
      // Inicializar push inmediatamente — los listeners se registran
      // aunque no haya sesión todavía
      this.pushService.init();

      // Después de 2s intentar registrar token pendiente
      // (por si FCM devolvió el token antes de que cargara la sesión)
      setTimeout(() => {
        this.pushService.registrarTokenPendiente();
      }, 2000);

      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive && this.authService.estaLogueado()) {
          // Al volver del background, registrar token pendiente si hay
          this.pushService.registrarTokenPendiente();
          this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
            this.router.navigate([this.ultimaRuta]);
          });
        }
      });
    }
  }
}