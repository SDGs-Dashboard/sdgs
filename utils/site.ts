// Site deployment helpers.
// GitHub Pages serves this project under /sdgs, so static assets need the
// configured base path while local development should keep plain root paths.
const PUBLIC_BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || '').trim();

export const isStaticExport = process.env.NEXT_PUBLIC_STATIC_EXPORT === 'true';

export const withBasePath = (pathname: string): string => {
  if (!pathname.startsWith('/')) {
    return pathname;
  }

  if (!PUBLIC_BASE_PATH) {
    return pathname;
  }

  return `${PUBLIC_BASE_PATH}${pathname}`;
};
