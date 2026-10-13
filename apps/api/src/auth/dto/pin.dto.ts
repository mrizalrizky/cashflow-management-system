import { IsPin } from '../../common/pin-policy.js';

export class SetupPinDto {
  @IsPin()
  pin: string;
}

export class LoginDto {
  @IsPin()
  pin: string;
}

export class ChangePinDto {
  @IsPin()
  currentPin: string;

  @IsPin()
  newPin: string;
}
