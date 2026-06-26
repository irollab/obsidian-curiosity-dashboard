import type { HttpClient, HttpRequestOptions, HttpResponse } from '@/ports/http-client';

export interface RequestUrlParam {
  url: string;
  method?: string;
  throw?: boolean;
}

export type RequestUrlFn = (
  param: RequestUrlParam,
) => Promise<{ status: number; text: string }>;

export class ObsidianHttpClient implements HttpClient {
  constructor(private readonly requestUrl: RequestUrlFn) {}

  async get(url: string, _options: HttpRequestOptions = {}): Promise<HttpResponse> {
    const res = await this.requestUrl({ url, method: 'GET', throw: false });
    return { status: res.status, text: res.text };
  }
}
