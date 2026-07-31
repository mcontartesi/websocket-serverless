export class DurableObject<Env = any> {
  ctx: any;
  env: Env;

  constructor(ctx: any, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}
