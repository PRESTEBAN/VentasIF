import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ProductoService, Producto } from '../services/producto';
import { ClienteService, Cliente } from '../services/cliente';
import { AuthService } from '../services/auth';
import { InventarioService } from '../services/inventario';

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: false,
})
export class Tab1Page implements OnInit {

  menuAbierto = false;
  usuarioActual: string = '';

  busquedaCliente = '';
  errorCliente = '';
  clienteSeleccionado: Cliente | null = null;
  clientes: Cliente[] = [];

  mostrarAgregarCliente = false;
  nuevoCliente = {
    cedula: '', nombre: '', apellido: '',
    negocio: '', email: '', direccion: '',
    sector: '', telefono: '', esParticular: false
  };
  erroresCliente: any = {};
  guardandoCliente = false;

  mostrarProducto = false;
  productoSeleccionado: Producto | null = null;
  itemProducto = { cantidad: 0, precio: 0, descuento: 0, subtotal: 0, tipoPrecio: 'menor' };

  mostrarCarrito = false;
  carrito: any[] = [];
  formaPago = 'Efectivo';

  productos: Producto[] = [];
  cargandoProductos = false;
  ivaPercent: number = 15;

  constructor(
    public router: Router,
    private productoService: ProductoService,
    private clienteService: ClienteService,
    private authService: AuthService,
    private inventarioService: InventarioService
  ) { }

  ngOnInit() {
    this.cargarProductos();
    this.cargarClientes();
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';
  }

  cargarProductos() {
    this.cargandoProductos = true;
    this.productoService.getAll().subscribe({
      next: (data: Producto[]) => {
        const productosNormalizados = data.map(p => ({
          ...p,
          precio_x_mayor: +p.precio_x_mayor,
          precio_x_menor: +p.precio_x_menor,
          stock: 0
        }));
        this.inventarioService.getBodega().subscribe({
          next: (inventario) => {
            this.productos = productosNormalizados.map(p => {
              const inv = inventario.find(i => i.producto_id === p.id);
              return { ...p, stock: inv ? inv.stock_actual : 0 };
            });
            this.cargandoProductos = false;
          },
          error: () => {
            this.productos = productosNormalizados;
            this.cargandoProductos = false;
          }
        });
      },
      error: (err: any) => {
        console.error('Error cargando productos:', err);
        this.cargandoProductos = false;
      }
    });
  }

  cargarClientes() {
    this.clienteService.getAll().subscribe({
      next: (data: Cliente[]) => { this.clientes = data; },
      error: (err: any) => { console.error('Error cargando clientes:', err); }
    });
  }

  // ---- MENU ----
  abrirMenu() { this.menuAbierto = true; }
  cerrarMenu() { this.menuAbierto = false; }

  cerrarSesion() {
    this.authService.logout();
    this.menuAbierto = false;
    this.router.navigate(['/login']);
  }

  irAClientes() { this.cerrarMenu(); this.router.navigate(['/clientes']); }
  irAHistorial() { this.cerrarMenu(); this.router.navigate(['/historial']); }
  irAInventario() { this.cerrarMenu(); this.router.navigate(['/inventario']); }

  // ---- BUSCAR CLIENTE ----
  buscarCliente() {
    const valor = this.busquedaCliente.trim();
    const esCedula = /^\d{10}$/.test(valor);
    const esTexto = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s]{2,}$/.test(valor);

    if (!esCedula && !esTexto) {
      this.errorCliente = 'Ingresa una cédula (10 dígitos) o apellido válido';
      this.clienteSeleccionado = null;
      return;
    }

    const encontrado = this.clientes.find(c =>
      c.cedula === valor ||
      c.apellido.toLowerCase() === valor.toLowerCase() ||
      (c.nombre_negocio && c.nombre_negocio.toLowerCase().includes(valor.toLowerCase()))
    );

