import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NormalizeEmail } from '../../common/email.js';
import { PaginationQueryDto } from '../../common/pagination.js';
import { IsNewPassword } from '../../common/password-policy.js';
import { ToBoolean, Trim } from '../../common/transforms.js';
import { Role } from '../../generated/prisma/client.js';

const ROLES = Object.values(Role);

export class CreateUserDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
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
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ResetPasswordDto {
  @IsNewPassword()
  newPassword: string;
}

export class ListUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}
