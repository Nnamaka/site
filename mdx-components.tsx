import type { MDXComponents } from 'mdx/types'
import TeX from '@matejmazur/react-katex';
import 'katex/dist/katex.min.css';
 
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
  }
}