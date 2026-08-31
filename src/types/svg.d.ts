/**
 * SVG module declarations for @svgr/webpack.
 * Lets TypeScript treat `import Icon from 'foo.svg'` as a React component.
 */
declare module '*.svg' {
  import React from 'react';
  const SVGComponent: React.ForwardRefExoticComponent<
    React.SVGProps<SVGSVGElement> & { title?: string; titleId?: string }
  >;
  export default SVGComponent;
}
