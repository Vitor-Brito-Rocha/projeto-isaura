import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AgendaModule } from './agenda/agenda.module';
import { AlarmesModule } from './alarmes/alarmes.module';
import { AnexosModule } from './anexos/anexos.module';
import { AuthModule } from './auth/auth.module';
import { SupabaseJwtGuard } from './auth/supabase-jwt.guard';
import { CadeirasModule } from './cadeiras/cadeiras.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { ErrosModule } from './common/erros.module';
import { EscolasModule } from './escolas/escolas.module';
import { HealthController } from './health.controller';
import { IaModule } from './ia/ia.module';
import { JobsModule } from './jobs/jobs.module';
import { NotificacoesModule } from './notificacoes/notificacoes.module';
import { HistoricoModule } from './historico/historico.module';
import { PlanosModule } from './planos/planos.module';
import { ProgressoModule } from './progresso/progresso.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfessoresModule } from './professores/professores.module';
import { RegistrosModule } from './registros/registros.module';
import { PushModule } from './push/push.module';
import { SeriesModule } from './series/series.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // 100 req/min por IP. Rotas de auth apertam isso com @Throttle no controller.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    ErrosModule,
    AuthModule,
    ProfessoresModule,
    EscolasModule,
    CadeirasModule,
    PlanosModule,
    ProgressoModule,
    HistoricoModule,
    RegistrosModule,
    AnexosModule,
    IaModule,
    SeriesModule,
    AgendaModule,
    PushModule,
    NotificacoesModule,
    AlarmesModule,
    JobsModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    // Ordem importa: rate limit antes da autenticação, senão força bruta de
    // login consome verificação de JWT antes de ser barrada.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Guard GLOBAL: toda rota exige JWT, exceto as marcadas com @Public().
    // O padrão precisa ser "fechado" — num sistema multitenant, uma rota que
    // nasce aberta por esquecimento vaza dado entre contas.
    { provide: APP_GUARD, useClass: SupabaseJwtGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
