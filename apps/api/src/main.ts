import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

// Rede de segurança de último recurso — fora do ciclo de vida do Nest (boot,
// crons, qualquer coisa não prevista). Usa console puro de propósito: não deve
// depender de nada que também possa estar quebrado.
process.on('uncaughtException', (e) => {
  console.error('uncaughtException', e);
  // Estado indefinido depois disto — melhor deixar o orquestrador reiniciar limpo.
  process.exit(1);
});
process.on('unhandledRejection', (e) => {
  console.error('unhandledRejection', e);
});

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet());
  app.disable('x-powered-by');

  // Loga toda resposta fora de 2xx/304. Sem isto, um 4xx silencioso (validação
  // recusada, rate limit) nunca aparece no log e vira "o app não salva".
  const httpLogger = new Logger('HTTP');
  app.use((req: any, res: any, next: () => void) => {
    res.on('finish', () => {
      const { statusCode } = res;
      if (statusCode !== 304 && (statusCode < 200 || statusCode >= 300)) {
        httpLogger.warn(`${req.method} ${req.originalUrl} → ${statusCode}`);
      }
    });
    next();
  });

  // Atrás de proxy: usa X-Forwarded-For para o IP real. Sem isto o rate limit
  // trata todos os usuários como um único IP e barra o app inteiro.
  app.set('trust proxy', true);

  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  const webOrigin = config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';
  app.enableCors({ origin: webOrigin.split(','), credentials: true });

  const port = config.get<number>('API_PORT') ?? 3333;
  await app.listen(port);

  /**
   * Diz em voz alta como o cookie vai sair.
   *
   * A combinação errada não dá erro em lugar nenhum: o login responde 200, o
   * navegador descarta o cookie calado e TODA chamada seguinte volta "Token de
   * autenticação ausente". Sem esta linha, o único jeito de saber se a variável
   * pegou era abrir o DevTools e ler o `set-cookie` — e o palpite mais provável
   * ("o código quebrou") é justamente o errado.
   */
  const entreSites = config.get<string>('COOKIE_CROSS_SITE') === '1';
  const externas = webOrigin.split(',').filter((o) => !/localhost|127\.0\.0\.1/.test(o));

  console.log(`API ouvindo em http://localhost:${port}/api`);
  console.log(
    `Cookie de sessão: SameSite=${entreSites ? 'None; Secure' : 'Lax'} · WEB_ORIGIN: ${webOrigin}`,
  );
  if (externas.length && !entreSites) {
    console.warn(
      `⚠  ${externas.join(', ')} está no WEB_ORIGIN, mas o cookie é SameSite=Lax: o navegador ` +
        'NÃO vai mandá-lo de outro site, e toda chamada volta 401 depois de um login que deu 200. ' +
        'Ligue COOKIE_CROSS_SITE=1 em apps/api/.env (e reinicie) se o front fala direto com a API.',
    );
  }
}

bootstrap().catch((e) => {
  console.error('Falha ao iniciar a API', e);
  process.exit(1);
});
