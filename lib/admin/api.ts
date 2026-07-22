import type { NextApiRequest } from 'next';

export const readRawRequestBody = async (request: NextApiRequest): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

export const parseQueryString = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return String(value[0] ?? '').trim();
  }
  return String(value ?? '').trim();
};

export const parseNullableQueryString = (value: string | string[] | undefined): string | null => {
  const parsed = parseQueryString(value);
  return parsed || null;
};

export const parseJsonBody = <T>(value: unknown): T => value as T;
