import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-menu-lateral',
  templateUrl: './menu-lateral.component.html',
  styleUrls: ['./menu-lateral.component.scss'],
  standalone: false,
})
export class MenuLateralComponent {
  @Input() abierto = false;
  @Input() paginaActiva = ''; // 'tab1' | 'tab2' | 'tab3' | 'clientes' | 'historial' | 'inventario' | 'caja' | 'notas'
  @Input() usuarioActual = '';
  @Output() cerrar = new EventEmitter<void>();

  constructor(public router: Router, private authService: AuthService) {}

  cerrarMenu() { this.cerrar.emit(); }

  navegar(ruta: string) {
    this.cerrarMenu();
    this.router.navigate([ruta]);
  }

  cerrarSesion() {
    this.authService.logout();
    this.cerrarMenu();
    this.router.navigate(['/login']);
  }

  esActivo(pagina: string): boolean {
    return this.paginaActiva === pagina;
  }
}