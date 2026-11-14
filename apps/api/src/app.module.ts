import { Inject, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { ControlController } from './control.controller';
import { ControlService } from './control.service';
import { DatabaseService } from './database.service';
import { SettingsService } from './settings.service';
import { SigningService } from './signing.service';

@Injectable()
export class BootstrapService implements OnModuleInit {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(SigningService) private readonly signing: SigningService,
    @Inject(ControlService) private readonly control: ControlService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.db.init();
    await this.signing.init();
    await this.control.seed();
    if (this.control.bootstrapFile) {
      console.log('First owner password written to ' + this.control.bootstrapFile);
    }
  }
}

@Module({
  controllers: [ControlController],
  providers: [DatabaseService, SettingsService, SigningService, ControlService, BootstrapService],
})
export class AppModule {}
