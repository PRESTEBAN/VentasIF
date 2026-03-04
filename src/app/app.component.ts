import { Component, OnInit } from '@angular/core';
import { PrinterService } from './services/printer';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  constructor(private printerService: PrinterService) {}

  ngOnInit() {
    this.printerService.intentarReconectar();
  }
}