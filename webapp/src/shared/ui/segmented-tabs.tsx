import type { ComponentPropsWithoutRef, ElementRef } from 'react';
import { forwardRef } from 'react';
import { TabsList, TabsTrigger } from './tabs';
import { cn } from '@/shared/lib/utils';

export const SegmentedTabsList = forwardRef<
  ElementRef<typeof TabsList>,
  ComponentPropsWithoutRef<typeof TabsList>
>(({ className, ...props }, ref) => (
  <TabsList
    ref={ref}
    className={cn('mb-4 grid w-full rounded-2xl p-1', className)}
    {...props}
  />
));
SegmentedTabsList.displayName = 'SegmentedTabsList';

export const SegmentedTabsTrigger = forwardRef<
  ElementRef<typeof TabsTrigger>,
  ComponentPropsWithoutRef<typeof TabsTrigger>
>(({ className, ...props }, ref) => (
  <TabsTrigger
    ref={ref}
    className={cn('min-h-[var(--touch-target)] gap-2 rounded-xl py-2', className)}
    {...props}
  />
));
SegmentedTabsTrigger.displayName = 'SegmentedTabsTrigger';
