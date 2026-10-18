import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ProductCard from '../components/ProductCard';
import { PostCover } from '../components/PostCover';
import type { ShopProductRef } from '../schemas/shopBlocks';

const product = {slug:'test',title:'Service',url:'/product/test',imageUrl:'/service.webp',teaser:'Scope',offers:[]} as unknown as ShopProductRef;
describe('responsive image attributes', () => {
  it('passes descriptions and size hints through both image renderers', () => {
    const image={alt:'Illustrative service scene',width:1440,height:960,srcSet:'/small.webp 480w, /large.webp 1440w',sizes:'50vw',loading:'eager' as const,fetchPriority:'high' as const};
    for(const html of [renderToStaticMarkup(<ProductCard product={product} image={image}/>),renderToStaticMarkup(<PostCover slug="test" coverHint="/service.webp" image={image}/> )]) {
      expect(html).toContain('alt="Illustrative service scene"');
      expect(html).toContain('width="1440"');
      expect(html).toContain('srcSet="/small.webp 480w, /large.webp 1440w"');
      expect(html).toContain('loading="eager"');
    }
  });
  it('preserves default descriptions and the abstract fallback', () => {
    expect(renderToStaticMarkup(<ProductCard product={product}/>)).toContain('alt="Service"');
    expect(renderToStaticMarkup(<PostCover slug="test" image={{width:100}}/>)).not.toContain('<img');
  });
});
