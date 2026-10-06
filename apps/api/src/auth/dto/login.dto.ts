import { IsEmail, MaxLength } from 'class-validator';
import { NormalizeEmail } from '../../common/email.js';
import { IsExistingPassword } from '../../common/password-policy.js';

export class LoginDto {
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsExistingPassword()
  password: string;
}
