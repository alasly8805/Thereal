/**
 * SEO & OpenGraph Helper functions
 */

export interface PageMetadataOptions {
  title: string;
  description: string;
  url?: string;
  image?: string;
}

export function buildOgMetadata(options: PageMetadataOptions) {
  return {
    title: `${options.title} | Code-UP`,
    description: options.description,
    openGraph: {
      title: options.title,
      description: options.description,
      url: options.url,
      siteName: "Code-UP",
      images: options.image ? [{ url: options.image }] : [],
    },
  };
}
