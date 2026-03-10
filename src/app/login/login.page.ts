import { Component, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { Router } from '@angular/router';
import { LoginModalComponent } from '../login-modal/login-modal.component';
import { AuthService } from '../services/auth';

@Component({
  standalone: false,
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage implements OnInit {

  constructor(
    private modalCtrl: ModalController,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit() {
    if (this.authService.estaLogueado()) {
      this.router.navigate(['/tabs/tab1'], { replaceUrl: true });
    }
  }

  async abrirLogin() {
    const modal = await this.modalCtrl.create({
      component: LoginModalComponent,
      breakpoints: [0, 0.55],
      initialBreakpoint: 0.55,
      backdropDismiss: true,
      cssClass: 'login-modal'
    });
    await modal.present();
  }
}