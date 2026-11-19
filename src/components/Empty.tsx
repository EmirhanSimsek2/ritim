import type { ReactNode } from 'react';
import { Leaf } from 'lucide-react';

export default function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <Leaf size={24} />
      <p>{children}</p>
    </div>
  );
}
