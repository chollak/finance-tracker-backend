import { Moon, Sun, Monitor } from 'lucide-react';
import { Button } from './button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './popover';
import { useTheme } from '@/shared/hooks';
import { cn } from '@/shared/lib';

/**
 * Theme toggle button with dropdown
 */
export function ThemeToggle() {
  const { theme, setTheme, isDark } = useTheme();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          aria-label="Переключить тему"
        >
          {isDark ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-36 p-1" align="end">
        <div className="flex flex-col gap-1">
          <Button
            variant={theme === 'light' ? 'secondary' : 'ghost'}
            size="sm"
            className={cn('justify-start', theme === 'light' && 'bg-accent')}
            onClick={() => setTheme('light')}
          >
            <Sun className="h-4 w-4 mr-2" />
            Светлая
          </Button>
          <Button
            variant={theme === 'dark' ? 'secondary' : 'ghost'}
            size="sm"
            className={cn('justify-start', theme === 'dark' && 'bg-accent')}
            onClick={() => setTheme('dark')}
          >
            <Moon className="h-4 w-4 mr-2" />
            Тёмная
          </Button>
          <Button
            variant={theme === 'system' ? 'secondary' : 'ghost'}
            size="sm"
            className={cn('justify-start', theme === 'system' && 'bg-accent')}
            onClick={() => setTheme('system')}
          >
            <Monitor className="h-4 w-4 mr-2" />
            Система
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
