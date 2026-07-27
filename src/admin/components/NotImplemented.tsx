import { Wrench } from 'lucide-react';

interface NotImplementedProps {
  name: string;
  phase: string;
}

export function NotImplemented({ name, phase }: NotImplementedProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4">
      <Wrench className="w-20 h-20 text-gray-600 mb-6" />
      <h2 className="text-2xl font-semibold text-gray-300 mb-2">{name}</h2>
      <p className="text-gray-500 text-center max-w-md">
        This module will be implemented in <span className="text-emerald-400 font-medium">Phase {phase}</span>.
        Check back after the next deployment.
      </p>
    </div>
  );
}
