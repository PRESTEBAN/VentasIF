import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';

@Component({
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  standalone: false,
})
export class Tab3Page implements OnInit {
  menuAbierto = false;
  usuarioActual: string = '';

  // ── Fecha ──
  diaSemana: string = '';
  fechaHoy: string = '';

  // ── Card 1: Resumen de ventas (se llenará desde el servicio) ──
  ventasRealizadas: number = 20;
  totalEfectivo: number = 300.0;
  totalTransferencias: number = 200.0;
  totalPendientes: number = 370.0;
  totalIngresosVentas: number = 500.0;

  // ── Card 2: Adelantos / Egresos ──
  adelantos: number = 20.0;
  egresos: number = 4.0;
  totalIngresosEgresos: number = 24.0;

  // ── Total general ──
  totalGeneral: number = 476.0;

  // ── Card 3: Desglose ──
  billetes: number | null = 260.6;
  monedas: number | null = 14.0;
  transferenciasDesglose: number | null = 200.0;
  totalDesglose: number = 0;

  // ── Modal resultado ──
  mostrarResultado = false;
  estadoCierre: 'cuadrado' | 'sobra' | 'falta' = 'cuadrado';
  diferencia: number = 0;

  constructor(
    public router: Router,
    private authService: AuthService,
  ) {}

  ngOnInit() {
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';
    this.setFecha();
    this.recalcularTotal();
  }

  setFecha() {
    const dias = [
      'Domingo',
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábado',
    ];
    const meses = [
      'enero',
      'febrero',
      'marzo',
      'abril',
      'mayo',
      'junio',
      'julio',
      'agosto',
      'septiembre',
      'octubre',
      'noviembre',
      'diciembre',
    ];
    const hoy = new Date();
    this.diaSemana = dias[hoy.getDay()];
    this.fechaHoy = `${hoy.getDate().toString().padStart(2, '0')}/${(hoy.getMonth() + 1).toString().padStart(2, '0')}/${hoy.getFullYear()}`;
  }

  recalcularTotal() {
    this.totalDesglose =
      (this.billetes || 0) +
      (this.monedas || 0) +
      (this.transferenciasDesglose || 0);
  }

  revisar() {
    // totalGeneral = lo que DEBERÍA haber en caja (ingresos - egresos)
    // totalDesglose = lo que el usuario contó físicamente
    const TOLERANCIA = 0.01; // centavos de redondeo
    const diff = this.totalDesglose - this.totalGeneral;

    if (Math.abs(diff) <= TOLERANCIA) {
      this.estadoCierre = 'cuadrado';
      this.diferencia = 0;
    } else if (diff > 0) {
      this.estadoCierre = 'sobra';
      this.diferencia = Math.abs(diff);
    } else {
      this.estadoCierre = 'falta';
      this.diferencia = Math.abs(diff);
    }

    this.mostrarResultado = true;
  }

  cerrarResultado() {
    this.mostrarResultado = false;
  }

  finalizarDia() {
    // TODO: llamar al servicio para registrar el cierre
    this.mostrarResultado = false;
    console.log(
      'Día finalizado. Estado:',
      this.estadoCierre,
      '| Diferencia:',
      this.diferencia,
    );
  }

  // ---- MENU ----

  irAClientes() {
    this.cerrarMenu();
    this.router.navigate(['/clientes']);
  }
  irAHistorial() {
    this.cerrarMenu();
    this.router.navigate(['/historial']);
  }
  irAInventario() {
    this.cerrarMenu();
    this.router.navigate(['/inventario']);
  }
  irAEgresos() {
    this.cerrarMenu();
    this.router.navigate(['/egresos']);
  }

  abrirMenu() {
    this.menuAbierto = true;
  }
  cerrarMenu() {
    this.menuAbierto = false;
  }

  cerrarSesion() {
    this.authService.logout();
    this.menuAbierto = false;
    this.router.navigate(['/login']);
  }
}
