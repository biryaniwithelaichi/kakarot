declare module 'react-window' {
  import * as React from 'react';

  export type ListChildComponentProps<T = any> = {
    index: number;
    style: React.CSSProperties;
    data: T;
    isScrolling?: boolean;
  };

  export type FixedSizeListProps<T = any> = {
    height: number;
    width: number;
    itemCount: number;
    itemSize: number;
    itemData?: T;
    itemKey?: (index: number, data: T) => React.Key;
    overscanCount?: number;
    children:
      | React.ComponentType<ListChildComponentProps<T>>
      | ((props: ListChildComponentProps<T>) => React.ReactNode);
  } & Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>;

  export class FixedSizeList<T = any> extends React.Component<FixedSizeListProps<T>> {}
}
