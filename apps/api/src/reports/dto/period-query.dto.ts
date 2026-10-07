import { IsCalendarDate } from '../../common/calendar-date.js';
import { IsOptionalNotNull } from '../../common/validation.js';

/** Periode laporan; keduanya boleh dikosongkan (lihat `resolvePeriod`). */
export class PeriodQueryDto {
  @IsOptionalNotNull()
  @IsCalendarDate()
  from?: string;

  @IsOptionalNotNull()
  @IsCalendarDate()
  to?: string;
}
