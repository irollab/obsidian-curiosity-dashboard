import { describe, expect, it } from 'vitest';
import { ObsidianHttpClient, type RequestUrlFn } from '@/adapters/obsidian-http-client';

describe('ObsidianHttpClient', () => {
  it('转发 url 并返回 status/text', async () => {
    const calls: string[] = [];
    const fn: RequestUrlFn = async (param) => {
      calls.push(typeof param === 'string' ? param : param.url);
      return { status: 200, text: 'hello' };
    };
    const client = new ObsidianHttpClient(fn);
    const res = await client.get('https://a');
    expect(res).toEqual({ status: 200, text: 'hello' });
    expect(calls).toEqual(['https://a']);
  });

  it('throw=false 让 4xx/5xx 也回传而非抛错', async () => {
    let received: unknown = null;
    const fn: RequestUrlFn = async (param) => {
      received = param;
      return { status: 404, text: 'nope' };
    };
    const res = await new ObsidianHttpClient(fn).get('https://a');
    expect(res.status).toBe(404);
    expect((received as { throw?: boolean }).throw).toBe(false);
  });
});
