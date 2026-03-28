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

  constructor(private router: Router) { }

  tabCambiada(event: any) {
    this.tabActiva = event.tab;
  }

  irA(tab: string) {
    this.tabActiva = tab;
    this.router.navigate([`/tabs/${tab}`]);
  }
}