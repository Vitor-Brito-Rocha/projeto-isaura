import { Type } from 'class-transformer';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { TipoNotificacao } from '@prisma/client';

export class ChavesDto {
  @IsString()
  @MaxLength(200)
  p256dh!: string;

  @IsString()
  @MaxLength(200)
  auth!: string;
}

export class SubscribeDto {
  @IsString()
  @MaxLength(1000)
  endpoint!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => ChavesDto)
  keys!: ChavesDto;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  userAgent?: string;
}

export class UnsubscribeDto {
  @IsString()
  @MaxLength(1000)
  endpoint!: string;
}

export class TestePushDto {
  @IsOptional()
  @IsEnum(TipoNotificacao)
  tipo?: TipoNotificacao;
}
