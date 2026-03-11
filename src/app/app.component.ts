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
      // Inicializar push notifications solo en dispositivo nativo
      this.pushService.init();

      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive && this.authService.estaLogueado()) {
          this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
            this.router.navigate([this.ultimaRuta]);
          });
        }
      });
    }
  }
}