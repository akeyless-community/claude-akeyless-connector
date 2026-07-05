declare module 'akeyless' {
  export class ApiClient {
    basePath: string;
  }

  export class V2Api {
    constructor(client: ApiClient);
    auth(body: unknown): Promise<{
      token?: string;
      expiration?: string;
      creds?: Record<string, unknown>;
    }>;
    listItems(body: unknown): Promise<{ items?: Array<Record<string, unknown>> }>;
  }

  export const Auth: {
    constructFromObject: (obj: Record<string, unknown>) => unknown;
  };
  export const ListItems: {
    constructFromObject: (obj: Record<string, unknown>) => unknown;
  };
}

declare module 'akeyless-cloud-id' {
  export function getCloudId(
    provider: string,
    param: string,
    callback: (err: Error | undefined, res: string | undefined) => void,
  ): void;
}
