/// <reference types="vite/client" />

declare module '*.css' {
  const content: string
  export default content
}

declare module '*.svg' {
  const content: string
  export default content
}

import type { JSX as ReactJSX } from 'react'

declare global {
  // React 19 把 JSX 命名空间收敛到 React.JSX，这里补回全局声明以便直接使用 JSX.Element
  namespace JSX {
    type Element = ReactJSX.Element
    type ElementClass = ReactJSX.ElementClass
    type ElementType = ReactJSX.ElementType
    interface IntrinsicElements extends ReactJSX.IntrinsicElements {}
    interface IntrinsicAttributes extends ReactJSX.IntrinsicAttributes {}
    interface ElementChildrenAttribute extends ReactJSX.ElementChildrenAttribute {}
  }
}
