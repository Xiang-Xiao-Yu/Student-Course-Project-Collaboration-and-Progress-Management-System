import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE_METADATA = 'scpc:raw-response';

export const RawResponse = (): MethodDecorator => SetMetadata(RAW_RESPONSE_METADATA, true);
