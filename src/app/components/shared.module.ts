import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { MenuLateralComponent } from './menu-lateral/menu-lateral.component';

@NgModule({
  declarations: [MenuLateralComponent],
  imports: [CommonModule, IonicModule, RouterModule],
  exports: [MenuLateralComponent],
})
export class SharedModule {}