import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsString,
  MaxLength,
} from 'class-validator';
import { NormalizeEmail } from '../../common/email.js';
import { IsName } from '../../common/name.js';
import { PaginationQueryDto } from '../../common/pagination.js';
import { IsNewPassword } from '../../common/password-policy.js';
import { ToBoolean, Trim } from '../../common/transforms.js';
import { IsOptionalNotNull } from '../../common/validation.js';
import { Role } from '../../generated/prisma/client.js';

const ROLES = Object.values(Role);

export class CreateUserDto {
  @IsName()
  name: string;

  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsIn(ROLES)
  role: Role;

  @IsNewPassword()
  password: string;
}

export class UpdateUserDto {
  @IsOptionalNotNull()
  @IsName()
  name?: string;

  @IsOptionalNotNull()
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptionalNotNull()
  @IsIn(ROLES)
  role?: Role;

  @IsOptionalNotNull()
  @IsBoolean()
  isActive?: boolean;
}

export class ResetPasswordDto {
  @IsNewPassword()
  newPassword: string;
}

export class ListUsersQueryDto extends PaginationQueryDto {
  @IsOptionalNotNull()
  @Trim()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptionalNotNull()
  @IsIn(ROLES)
  role?: Role;

  @IsOptionalNotNull()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}
