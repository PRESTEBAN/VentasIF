import { Injectable } from '@angular/core';
import { BleClient, ScanResult } from '@capacitor-community/bluetooth-le';

const SPP_SERVICE    = '49535343-fe7d-4ae5-8fa9-9fafd205e455';
const SPP_WRITE_CHAR = '49535343-1e4d-4bd9-ba61-23c647249616';

@Injectable({ providedIn: 'root' })
export class PrinterService {

  private impresora: { id: string; name: string } | null = null;
  private deviceId: string | null = null;

  get dispositivoConectado() { return this.impresora; }

  async inicializar(): Promise<void> {
    await BleClient.initialize({ androidNeverForLocation: true });
  }

  async escanearDispositivos(): Promise<any[]> {
    const devices: any[] = [];
    try {
      await this.inicializar();
      await BleClient.requestLEScan({ allowDuplicates: false }, (result: ScanResult) => {
        const existe = devices.find((d: any) => d.address === result.device.deviceId);
        if (!existe) {
          devices.push({ address: result.device.deviceId, name: result.device.name || 'Desconocido' });
        }
      });
      await new Promise(resolve => setTimeout(resolve, 4000));
      await BleClient.stopLEScan();
    } catch (e) { console.error('Error escaneando:', e); }
    return devices;
  }

  async conectar(address: string, name: string): Promise<void> {
    await this.inicializar();
    await BleClient.connect(address);
    this.deviceId  = address;
    this.impresora = { id: address, name };
  }

  async desconectar(): Promise<void> {
    try { if (this.deviceId) await BleClient.disconnect(this.deviceId); } catch {}
    this.impresora = null;
    this.deviceId  = null;
  }

  async estaConectado(): Promise<boolean> {
    if (!this.deviceId) return false;
    try {
      const result = await BleClient.getConnectedDevices([]);
      return result.some((d: any) => d.deviceId === this.deviceId);
    } catch { return false; }
  }

  async descubrirServicios(): Promise<string> {
    if (!this.deviceId) return 'Sin dispositivo conectado';
    try {
      const services = await BleClient.getServices(this.deviceId);
      let info = '';
      for (const service of services) {
        info += `SERVICE: ${service.uuid}\n`;
        for (const char of service.characteristics) {
          info += `  CHAR: ${char.uuid} props: ${JSON.stringify(char.properties)}\n`;
        }
      }
      return info || 'Sin servicios encontrados';
    } catch (e: any) {
      return `Error: ${e.message}`;
    }
  }

  async imprimirRecibo(datos: DatosRecibo): Promise<void> {
    const conectado = await this.estaConectado();
    if (!conectado) throw new Error('Impresora no conectada');

    const ESC      = '\x1B';
    const LF       = '\n';
    const BOLD_ON  = ESC + 'E\x01';
    const BOLD_OFF = ESC + 'E\x00';
    const CENTER   = ESC + 'a\x01';
    const LEFT     = ESC + 'a\x00';
    const CUT      = ESC + 'm';
    const ANCHO    = 32;
    const LINEA    = '-'.repeat(ANCHO);

    const col2 = (izq: string, der: string): string => {
      return izq + ' '.repeat(Math.max(1, ANCHO - izq.length - der.length)) + der;
    };

    const ahora = new Date();
    const fecha = `${ahora.getDate().toString().padStart(2,'0')}/${(ahora.getMonth()+1).toString().padStart(2,'0')}/${ahora.getFullYear()}`;
    const hora  = `${ahora.getHours().toString().padStart(2,'0')}:${ahora.getMinutes().toString().padStart(2,'0')}`;

    let t = '';
    t += CENTER + BOLD_ON + 'INDUSTRIAL FATIMA' + LF + BOLD_OFF;
    t += 'Recibo de Venta' + LF + LINEA + LF + LEFT;
    t += col2('Fecha:', fecha) + LF;
    t += col2('Hora:',  hora)  + LF;
    t += col2('Cliente:', datos.clienteNombre.substring(0, 20)) + LF;
    if (datos.clienteCedula) t += col2('C.I.:', datos.clienteCedula) + LF;
    t += LINEA + LF;
    t += BOLD_ON + col2('PRODUCTO', 'SUBTOTAL') + BOLD_OFF + LF + LINEA + LF;

    datos.items.forEach((item: any) => {
      const nombre = item.nombre.length > ANCHO ? item.nombre.substring(0, ANCHO - 3) + '...' : item.nombre;
      t += nombre + LF;
      t += col2(`  ${item.cantidad} x $${item.precio_unitario.toFixed(2)}`, `$${item.subtotal.toFixed(2)}`) + LF;
      if (item.descuento > 0) t += col2('  Desc:', `-${item.descuento}%`) + LF;
    });

    t += LINEA + LF;
    t += col2('Subtotal:', `$${datos.subtotal.toFixed(2)}`) + LF;
    if (datos.descuento > 0) t += col2('Descuento:', `-$${datos.descuento.toFixed(2)}`) + LF;
    if (datos.iva > 0)       t += col2(`IVA (${datos.ivaPercent}%):`, `$${datos.iva.toFixed(2)}`) + LF;
    t += BOLD_ON + col2('TOTAL:', `$${datos.total.toFixed(2)}`) + BOLD_OFF + LF + LINEA + LF;
    t += col2('Forma de pago:', datos.formaPago) + LF;
    if (datos.formaPago === 'Efectivo' && datos.montoRecibido) {
      t += col2('Recibido:', `$${datos.montoRecibido.toFixed(2)}`) + LF;
      t += col2('Vuelto:',   `$${datos.vuelto.toFixed(2)}`)        + LF;
    }
    t += LINEA + LF + CENTER + '¡Gracias por su compra!' + LF + 'Industrial Fatima' + LF;
    t += LF + LF + LF + CUT;

    const encoder  = new TextEncoder();
    const bytes    = encoder.encode(t);
    const CHUNK    = 20;

    for (let i = 0; i < bytes.length; i += CHUNK) {
      const chunk    = bytes.slice(i, i + CHUNK);
      const dataView = new DataView(chunk.buffer);
      await BleClient.writeWithoutResponse(this.deviceId!, SPP_SERVICE, SPP_WRITE_CHAR, dataView);
      await new Promise(r => setTimeout(r, 50));
    }
  }
}

export interface DatosRecibo {
  clienteNombre:  string;
  clienteCedula?: string;
  items: {
    nombre:          string;
    cantidad:        number;
    precio_unitario: number;
    descuento:       number;
    subtotal:        number;
  }[];
  subtotal:      number;
  descuento:     number;
  iva:           number;
  ivaPercent:    number;
  total:         number;
  formaPago:     string;
  montoRecibido: number;
  vuelto:        number;
}