import type { ImgHTMLAttributes } from 'react';

/** Browser image hints supplied by a trusted renderer, never image source replacement. */
export type ImageAttributes = Pick<ImgHTMLAttributes<HTMLImageElement>,
  'alt' | 'width' | 'height' | 'srcSet' | 'sizes' | 'loading' | 'decoding' | 'fetchPriority'>;
