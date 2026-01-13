export interface AvatarProps {
  initials?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  gradient?: string;
  className?: string;
}

const sizeStyles = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-12 h-12 text-sm',
  lg: 'w-16 h-16 text-base',
  xl: 'w-20 h-20 text-lg',
};

const defaultGradients = [
  'from-purple-400 to-pink-400',
  'from-blue-400 to-cyan-400',
  'from-orange-400 to-yellow-400',
  'from-green-400 to-emerald-400',
  'from-red-400 to-rose-400',
  'from-lime to-lavender',
];

export const Avatar = ({
  initials = 'U',
  size = 'md',
  gradient,
  className = '',
}: AvatarProps) => {
  const randomGradient = gradient || defaultGradients[Math.floor(Math.random() * defaultGradients.length)];

  return (
    <div
      className={`
        ${sizeStyles[size]}
        rounded-full
        bg-gradient-to-br ${randomGradient}
        flex items-center justify-center
        text-white font-bold
        ${className}
      `}
    >
      {initials}
    </div>
  );
};
