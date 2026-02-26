import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: false,
})
export class TabsPage {
  tabActiva: string = 'tab1';
  private tabs = ['tab1', 'tab2', 'tab3'];
  private touchInicioX: number = 0;
  private touchInicioY: number = 0;

  constructor(private router: Router) { }

    tabCambiada(event: any) {
    this.tabActiva = event.tab;
  }

  irA(tab: string) {
    this.tabActiva = tab;
    this.router.navigate([`/tabs/${tab}`]);
  }

  swipeInicio(event: TouchEvent) {
    this.touchInicioX = event.touches[0].clientX;
    this.touchInicioY = event.touches[0].clientY;
  }

  swipeFin(event: TouchEvent) {
    const deltaX = event.changedTouches[0].clientX - this.touchInicioX;
    const deltaY = event.changedTouches[0].clientY - this.touchInicioY;

    if (Math.abs(deltaX) < Math.abs(deltaY)) return;

    if (Math.abs(deltaX) < 50) return;

    const indexActual = this.tabs.indexOf(this.tabActiva);

    if (deltaX < 0) {
      const siguiente = this.tabs[indexActual + 1];
      if (siguiente) this.irA(siguiente);
    } else {
      const anterior = this.tabs[indexActual - 1];
      if (anterior) this.irA(anterior);
    }
  }

}
