import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { EgresosPageRoutingModule } from './egresos-routing.module';

import { EgresosPage } from './egresos.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    EgresosPageRoutingModule
  ],
  declarations: [EgresosPage]
})
export class EgresosPageModule {}
