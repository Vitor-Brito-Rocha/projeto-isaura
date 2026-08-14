import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca uma rota como pública (dispensa JWT). Ex.: login, cadastro, health. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
