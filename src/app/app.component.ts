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

    console.log('APP: isNativePlatform =', Capacitor.isNativePlatform());
    console.log('APP: estaLogueado =', this.authService.estaLogueado());

    if (Capacitor.isNativePlatform()) {
      console.log('APP: agendando inicializarPush en 1s...');
      setTimeout(() => {
        console.log('APP: setTimeout ejecutado, llamando inicializarPush...');
        this.inicializarPush();
      }, 1000);

      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive && this.authService.estaLogueado()) {
          this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
            this.router.navigate([this.ultimaRuta]);
          });
        }
      });
    }
  }

  private async inicializarPush() {
    console.log('APP: inicializarPush() llamado');
    console.log('APP: estaLogueado =', this.authService.estaLogueado());
    console.log('APP: JWT =', this.authService.getToken() ? 'EXISTE' : 'NULL');

    try {
      await this.pushService.init();
      console.log('APP: pushService.init() completado');
    } catch (e) {
      console.error('APP: pushService.init() ERROR:', e);
    }
  }
} 