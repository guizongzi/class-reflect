import {WorkflowExceptionFilter} from './common/workflow-exception.filter';
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { loadWorkflowConfig,loadAppConfig } from "@class-reflect/config";

async function bootstrap() {
  const config = loadAppConfig();
  loadWorkflowConfig();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true })
  );

  app.useGlobalFilters(new WorkflowExceptionFilter());
  app.enableCors({
    origin: config.frontendOrigin,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-workspace-id"]
  });

  await app.listen({ host: "0.0.0.0", port: config.port });
}

void bootstrap();
