import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { CajaPage } from './caja.page';
import { SharedModule } from '../components/shared.module';

@NgModule({
  imports: [
    CommonModule, FormsModule, IonicModule,
    RouterModule.forChild([{ path: '', component: CajaPage }]),
    SharedModule,
  ],
  declarations: [CajaPage]
})
export class CajaPageModule {}