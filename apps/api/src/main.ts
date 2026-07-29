import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { loadAppConfig } from "@class-reflect/config";

async function bootstrap() {
  const config = loadAppConfig();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true })
  );

  app.enableCors({
    origin: config.frontendOrigin,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-workspace-id"]
  });

  await app.listen({ host: "0.0.0.0", port: config.port });
}

void bootstrap();
