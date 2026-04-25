declare module 'google-news-url-decoder' {
  interface DecodeSuccess {
    status: true;
    decoded_url: string;
  }

  interface DecodeFailure {
    status: false;
    message: string;
  }

  type DecodeResult = DecodeSuccess | DecodeFailure;

  export class GoogleDecoder {
    constructor(proxy?: string | null);
    decode(sourceUrl: string): Promise<DecodeResult>;
    decodeBatch(sourceUrls: string[]): Promise<Array<DecodeResult & { source_url?: string }>>;
  }
}
