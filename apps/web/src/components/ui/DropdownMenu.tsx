import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { forwardRef, ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { Check, ChevronRight } from 'lucide-react';

interface DropdownMenuTriggerProps extends DropdownMenuPrimitive.DropdownMenuTriggerProps {
  children: ReactNode;
  className?: string;
}

export const DropdownMenuTrigger = forwardRef<HTMLButtonElement, DropdownMenuTriggerProps>(
  ({ className, children, ...props }, ref) => (
    <DropdownMenuPrimitive.Trigger ref={ref} className={cn('inline-flex items-center', className)} {...props}>
      {children}
    </DropdownMenuPrimitive.Trigger>
  )
);

DropdownMenuTrigger.displayName = 'DropdownMenuTrigger';

interface DropdownMenuContentProps extends DropdownMenuPrimitive.DropdownMenuContentProps {
  className?: string;
}

export const DropdownMenuContent = forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  ({ className, sideOffset = 5, ...props }, ref) => (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        className={cn(
          'bg-white border border-surface-200 rounded-lg shadow-lg p-1 min-w-[180px] animate-in',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
          className
        )}
        sideOffset={sideOffset}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
);

DropdownMenuContent.displayName = 'DropdownMenuContent';

interface DropdownMenuItemProps extends DropdownMenuPrimitive.DropdownMenuItemProps {
  children: ReactNode;
  shortcut?: string;
  icon?: ReactNode;
  className?: string;
  disabled?: boolean;
}

export const DropdownMenuItem = forwardRef<HTMLDivElement, DropdownMenuItemProps>(
  ({ className, children, shortcut, icon, disabled, onSelect, ...props }, ref) => (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex items-center px-3 py-2 text-sm rounded-md transition-fast',
        'text-surface-700 hover:bg-surface-100 focus:bg-surface-100 focus:outline-none',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
      disabled={disabled}
      onSelect={onSelect}
      {...props}
    >
      {icon && <span className="mr-2 flex h-4 w-4">{icon}</span>}
      <span className="flex-1">{children}</span>
      {shortcut && (
        <span className="ml-2 text-xs text-surface-400 font-mono">{shortcut}</span>
      )}
    </DropdownMenuPrimitive.Item>
  )
);

DropdownMenuItem.displayName = 'DropdownMenuItem';

interface DropdownMenuCheckboxItemProps extends DropdownMenuPrimitive.DropdownMenuCheckboxItemProps {
  children: ReactNode;
  className?: string;
}

export const DropdownMenuCheckboxItem = forwardRef<HTMLDivElement, DropdownMenuCheckboxItemProps>(
  ({ className, children, checked, ...props }, ref) => (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(
        'relative flex items-center px-3 py-2 text-sm rounded-md transition-fast',
        'text-surface-700 hover:bg-surface-100 focus:bg-surface-100 focus:outline-none',
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="h-4 w-4 text-primary-600" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      <span className="pl-8 flex-1">{children}</span>
    </DropdownMenuPrimitive.CheckboxItem>
  )
);

DropdownMenuCheckboxItem.displayName = 'DropdownMenuCheckboxItem';

interface DropdownMenuRadioGroupProps extends DropdownMenuPrimitive.DropdownMenuRadioGroupProps {
  children: ReactNode;
}

export const DropdownMenuRadioGroup = forwardRef<HTMLDivElement, DropdownMenuRadioGroupProps>(
  ({ className, children, ...props }, ref) => (
    <DropdownMenuPrimitive.RadioGroup ref={ref} className={cn(className)} {...props}>
      {children}
    </DropdownMenuPrimitive.RadioGroup>
  )
);

DropdownMenuRadioGroup.displayName = 'DropdownMenuRadioGroup';

interface DropdownMenuRadioItemProps extends DropdownMenuPrimitive.DropdownMenuRadioItemProps {
  children: ReactNode;
  className?: string;
}

export const DropdownMenuRadioItem = forwardRef<HTMLDivElement, DropdownMenuRadioItemProps>(
  ({ className, children, ...props }, ref) => (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      className={cn(
        'relative flex items-center px-3 py-2 text-sm rounded-md transition-fast',
        'text-surface-700 hover:bg-surface-100 focus:bg-surface-100 focus:outline-none',
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <div className="h-2 w-2 rounded-full bg-primary-600" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      <span className="pl-8 flex-1">{children}</span>
    </DropdownMenuPrimitive.RadioItem>
  )
);

DropdownMenuRadioItem.displayName = 'DropdownMenuRadioItem';

export const DropdownMenuSeparator = forwardRef<HTMLDivElement, DropdownMenuPrimitive.DropdownMenuSeparatorProps>(
  ({ className, ...props }, ref) => (
    <DropdownMenuPrimitive.Separator ref={ref} className={cn('h-px bg-surface-200 my-1', className)} {...props} />
  )
);

DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

interface DropdownMenuSubTriggerProps extends DropdownMenuPrimitive.DropdownMenuSubTriggerProps {
  children: ReactNode;
  className?: string;
}

export const DropdownMenuSubTrigger = forwardRef<HTMLDivElement, DropdownMenuSubTriggerProps>(
  ({ className, children, ...props }, ref) => (
    <DropdownMenuPrimitive.SubTrigger
      ref={ref}
      className={cn(
        'relative flex items-center px-3 py-2 text-sm rounded-md transition-fast',
        'text-surface-700 hover:bg-surface-100 focus:bg-surface-100 focus:outline-none',
        className
      )}
      {...props}
    >
      <span className="flex-1">{children}</span>
      <ChevronRight className="ml-2 h-4 w-4 text-surface-400" />
    </DropdownMenuPrimitive.SubTrigger>
  )
);

DropdownMenuSubTrigger.displayName = 'DropdownMenuSubTrigger';

interface DropdownMenuSubContentProps extends DropdownMenuPrimitive.DropdownMenuSubContentProps {
  className?: string;
}

export const DropdownMenuSubContent = forwardRef<HTMLDivElement, DropdownMenuSubContentProps>(
  ({ className, ...props }, ref) => (
    <DropdownMenuPrimitive.SubContent
      ref={ref}
      className={cn(
        'bg-white border border-surface-200 rounded-lg shadow-lg p-1 min-w-[180px] animate-in',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        className
      )}
      {...props}
    />
  )
);

DropdownMenuSubContent.displayName = 'DropdownMenuSubContent';

export const DropdownMenuRoot = DropdownMenuPrimitive.Root;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuLabel = DropdownMenuPrimitive.Label;
export const DropdownMenuArrow = DropdownMenuPrimitive.Arrow;
export const DropdownMenuItemIndicator = DropdownMenuPrimitive.ItemIndicator;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;
export const DropdownMenu = DropdownMenuPrimitive.Root;
