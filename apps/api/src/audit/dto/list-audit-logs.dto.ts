import { IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { IsCalendarDate } from '../../common/calendar-date.js';
import { PaginationQueryDto } from '../../common/pagination.js';
import { IsOptionalNotNull } from '../../common/validation.js';

const NAME_MAX = 50;
const ENTITY_ID_MAX = 100;

export class ListAuditLogsQueryDto extends PaginationQueryDto {
  /** Jenis data, mis. `transaction`, `account`, `user`. */
  @IsOptionalNotNull()
  @Matches(/^[a-z_]+$/, { message: 'entityType tidak valid' })
  @MaxLength(NAME_MAX)
  entityType?: string;

  @IsOptionalNotNull()
  @IsString()
  @MaxLength(ENTITY_ID_MAX)
  entityId?: string;

  @IsOptionalNotNull()
  @IsUUID()
  userId?: string;

  /** Mis. `LOGIN`, `APPROVE`. */
  @IsOptionalNotNull()
  @Matches(/^[A-Z_]+$/, { message: 'action tidak valid' })
  @MaxLength(NAME_MAX)
  action?: string;

  /** Hari kalender Jakarta, kedua ujungnya ikut dihitung. */
  @IsOptionalNotNull()
  @IsCalendarDate()
  dateFrom?: string;

  @IsOptionalNotNull()
  @IsCalendarDate()
  dateTo?: string;
}