    if (encontrado) {
      this.clienteSeleccionado = encontrado;
      this.errorCliente = '';
    } else {
      this.clienteSeleccionado = null;
      this.errorCliente = 'Cliente no encontrado. Usa el botón + para registrarlo.';
    }
  }

  // ---- AGREGAR CLIENTE ----
  abrirAgregarCliente() { this.mostrarAgregarCliente = true; }

  cerrarAgregarCliente() {
    this.mostrarAgregarCliente = false;
    this.nuevoCliente = {
      cedula: '', nombre: '', apellido: '',
      negocio: '', email: '', direccion: '',
      sector: '', telefono: '', esParticular: false
    };
    this.erroresCliente = {};
  }

  guardarCliente() {
    this.erroresCliente = {};
    let valido = true;

    const cedula = this.nuevoCliente.cedula.trim();
    if (!cedula) {
      this.erroresCliente.cedula = 'La cédula es requerida';
      valido = false;
    } else if (/[^0-9]/.test(cedula)) {
      this.erroresCliente.cedula = 'La cédula solo debe contener números';
      valido = false;
    } else if (cedula.length !== 10) {
      this.erroresCliente.cedula = 'La cédula debe tener exactamente 10 dígitos';
      valido = false;
    }

    if (!this.nuevoCliente.nombre.trim() || !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{2,}$/.test(this.nuevoCliente.nombre)) {
      this.erroresCliente.nombre = 'Nombre inválido';
      valido = false;
    }

    if (!this.nuevoCliente.apellido.trim() || !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{2,}$/.test(this.nuevoCliente.apellido)) {
      this.erroresCliente.apellido = 'Apellido inválido';
      valido = false;
    }

    if (!this.nuevoCliente.direccion.trim() || this.nuevoCliente.direccion.trim().length < 5) {
      this.erroresCliente.direccion = 'Dirección requerida (mínimo 5 caracteres)';
      valido = false;
    }

    const tel = this.nuevoCliente.telefono.trim();
    if (!tel) {
      this.erroresCliente.telefono = 'El teléfono es requerido';
      valido = false;
    } else if (/[^0-9]/.test(tel)) {
      this.erroresCliente.telefono = 'El teléfono solo debe contener números';
      valido = false;
    } else if (tel.length !== 10 && tel.length !== 7) {
      this.erroresCliente.telefono = 'Ingresa un celular (10 dígitos) o fijo local (7 dígitos)';
      valido = false;
    }

    if (this.nuevoCliente.email) {
      if (!/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(this.nuevoCliente.email)) {
        this.erroresCliente.email = 'Email inválido (ej: nombre@dominio.com)';
        valido = false;
      }
    }

    if (!valido) return;

    const clientePayload: Cliente = {
      cedula: this.nuevoCliente.cedula.trim(),
      nombre: this.nuevoCliente.nombre.trim(),
      apellido: this.nuevoCliente.apellido.trim(),
      nombre_negocio: this.nuevoCliente.negocio.trim() || null,
      tipo_cliente: this.nuevoCliente.esParticular ? 'particular' : 'negocio',
      direccion: this.nuevoCliente.direccion.trim(),
      sector: this.nuevoCliente.sector.trim() || null,
      telefono: this.nuevoCliente.telefono.trim(),
      email: this.nuevoCliente.email.trim() || null,
      limite_credito: 0,
      notas: null,
    };

    this.guardandoCliente = true;
    this.clienteService.create(clientePayload).subscribe({
      next: () => {
        this.guardandoCliente = false;
        this.cargarClientes();
        this.cerrarAgregarCliente();
      },
      error: (err: any) => {
        this.guardandoCliente = false;
        if (err.status === 400) {
          this.erroresCliente.general = 'Datos inválidos, revisa los campos';
        } else {
          this.erroresCliente.general = 'Error al guardar, intenta de nuevo';
        }
      }
    });
  }

  // ---- PRODUCTO ----
  abrirProducto(producto: Producto) {
    if (!this.clienteSeleccionado) return;
    this.productoSeleccionado = producto;
    this.itemProducto = {
      cantidad: 0,
      precio: +producto.precio_x_menor,
      descuento: 0,
      subtotal: 0,
      tipoPrecio: 'menor'
    };
    this.mostrarProducto = true;
  }

  seleccionarTipoPrecio(tipo: 'mayor' | 'menor') {
    this.itemProducto.tipoPrecio = tipo;
    this.itemProducto.precio = tipo === 'mayor'
      ? +this.productoSeleccionado!.precio_x_mayor
      : +this.productoSeleccionado!.precio_x_menor;
    this.calcularSubtotal();
  }

  cerrarProducto() { this.mostrarProducto = false; }

  calcularSubtotal() {
    const base = this.itemProducto.cantidad * this.itemProducto.precio;
    this.itemProducto.subtotal = base - (base * this.itemProducto.descuento / 100);
  }

  agregarAlCarrito() {
    if (this.itemProducto.cantidad <= 0 || this.itemProducto.precio <= 0) return;
    this.carrito.push({
      producto_id: this.productoSeleccionado!.id,
      nombre: this.productoSeleccionado!.nombre,
      cantidad: this.itemProducto.cantidad,
      precio_unitario: this.itemProducto.precio,
      tipoPrecio: this.itemProducto.tipoPrecio,
      descuento: this.itemProducto.descuento,
      subtotal: this.itemProducto.subtotal
    });
    this.cerrarProducto();
  }

  // ---- CARRITO ----
  abrirCarrito() { this.mostrarCarrito = true; }
  cerrarCarrito() { this.mostrarCarrito = false; }



  calcularTotal() {
    const subtotal = this.carrito.reduce((acc, i) => acc + i.subtotal, 0);
    const descuento = this.carrito.reduce((acc, i) => acc + (i.cantidad * i.precio_unitario * i.descuento / 100), 0);
    const iva = subtotal * (this.ivaPercent / 100);
    return { subtotal, descuento, iva, total: subtotal + iva };
  }

  guardarPedido() { alert('Pedido guardado'); }


  eliminarDelCarrito(index: number) {
    this.carrito.splice(index, 1);
  }

  finalizarPedido() {
    this.carrito = [];
    this.clienteSeleccionado = null;
    this.busquedaCliente = '';
    this.cerrarCarrito();
  }
}