import { route } from './router';
import type { Env } from './env';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return route(request, env);
  },
};
