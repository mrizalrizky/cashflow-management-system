import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { IsCalendarDate } from '../../common/calendar-date.js';
import { IsMoneyString } from '../../common/money.js';
import { IsName } from '../../common/name.js';
import { PaginationQueryDto } from '../../common/pagination.js';
import { Trim } from '../../common/transforms.js';
import { IsOptionalNotNull } from '../../common/validation.js';
import { ProjectStatus } from '../../generated/prisma/client.js';

const PROJECT_STATUSES = Object.values(ProjectStatus);
const NAME_MAX = 150;
const NOTES_MAX = 2000;
export const MAX_PROJECT_MEMBERS = 50;

// Catatan: `@IsOptional()` menerima null (untuk mengosongkan field yang memang boleh kosong),
// sedangkan `@IsOptionalNotNull()` hanya menerima "tidak dikirim".

export class CreateProjectDto {
  @IsName(NAME_MAX)
  name: string;

  @IsName(NAME_MAX)
  clientName: string;

  @IsOptionalNotNull()
  @IsMoneyString()
  contractValue?: string;

  @IsOptional()
  @IsCalendarDate()
  startDate?: string | null;

  @IsOptional()
  @IsCalendarDate()
  endDate?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(NOTES_MAX)
  notes?: string | null;
}

export class UpdateProjectDto {
  @IsOptionalNotNull()
  @IsName(NAME_MAX)
  name?: string;

  @IsOptionalNotNull()
  @IsName(NAME_MAX)
  clientName?: string;

  @IsOptionalNotNull()
  @IsMoneyString()
  contractValue?: string;

  @IsOptionalNotNull()
  @IsIn(PROJECT_STATUSES)
  status?: ProjectStatus;

  @IsOptional()
  @IsCalendarDate()
  startDate?: string | null;

  @IsOptional()
  @IsCalendarDate()
  endDate?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(NOTES_MAX)
  notes?: string | null;
}

export class ListProjectsQueryDto extends PaginationQueryDto {
  @IsOptionalNotNull()
  @Trim()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptionalNotNull()
  @IsIn(PROJECT_STATUSES)
  status?: ProjectStatus;
}

export class SetProjectMembersDto {
  @IsArray()
  @ArrayMaxSize(MAX_PROJECT_MEMBERS)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  userIds: string[];
}
