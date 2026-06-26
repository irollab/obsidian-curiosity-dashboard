export interface HttpResponse {
  status: number;
  text: string;
}

export interface HttpRequestOptions {
  timeoutMs?: number;
}

export interface HttpClient {
  get(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
}
