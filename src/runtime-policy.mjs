// Legacy text mode must surface provider failures without hidden runtime retries.
// Native tool mode installs this policy in its own relay plugin.
export default {
  id: 'codex-bridge-request-policy',
  async setup(ctx) {
    await ctx.session.hook('retry', event => { event.decision = { retry: false }; });
  },
};
