import { useState } from 'react';

interface TextToolbarProps {
  onFormat: (format: string) => void;
  className?: string;
}

export default function TextToolbar({ onFormat, className = '' }: TextToolbarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const formats = [
    { label: 'Bold', value: 'bold', icon: 'B' },
    { label: 'Italic', value: 'italic', icon: 'I' },
    { label: 'Underline', value: 'underline', icon: 'U' },
    { label: 'Strikethrough', value: 'strikethrough', icon: 'S' },
    { label: 'Code', value: 'code', icon: '<>' },
  ];

  return (
    <div className={`flex items-center space-x-1 bg-white/90 border border-gray-300/70 rounded-md shadow-sm p-1 ${className}`}>
      {formats.map((format) => (
        <button
          key={format.value}
          onClick={() => {
            onFormat(format.value);
          }}
          className="p-1.5 text-gray-700 hover:bg-gray-100 rounded-md transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500"
          title={format.label}
        >
          <span className={`font-${format.value === 'bold' ? 'bold' : 'normal'} ${format.value === 'italic' ? 'italic' : ''} ${format.value === 'underline' ? 'underline' : ''} ${format.value === 'strikethrough' ? 'line-through' : ''} ${format.value === 'code' ? 'font-mono' : ''}`}>
            {format.icon}
          </span>
        </button>
      ))}
    </div>
  );
} 