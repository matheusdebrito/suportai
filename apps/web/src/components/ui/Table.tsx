import { forwardRef, ReactNode, TableHTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  children: ReactNode;
  className?: string;
}

export const Table = forwardRef<HTMLTableElement, TableProps>(
  ({ className, children, ...props }, ref) => (
    <div className="overflow-x-auto">
      <table
        ref={ref}
        className={cn('w-full text-sm text-left', className)}
        {...props}
      >
        {children}
      </table>
    </div>
  )
);

Table.displayName = 'Table';

interface TableHeaderProps {
  children: ReactNode;
  className?: string;
}

export function TableHeader({ children, className }: TableHeaderProps) {
  return (
    <thead className={cn('bg-surface-50 border-b border-surface-200', className)}>
      {children}
    </thead>
  );
}

interface TableBodyProps {
  children: ReactNode;
  className?: string;
}

export function TableBody({ children, className }: TableBodyProps) {
  return <tbody className={cn('divide-y divide-surface-200', className)}>{children}</tbody>;
}

interface TableRowProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  selected?: boolean;
}

export function TableRow({ children, className, hover = true, selected }: TableRowProps) {
  return (
    <tr
      className={cn(
        'transition-fast',
        hover && 'hover:bg-surface-50',
        selected && 'bg-primary-50',
        className
      )}
    >
      {children}
    </tr>
  );
}

interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {
  children: ReactNode;
  className?: string;
}

export const TableHead = forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, children, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'px-4 py-3 font-medium text-surface-500 uppercase tracking-wider text-xs',
        className
      )}
      {...props}
    >
      {children}
    </th>
  )
);

TableHead.displayName = 'TableHead';

interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  children: ReactNode;
  className?: string;
}

export const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, children, ...props }, ref) => (
    <td
      ref={ref}
      className={cn('px-4 py-3 text-surface-900', className)}
      {...props}
    >
      {children}
    </td>
  )
);

TableCell.displayName = 'TableCell';

interface TableFooterProps {
  children: ReactNode;
  className?: string;
}

export function TableFooter({ children, className }: TableFooterProps) {
  return (
    <tfoot className={cn('bg-surface-50 border-t border-surface-200', className)}>
      {children}
    </tfoot>
  );
}

export const TableContainer = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn('overflow-x-auto rounded-lg border border-surface-200', className)}>
    {children}
  </div>
);
