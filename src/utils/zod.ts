import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

// Registers `.openapi(...)` on every Zod schema. Every schema file must import `z` from here
// (not directly from 'zod') so this patch has definitely run before `.openapi()` is called at
// module-load time, regardless of require order.
extendZodWithOpenApi(z);

export { z };
