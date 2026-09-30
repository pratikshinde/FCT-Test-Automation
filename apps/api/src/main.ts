import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix("v1");
  // Request validation is done per-route via the Zod-backed ZodBody pipe
  // (packages/contracts schemas), not class-validator DTOs.

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port, "0.0.0.0");
  console.log(`[api] listening on http://0.0.0.0:${port}/v1`);
}

bootstrap();
