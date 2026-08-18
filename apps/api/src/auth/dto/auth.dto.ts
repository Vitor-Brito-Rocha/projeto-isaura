import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class SignupDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nome!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8, { message: 'A senha precisa ter ao menos 8 caracteres.' })
  @MaxLength(72) // limite do bcrypt no lado do Supabase
  senha!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  senha!: string;
}

export class RecuperarSenhaDto {
  @IsEmail()
  email!: string;
}

export class NovaSenhaDto {
  /** `token_hash` do link do email. Uso único, e a API o troca por sessão. */
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  codigo!: string;

  @IsString()
  @MinLength(8, { message: 'A senha precisa ter ao menos 8 caracteres.' })
  @MaxLength(72) // limite do bcrypt no lado do Supabase
  senha!: string;
}

export class ConfirmarEmailDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  codigo!: string;
}
