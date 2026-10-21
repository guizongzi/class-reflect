import {ArgumentsHost,Catch,ExceptionFilter,HttpException} from '@nestjs/common';
import {classifyWorkflowFailure} from '@class-reflect/shared-types';
import {createLogger} from '@class-reflect/observability';
import {recordApiWorkflowFailure} from '@class-reflect/database';
@Catch()
export class WorkflowExceptionFilter implements ExceptionFilter{
 private readonly logger=createLogger('api.failure');
 async catch(error:unknown,host:ArgumentsHost){
  const http=host.switchToHttp();const request=http.getRequest();const response=http.getResponse();
  const status=error instanceof HttpException?error.getStatus():400===((error as any)?.status)?400:500;
  if(status<500 && error instanceof HttpException){return response.status(status).send({statusCode:status,message:status===404?'记录不存在':'请求未通过校验'});}
  if((error as any)?.name==='ZodError')return response.status(400).send({statusCode:400,message:'请求格式不正确'});
  const failure=classifyWorkflowFailure(error);
  const lessonId=String(request.params?.lessonId||'');
  let traceId:string|undefined;
  try{traceId=await recordApiWorkflowFailure(lessonId,failure);}catch{this.logger.error('failure audit unavailable',{kind:failure.kind,code:failure.code});}
  this.logger.error('api request failed',{kind:failure.kind,code:failure.code,traceId});
  return response.status(status).send({statusCode:status,errorKind:failure.kind,code:failure.code,message:failure.safeMessage,traceId});
 }
}
