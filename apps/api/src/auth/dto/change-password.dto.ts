import { IsExistingPassword, IsNewPassword } from '../../common/password-policy.js';

export class ChangePasswordDto {
  @IsExistingPassword()
  currentPassword: string;

  @IsNewPassword()
  newPassword: string;
}
